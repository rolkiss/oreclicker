// Interfaz de los retos especiales: la ventana con la lista (se abre desde el panel de Renacer), el cartel del
// reto en curso sobre la zona de juego y los avisos al ganar, fallar o abandonar. La lógica está en challenges.js.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);
  const ARM_MS = 4000; // "¿Seguro?" de empezar o abandonar un reto

  const els = {};
  const cards = {}; // id → { root, name, rules, goal, reward, status, button }
  const armed = { id: null, timer: null }; // botón de la lista pendiente de confirmar
  let bannerArmed = false;
  let bannerTimer = null;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const time = (seconds) => Game.formatDuration(seconds);

  // ── Textos de cada reto (se componen con sus reglas) ──────
  function rulesText(c) {
    const lines = [];
    const r = c.rules;
    if (r.noProducers) lines.push(tr('challenge.rule.noProducers'));
    if (r.maxProducers !== undefined) lines.push(tr('challenge.rule.maxProducers', { n: r.maxProducers }));
    if (r.noUpgrades) lines.push(tr('challenge.rule.noUpgrades'));
    if (r.costGrowth) lines.push(tr('challenge.rule.costGrowth', { n: formatNumber(r.costGrowth) }));
    if (c.limit) lines.push(tr('challenge.rule.limit', { time: time(c.limit) }));
    return lines.join(' · ') || tr('challenge.rule.none');
  }

  function goalText(c) {
    if (c.earned !== undefined) return tr('challenge.goalEarned', { n: formatNumber(c.earned) });
    const m = Game.minerals[c.goalIndex];
    return tr('challenge.goalMineral', { icon: m.icon, name: Game.mineralName(m) });
  }

  function rewardText(c) {
    const { type, value } = c.reward;
    const key = 'challenge.reward.' + type;
    switch (type) {
      case 'costMult': return tr(key, { n: Math.round((1 - value) * 100) });
      case 'goldenRate': return tr(key, { n: Math.round((1 - value) * 100) });
      case 'offlineRate': return tr(key, { n: Math.round(value * 100) });
      case 'globalMult': return tr(key, { n: Math.round((value - 1) * 100) });
      default: return tr(key, { n: formatNumber(value) });
    }
  }

  // ── Construcción ──────────────────────────────────────────
  function init() {
    for (const id of ['challenges', 'challenges-open', 'challenges-close', 'challenges-list', 'challenges-note',
                      'challenge-banner', 'challenge-text', 'challenge-abandon']) {
      els[id] = $(id);
    }
    els.stage = document.querySelector('.stage');

    for (const c of Game.challenges) {
      const root = el('div', 'challenge');
      const head = el('div', 'challenge-head');
      const icon = el('span', 'challenge-icon', c.icon);
      const name = el('span', 'challenge-name');
      head.append(icon, name);
      const rules = el('p', 'challenge-line');
      const goal = el('p', 'challenge-line challenge-goal');
      const reward = el('p', 'challenge-line challenge-reward');
      const foot = el('div', 'challenge-foot');
      const status = el('span', 'challenge-status');
      const button = el('button', 'btn');
      button.type = 'button';
      button.addEventListener('click', () => onCardButton(c.id));
      foot.append(status, button);
      root.append(head, rules, goal, reward, foot);
      cards[c.id] = { root, name, rules, goal, reward, status, button };
      els['challenges-list'].append(root);
    }

    els['challenges-open'].addEventListener('click', open);
    els['challenges-close'].addEventListener('click', () => Game.ui.closeModal(els.challenges));
    els['challenge-abandon'].addEventListener('click', onBannerAbandon);
    Game.ui.onRender(render);
  }

  function open() {
    disarm();
    renderContent();
    Game.ui.openModal(els.challenges, els['challenges-close']);
  }

  // ── Acciones (con doble clic para confirmar) ──────────────
  function disarm() {
    clearTimeout(armed.timer);
    armed.id = null;
  }

  function onCardButton(id) {
    if (Game.getActiveChallenge()) return; // con uno en curso no se puede empezar otro
    if (armed.id !== id) {
      disarm();
      armed.id = id;
      armed.timer = setTimeout(() => { disarm(); renderContent(); }, ARM_MS);
      renderContent();
      return;
    }
    disarm();
    if (!Game.startChallenge(id)) return;
    Game.storage.save();
    Game.ui.reload();
    Game.ui.closeModal(els.challenges);
    Game.ui.closeModal($('prestige')); // se abrió desde el panel de Renacer: se vuelve directo al juego
    Game.sound.play('unlock');
    renderContent();
  }

  function onBannerAbandon() {
    if (!bannerArmed) {
      bannerArmed = true;
      els['challenge-abandon'].classList.add('armed');
      bannerTimer = setTimeout(() => { bannerArmed = false; els['challenge-abandon'].classList.remove('armed'); render(); }, ARM_MS);
      render();
      return;
    }
    clearTimeout(bannerTimer);
    bannerArmed = false;
    els['challenge-abandon'].classList.remove('armed');
    Game.abandonChallenge();
    Game.storage.save();
  }

  // ── Avisos (los llama main.js con lo que dejó la lógica) ──
  function announce(events) {
    for (const e of events) {
      const c = Game.challengeById[e.id];
      const name = tr('challenge.' + c.id);
      Game.ui.reload(); // la vuelta guardada vuelve: se repinta todo sin celebrarlo como un mineral nuevo
      if (e.type === 'won') {
        Game.sound.play('unlock');
        Game.ui.celebrate();
        const record = !e.first && e.seconds <= e.best ? ' · ' + tr('challenge.record') : '';
        Game.ui.notify(tr('challenge.won', { name }), tr('challenge.wonSub', { time: time(e.seconds), reward: rewardText(c) }) + record);
      } else if (e.type === 'failed') {
        Game.sound.play('buy');
        Game.ui.notify(tr('challenge.failed', { name }), tr('challenge.failedSub'));
      } else {
        Game.ui.notify(tr('challenge.abandoned'), name);
      }
    }
    Game.storage.save();
  }

  // ── Pintado ───────────────────────────────────────────────
  // Se llama 10 veces por segundo con la interfaz: el cartel siempre, la lista solo si está abierta.
  function render() {
    const c = Game.getActiveChallenge();
    els['challenge-banner'].hidden = !c;
    els.stage.classList.toggle('in-challenge', !!c);
    if (c) {
      const p = Game.getChallengeProgress();
      const left = p.remaining !== null ? ' · ' + tr('challenge.timeLeft', { time: time(Math.ceil(p.remaining)) }) : ' · ' + time(p.elapsed);
      setText(els['challenge-text'], tr('challenge.banner', { name: tr('challenge.' + c.id), goal: goalText(c) }) + left);
      setText(els['challenge-abandon'], tr(bannerArmed ? 'challenges.abandonConfirm' : 'challenges.abandon'));
    }
    if (!els.challenges.hidden) renderContent();
  }

  function renderContent() {
    const active = Game.getActiveChallenge();
    setText(els['challenges-note'], tr('challenges.hint'));
    for (const c of Game.challenges) {
      const card = cards[c.id];
      const done = Game.isChallengeDone(c.id);
      card.root.classList.toggle('done', done);
      card.root.classList.toggle('active', !!active && active.id === c.id);
      setText(card.name, tr('challenge.' + c.id));
      setText(card.rules, rulesText(c));
      setText(card.goal, goalText(c));
      setText(card.reward, tr('challenge.rewardLine', { reward: rewardText(c) }));
      setText(card.status, done ? tr('challenges.done', { time: time(Game.getChallengeBest(c.id)) }) : tr('challenges.todo'));
      const isActive = !!active && active.id === c.id;
      card.button.hidden = isActive;
      card.button.setAttribute('aria-disabled', String(!!active));
      card.button.classList.toggle('armed', armed.id === c.id);
      setText(card.button, armed.id === c.id ? tr('challenges.startConfirm') : tr(done ? 'challenges.retry' : 'challenges.start'));
    }
  }

  Game.challengesPanel = { init, announce };
})(window.Game);

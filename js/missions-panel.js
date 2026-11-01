// Interfaz de las misiones: la tarjeta de misión de inicio bajo la roca, el botón 📋 y el panel de objetivos
// diarios (regalo de entrada, racha y tres objetivos). La lógica está en missions.js.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);
  const daily = config.missions.daily;

  const els = {};
  const goalRows = []; // { root, text, fill, count, reward, button }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function init() {
    for (const id of ['intro', 'intro-step', 'intro-reward', 'intro-text', 'intro-fill', 'intro-count',
                      'missions', 'missions-open', 'missions-badge', 'missions-close', 'missions-streak',
                      'gift-text', 'gift-claim', 'goal-list', 'missions-all', 'missions-reset']) {
      els[id] = $(id);
    }

    for (let i = 0; i < daily.count; i++) {
      const root = el('div', 'goal');
      const head = el('div', 'goal-head');
      const text = el('span', 'goal-text');
      const reward = el('span', 'goal-reward');
      head.append(text, reward);
      const bar = el('div', 'goal-bar');
      const fill = el('div', 'goal-fill');
      bar.append(fill);
      const foot = el('div', 'goal-foot');
      const count = el('span', 'goal-count');
      const button = el('button', 'btn goal-claim');
      button.type = 'button';
      button.addEventListener('click', () => claimGoal(i));
      foot.append(count, button);
      root.append(head, bar, foot);
      goalRows.push({ root, text, fill, count, reward, button });
      els['goal-list'].append(root);
    }

    els['gift-claim'].addEventListener('click', claimGift);
    els['missions-open'].addEventListener('click', open);
    els['missions-close'].addEventListener('click', () => Game.ui.closeModal(els.missions));
    Game.ui.onRender(render);
  }

  function open() {
    renderContent();
    Game.ui.openModal(els.missions, els['missions-close']);
  }

  // ── Acciones ──────────────────────────────────────────────
  function paid() {
    Game.sound.play('buy');
    Game.storage.save();
    Game.ui.render();
  }

  function claimGoal(index) {
    const result = Game.claimGoal(index);
    if (!result) return;
    Game.achievementsPanel.toast(tr('missions.toastClaimed', { n: formatNumber(Math.floor(result.amount)) }));
    if (result.bonus > 0) Game.achievementsPanel.toast(tr('missions.toastBonus', { n: formatNumber(Math.floor(result.bonus)) }));
    paid();
  }

  function claimGift() {
    const result = Game.claimGift();
    if (!result) return;
    Game.achievementsPanel.toast(tr('missions.toastClaimed', { n: formatNumber(Math.floor(result.amount)) }));
    paid();
  }

  // ── Avisos (los llama main.js) ────────────────────────────
  // Misiones de inicio cumplidas (puede haber varias a la vez).
  function announceIntro(done) {
    Game.sound.play('achievement');
    for (const mission of done) Game.achievementsPanel.toast(tr('intro.done', { n: formatNumber(mission.cash) }));
    if (Game.isIntroDone()) Game.achievementsPanel.toast(tr('intro.finished'));
  }

  // Empezó un día nuevo: regalo y objetivos listos (no se avisa mientras dura el recorrido de inicio).
  function announceDay() {
    if (!Game.isIntroDone()) return;
    Game.sound.play('achievement');
    Game.achievementsPanel.toast(tr('missions.newDay', { n: Game.state.missions.streak }));
  }

  // ── Pintado ───────────────────────────────────────────────
  // Se llama 10 veces por segundo con la interfaz: lo barato siempre, el panel solo si está abierto.
  function render() {
    renderIntro();
    const ready = Game.isIntroDone();
    els['missions-open'].hidden = !ready;
    const claimable = ready ? Game.countClaimable() : 0;
    els['missions-badge'].hidden = claimable < 1;
    setText(els['missions-badge'], String(claimable));
    if (!els.missions.hidden) renderContent();
  }

  function renderIntro() {
    const mission = Game.getIntroMission();
    els.intro.hidden = !mission;
    if (!mission) return;
    const progress = Game.getIntroProgress(mission);
    const total = Game.introMissions.length;
    setText(els['intro-step'], tr('intro.step', { i: Game.state.missions.intro + 1, n: total }));
    setText(els['intro-reward'], tr('intro.reward', { n: formatNumber(mission.cash) }));
    setText(els['intro-text'], tr('intro.' + mission.id, { n: formatNumber(mission.clicks || 0) }));
    els['intro-fill'].style.width = (progress.fraction * 100).toFixed(1) + '%';
    setText(els['intro-count'], formatNumber(Math.floor(progress.have)) + ' / ' + formatNumber(progress.need));
  }

  // Segundos hasta la próxima medianoche local.
  function secondsToMidnight() {
    const now = new Date(Game.obtenerHora());
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(0, (next - now) / 1000);
  }

  function renderContent() {
    const m = Game.state.missions;

    setText(els['missions-streak'], tr('missions.streak', { n: m.streak }));
    const days = Game.getGiftMultiplier();
    const canGift = Game.canClaimGift();
    setText(els['gift-text'], tr('missions.gift', { n: days }));
    els['gift-claim'].setAttribute('aria-disabled', String(!canGift));
    els['gift-claim'].classList.toggle('can-buy', canGift);
    setText(els['gift-claim'], canGift
      ? tr('missions.giftClaim', { n: formatNumber(Math.floor(Game.getGiftAmount())) })
      : tr('missions.giftDone'));

    m.goals.forEach((goal, i) => {
      const row = goalRows[i];
      row.root.hidden = false;
      const progress = Game.getGoalProgress(goal);
      const def = progress.def;
      const need = def.counter === 'play' ? Math.round(def.target / 60) : def.target;
      setText(row.text, tr('goal.' + def.counter, { n: formatNumber(need) }));
      setText(row.reward, tr('missions.reward', { n: formatNumber(Math.floor(Game.getRewardAmount(def.seconds, def.minClicks))) }));
      row.fill.style.width = (progress.fraction * 100).toFixed(1) + '%';
      row.root.classList.toggle('done', progress.done);
      const shown = def.counter === 'play'
        ? Game.formatDuration(progress.have) + ' / ' + Game.formatDuration(progress.need)
        : formatNumber(Math.floor(progress.have)) + ' / ' + formatNumber(progress.need);
      setText(row.count, shown);
      const claimable = Game.canClaimGoal(i);
      row.button.hidden = !progress.done;
      row.button.classList.toggle('can-buy', claimable);
      row.button.setAttribute('aria-disabled', String(!claimable));
      setText(row.button, goal.claimed ? tr('missions.claimed') : tr('missions.claim'));
    });
    for (let i = m.goals.length; i < goalRows.length; i++) goalRows[i].root.hidden = true;

    const bonus = Game.getRewardAmount(daily.allBonus.seconds, daily.allBonus.minClicks);
    setText(els['missions-all'], m.allClaimed ? tr('missions.allDone') : tr('missions.all', { n: formatNumber(Math.floor(bonus)) }));
    setText(els['missions-reset'], tr('missions.reset', { time: Game.formatDuration(secondsToMidnight()) }));
  }

  Game.missionsPanel = { init, announceIntro, announceDay };
})(window.Game);

// Panel de renacer (botón 🔄): objetivo, Núcleos que darías, árbol de habilidades permanentes y hitos.
(function (Game) {
  const { config, formatNumber } = Game;
  const cfg = config.prestige;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);
  const ARM_MS = 4000; // el botón de renacer pide confirmar y se desarma solo pasado este tiempo

  const els = {};
  const skillItems = {}; // id → { root, icon, name, sub, cost }
  const milestoneItems = []; // { node, unlock }
  let wasReady = null; // si el renacer estaba disponible en el render anterior (null = aún no se sabe)
  let armed = false;
  let armTimer = null;

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const mineralLabel = (index) => Game.minerals[index].icon + ' ' + Game.mineralName(Game.minerals[index]);

  function init() {
    for (const id of ['prestige', 'prestige-open', 'prestige-badge', 'prestige-close', 'prestige-cores',
                      'prestige-count', 'prestige-goal', 'prestige-gain', 'prestige-next',
                      'prestige-compare', 'prestige-do', 'prestige-skills', 'prestige-milestones']) {
      els[id] = $(id);
    }

    for (const skill of Game.skills) {
      const root = el('button', 'item skill');
      root.type = 'button';
      root.dataset.id = skill.id;
      const icon = el('span', 'item-icon', skill.icon);
      const body = el('span', 'item-body');
      const name = el('span', 'item-name');
      const sub = el('span', 'item-sub');
      const cost = el('span', 'item-cost');
      body.append(name, sub, cost);
      root.append(icon, body);
      skillItems[skill.id] = { root, icon, name, sub, cost };
      els['prestige-skills'].append(root);
    }

    for (const unlock of cfg.unlocks) {
      const node = el('li', 'milestone');
      milestoneItems.push({ node, unlock });
      els['prestige-milestones'].append(node);
    }

    els['prestige-skills'].addEventListener('click', (e) => {
      const node = e.target.closest('.skill');
      if (!node || !Game.buySkill(node.dataset.id)) return; // la lógica decide si se puede pagar
      Game.sound.play('buy');
      node.classList.remove('bought');
      void node.offsetWidth;
      node.classList.add('bought');
      Game.ui.render();
      Game.storage.save();
    });

    els['prestige-do'].addEventListener('click', onDoClick);
    els['prestige-open'].addEventListener('click', open);
    els['prestige-close'].addEventListener('click', () => Game.ui.closeModal(els.prestige));
    Game.ui.onRender(render);
  }

  function open() {
    disarm();
    renderContent();
    Game.ui.openModal(els.prestige, els['prestige-close']);
  }

  // ── Renacer ───────────────────────────────────────────────
  function disarm() {
    armed = false;
    clearTimeout(armTimer);
    els['prestige-do'].classList.remove('armed');
  }

  function onDoClick() {
    if (!Game.canPrestige()) return;
    if (!armed) {
      armed = true;
      els['prestige-do'].classList.add('armed');
      armTimer = setTimeout(() => { disarm(); renderContent(); }, ARM_MS);
      renderContent();
      return;
    }
    disarm();
    const result = Game.prestigeNow();
    if (!result) return;
    Game.storage.save();
    Game.ui.reload(); // vuelve a pintar todo sin celebrar el cambio de mineral como un desbloqueo
    Game.sound.play('unlock');
    Game.ui.celebrate();
    wasReady = false;
    Game.ui.notify(tr('prestige.reached', { icon: cfg.coreIcon, n: result.gain }), tr('prestige.reachedSub', { count: Game.state.prestige.count }));
    Game.summaryPanel.show(result); // el resumen de la vuelta: comparación con la anterior y Núcleos
    renderContent();
  }

  // ── Texto de cada habilidad ───────────────────────────────
  function describeSkill(skill, levelIndex) {
    const value = skill.levels[levelIndex].value;
    const key = 'skill.effect.' + skill.type;
    switch (skill.type) {
      case 'costMult': return tr(key, { n: Math.round((1 - value) * 100) });
      case 'offlineRate': return tr(key, { n: Math.round((config.offline.rate + value) * 100) });
      case 'prestigeMult': return tr(key, { n: Math.round(value * 100) });
      case 'goldenRate': return tr(key, { n: Math.round((1 - value) * 100) });
      case 'critChance': return tr(key, { n: Math.round(value * 100) });
      case 'startProducers':
        return tr(key, { list: Object.keys(value).map((id) => value[id] + ' × ' + Game.producerName(id)).join(', ') });
      default: return tr(key, { n: formatNumber(value) });
    }
  }

  // ── Pintado ───────────────────────────────────────────────
  // Se llama 10 veces por segundo con la interfaz: lo barato siempre, el panel solo si está abierto.
  function render() {
    const p = Game.state.prestige;
    const visible = p.unlocked || p.count > 0 || p.cores > 0;
    els['prestige-open'].hidden = !visible;

    const ready = Game.canPrestige();
    els['prestige-open'].classList.toggle('ready', ready);
    els['prestige-badge'].hidden = p.cores < 1;
    setText(els['prestige-badge'], formatNumber(p.cores));

    // Aviso cuando se llega al mineral exigido durante la partida (no al cargar una ya avanzada).
    if (wasReady === false && ready && els.prestige.hidden) {
      Game.sound.play('achievement');
      Game.ui.notify(tr('prestige.readyToast'), tr('prestige.readyToastSub'));
    }
    wasReady = ready;

    if (!els.prestige.hidden) renderContent();
  }

  function renderContent() {
    const p = Game.state.prestige;
    const target = Game.getPrestigeTarget();
    const ready = Game.canPrestige();
    const gain = Game.getPrestigeGain();

    setText(els['prestige-cores'], cfg.coreIcon + ' ' + formatNumber(p.cores));
    setText(els['prestige-count'], formatNumber(p.count));

    const inChallenge = Game.isClean();
    setText(els['prestige-goal'], inChallenge ? tr('prestige.inChallenge') : ready
      ? tr('prestige.ready', { icon: Game.minerals[target].icon, name: Game.mineralName(Game.minerals[target]) })
      : tr('prestige.locked', {
        icon: Game.minerals[target].icon,
        name: Game.mineralName(Game.minerals[target]),
        icon2: Game.minerals[Game.getMineralIndex()].icon,
        current: Game.mineralName(Game.minerals[Game.getMineralIndex()]),
      }));
    els['prestige-gain'].hidden = !ready || inChallenge;
    setText(els['prestige-gain'], ready
      ? tr('prestige.gain', { core: cfg.coreIcon, n: gain, cap: Game.getCoreCap() })
      : '');

    // Cómo ganar más Núcleos: llegar más lejos, o esperar a que suba el tope.
    const next = Game.getNextCoreMineral();
    const lines = [];
    if (ready && next !== null) lines.push(tr('prestige.nextCore', { icon: Game.minerals[next].icon, name: Game.mineralName(Game.minerals[next]) }));
    else if (ready) lines.push(tr('prestige.capReached'));
    const tier = cfg.coreCaps.find((t) => t.from > p.count + 1);
    if (tier) lines.push(tr('prestige.capGrows', { max: tier.max, from: tier.from }));
    setText(els['prestige-next'], lines.join(' '));

    // La vuelta anterior frente a esta: es lo que enseña que renacer ha servido.
    const compare = [];
    if (p.lastRunTime >= 0 && p.lastRunMineral >= 0) {
      compare.push(tr('prestige.lastRun', {
        icon: Game.minerals[p.lastRunMineral].icon,
        name: Game.mineralName(Game.minerals[p.lastRunMineral]),
        time: Game.formatDuration(p.lastRunTime),
      }));
    }
    if (p.count > 0) compare.push(tr('prestige.thisRun', { time: Game.formatDuration(p.readyTime >= 0 ? p.readyTime : p.runTime) }));
    setText(els['prestige-compare'], compare.join(' '));

    const button = els['prestige-do'];
    button.setAttribute('aria-disabled', String(!ready));
    button.classList.toggle('can-buy', ready);
    setText(button, !ready ? tr('prestige.doLocked') : tr(armed ? 'prestige.doConfirm' : 'prestige.do'));

    for (const skill of Game.skills) renderSkill(skill);

    for (const m of milestoneItems) {
      const done = p.count >= m.unlock.at;
      m.node.classList.toggle('done', done);
      const what = m.unlock.feature
        ? tr('prestige.milestone.' + m.unlock.feature, { n: cfg.autoMiner.clicksPerSecond })
        : m.unlock.biome
          ? tr('prestige.milestone.biome', { name: Game.biomeName(Game.biomes.find((x) => x.id === m.unlock.biome)) })
          : tr('prestige.milestone.skill', { name: tr('skill.' + m.unlock.skill) });
      setText(m.node, (done ? '✅ ' : '🔒 ') + m.unlock.at + ' · ' + what);
    }
  }

  function renderSkill(skill) {
    const item = skillItems[skill.id];
    const level = Game.getSkillLevel(skill.id);
    const max = skill.levels.length;
    const unlocked = Game.isSkillUnlocked(skill.id);
    const cost = Game.getSkillCost(skill.id);
    const affordable = Game.canBuySkill(skill.id);

    item.root.classList.toggle('teaser', !unlocked);
    item.root.classList.toggle('owned', level === max);
    setText(item.name, tr('skill.' + skill.id));
    // Se enseña lo que daría el siguiente nivel (o el actual si ya está al máximo).
    setText(item.sub, describeSkill(skill, Math.min(level, max - 1)));
    let costText;
    if (!unlocked) costText = tr('prestige.lockedSkill', { n: Game.getSkillUnlockAt(skill.id) });
    else if (cost === null) costText = tr('prestige.level', { n: level, max }) + ' · ' + tr('prestige.maxed');
    else costText = tr('prestige.level', { n: level, max }) + ' · ' + Game.config.prestige.coreIcon + ' ' + cost;
    setText(item.cost, costText);
    item.root.classList.toggle('can-buy', affordable);
    item.root.setAttribute('aria-disabled', String(!affordable));
  }

  Game.prestigePanel = { init };
})(window.Game);

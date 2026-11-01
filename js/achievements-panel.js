// Panel de logros y estadísticas (botón 🏆) y avisos al desbloquear un logro.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);

  const TABS = ['grid', 'milestones', 'stats', 'report'];
  const TAB_TEXT = { grid: 'ach.tabGrid', milestones: 'ach.tabMilestones', stats: 'ach.tabStats', report: 'ach.tabReport' };
  const STATS = ['playTime', 'clicks', 'earned', 'pps', 'perClick', 'mineral', 'mineralValue',
                 'producers', 'upgrades', 'achievements', 'offline'];

  const els = {};
  const medals = {}; // id → { root, icon, name, desc }
  const statRows = {}; // clave → { label, value }
  const milestoneRows = {}; // id → { root, name, desc, state }
  const reportRows = { parts: {}, producers: {}, click: null }; // filas { root, label, value } del informe
  const tabButtons = []; // { node, id }
  let tab = 'grid';

  const toastQueue = []; // textos pendientes de enseñar, uno cada vez
  let toastBusy = false;

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
    for (const id of ['achievements', 'achievements-open', 'ach-close', 'ach-tabs', 'ach-grid-view',
                      'ach-summary', 'ach-hint', 'ach-grid', 'ach-stats', 'ach-toast', 'ach-milestones', 'ach-report', 'ach-share']) {
      els[id] = $(id);
    }

    for (const id of TABS) {
      const node = el('button', 'seg-btn');
      node.type = 'button';
      node.addEventListener('click', () => {
        tab = id;
        renderContent();
      });
      tabButtons.push({ node, id });
      els['ach-tabs'].append(node);
    }

    // Las medallas se crean una vez; luego solo cambian de estado y de idioma.
    for (const a of Game.achievements) {
      const root = el('div', 'medal');
      const icon = el('span', 'medal-icon', a.icon);
      const body = el('span', 'medal-body');
      const name = el('span', 'medal-name');
      const desc = el('span', 'medal-desc');
      body.append(name, desc);
      root.append(icon, body);
      medals[a.id] = { root, icon, name, desc };
      els['ach-grid'].append(root);
    }

    for (const key of STATS) {
      const row = el('div', 'stat-row');
      const label = el('dt', 'stat-name');
      const value = el('dd', 'stat-figure');
      row.append(label, value);
      statRows[key] = { label, value };
      els['ach-stats'].append(row);
    }

    for (const m of Game.milestones) {
      const root = el('li', 'milestone-row');
      const icon = el('span', 'medal-icon', m.icon);
      const body = el('span', 'medal-body');
      const name = el('span', 'medal-name');
      const desc = el('span', 'medal-desc');
      body.append(name, desc);
      const state = el('span', 'milestone-state');
      root.append(icon, body, state);
      milestoneRows[m.id] = { root, name, desc, state };
      els['ach-milestones'].append(root);
    }

    buildReport();

    els['achievements-open'].addEventListener('click', open);
    els['ach-close'].addEventListener('click', () => Game.ui.closeModal(els.achievements));
    Game.ui.onRender(render);
  }

  function open() {
    renderContent();
    Game.ui.openModal(els.achievements, els['ach-close']);
  }

  // Se repinta con la interfaz (10 veces por segundo) pero solo si el panel está abierto.
  function render() {
    if (!els.achievements.hidden) renderContent();
  }

  function renderContent() {
    const hasReport = Game.hasFeature('report'); // la pestaña de producción es una novedad del hito 'report'
    if (tab === 'report' && !hasReport) tab = 'grid';
    for (const b of tabButtons) {
      setText(b.node, tr(TAB_TEXT[b.id]));
      b.node.setAttribute('aria-pressed', String(b.id === tab));
      b.node.hidden = b.id === 'report' && !hasReport;
    }
    els['ach-grid-view'].hidden = tab !== 'grid';
    els['ach-milestones'].hidden = tab !== 'milestones';
    els['ach-stats'].hidden = tab !== 'stats';
    els['ach-report'].hidden = tab !== 'report';
    els['ach-share'].hidden = tab !== 'stats'; // la tarjeta compartible se abre desde las estadísticas
    if (tab === 'grid') renderGrid();
    else if (tab === 'milestones') renderMilestones();
    else if (tab === 'report') renderReport();
    else renderStats();
  }

  // ── Hitos ─────────────────────────────────────────────────
  function renderMilestones() {
    const params = { chance: Math.round(config.crit.chance * 100), mult: config.crit.mult };
    for (const m of Game.milestones) {
      const row = milestoneRows[m.id];
      const done = Game.hasMilestone(m.id);
      const at = Game.minerals[m.index];
      row.root.classList.toggle('done', done);
      setText(row.name, tr('milestone.' + m.id));
      setText(row.desc, tr('milestone.' + m.id + '.desc', params));
      setText(row.state, done ? '✅' : tr('milestone.at', { icon: at.icon, name: Game.mineralName(at) }));
    }
  }

  // Un aviso suelto en la cola de avisos de abajo (lo usan las misiones).
  function toast(text) {
    toastQueue.push(text);
    nextToast();
  }

  // Más de 3 a la vez (p. ej. al cargar una partida antigua) se resumen en un solo aviso.
  function announceMilestones(reached) {
    const shown = reached.filter((m) => m.toast !== false);
    if (!shown.length) return;
    Game.sound.play('achievement');
    if (shown.length > 3) {
      toastQueue.push(tr('milestone.toastMany', { n: shown.length }));
    } else {
      for (const m of shown) toastQueue.push(tr('milestone.toast', { icon: m.icon, name: tr('milestone.' + m.id) }));
    }
    nextToast();
  }

  // ── Informe de producción (se abre con el hito 'report') ──
  function reportRow(list, label) {
    const root = el('div', 'stat-row');
    const name = el('dt', 'stat-name', label);
    const value = el('dd', 'stat-figure');
    root.append(name, value);
    list.append(root);
    return { root, label: name, value };
  }

  function buildReport() {
    const mk = (titleKey) => {
      const title = el('h3', 'opt-title');
      title.dataset.key = titleKey;
      const list = el('dl', 'stats');
      els['ach-report'].append(title, list);
      return { title, list };
    };
    const multipliers = mk('report.multipliers');
    for (const key of ['mineral', 'upgrades', 'achievements', 'prestige', 'dex', 'catalog', 'challenge', 'boost', 'total']) reportRows.parts[key] = reportRow(multipliers.list, '');
    const producers = mk('report.producers');
    for (const p of config.producers) reportRows.producers[p.id] = reportRow(producers.list, '');
    reportRows.click = reportRow(producers.list, '');
    reportRows.titles = [multipliers.title, producers.title];
  }

  function renderReport() {
    for (const title of reportRows.titles) setText(title, tr(title.dataset.key));
    const parts = Game.getMultiplierParts();
    parts.total = parts.upgrades * parts.mineral * parts.achievements * parts.prestige * parts.dex * parts.catalog * parts.challenge * parts.boost;
    for (const key of Object.keys(reportRows.parts)) {
      const row = reportRows.parts[key];
      setText(row.label, tr('report.' + key));
      setText(row.value, '×' + formatNumber(parts[key]));
      row.root.classList.toggle('total', key === 'total');
    }

    const pps = Game.getPps();
    for (const p of config.producers) {
      const row = reportRows.producers[p.id];
      const owned = Game.state.producers[p.id];
      row.root.hidden = owned < 1;
      if (owned < 1) continue;
      const output = Game.getProducerOutput(p.id);
      setText(row.label, p.icon + ' ' + Game.producerName(p.id) + ' × ' + formatNumber(owned));
      setText(row.value, formatNumber(output) + '/s · ' + (pps > 0 ? Math.round(output / pps * 100) : 0) + '%');
    }
    setText(reportRows.click.label, tr('report.click'));
    setText(reportRows.click.value, formatNumber(Game.getClickValue()));
  }

  function renderGrid() {
    const { per, bonus } = config.achievementBonus;
    const bonusPercent = (Game.getAchievementMultiplier() - 1) * 100;

    setText(els['ach-summary'], tr('ach.progress', { done: Game.getAchievementCount(), total: Game.achievements.length })
      + ' · ' + tr('ach.bonus', { n: formatNumber(Math.round(bonusPercent * 10) / 10) }));
    setText(els['ach-hint'], tr('ach.bonusHint', { per, pct: formatNumber(bonus * 100) }));

    for (const a of Game.achievements) {
      const medal = medals[a.id];
      const done = !!Game.state.achievements[a.id];
      medal.root.classList.toggle('done', done);
      setText(medal.name, tr('ach.' + a.id));
      setText(medal.desc, Game.describeAchievement(a));
    }
  }

  function renderStats() {
    const s = Game.state;
    const m = Game.minerals[Game.getMineralIndex()];
    const units = Object.values(s.producers).reduce((sum, n) => sum + n, 0);

    const values = {
      playTime: Game.formatDuration(s.playTime),
      clicks: formatNumber(s.totalClicks),
      earned: formatNumber(s.totalEarned),
      pps: formatNumber(Game.getPps()),
      perClick: formatNumber(Game.getClickValue()),
      mineral: m.icon + ' ' + Game.mineralName(m) + ' (' + (Game.getMineralIndex() + 1) + (Game.getMineralIndex() >= Game.realMineralCount ? '' : '/' + Game.realMineralCount) + ')',
      mineralValue: '×' + formatNumber(m.value),
      producers: formatNumber(units),
      upgrades: Object.keys(s.upgrades).length + ' / ' + Game.upgrades.length,
      achievements: Game.getAchievementCount() + ' / ' + Game.achievements.length,
      offline: formatNumber(s.offlineReturns),
    };
    for (const key of STATS) {
      setText(statRows[key].label, tr('stats.' + key));
      setText(statRows[key].value, values[key]);
    }
  }

  // ── Avisos ────────────────────────────────────────────────
  // Más de 3 a la vez (p. ej. al cargar una partida antigua) se resumen en un solo aviso.
  function announce(unlocked) {
    Game.sound.play('achievement');
    if (unlocked.length > 3) {
      toastQueue.push(tr('ach.toastMany', { n: unlocked.length }));
    } else {
      for (const a of unlocked) toastQueue.push(tr('ach.toast', { name: tr('ach.' + a.id) }));
    }
    nextToast();
  }

  function nextToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    const node = els['ach-toast'];
    node.textContent = toastQueue.shift();
    node.classList.remove('show');
    void node.offsetWidth; // reinicia la animación
    node.classList.add('show');
    node.hidden = false;
    setTimeout(() => {
      node.hidden = true;
      toastBusy = false;
      nextToast();
    }, config.ui.achToastMs);
  }

  Game.achievementsPanel = { init, announce, announceMilestones, toast };
})(window.Game);

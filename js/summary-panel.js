// Resumen al renacer: la ventana que sale al terminar una vuelta, con sus cifras comparadas con la anterior,
// los Núcleos ganados y accesos a gastarlos o a compartir la tarjeta. Los datos los prepara prestige.js.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);

  // Cifras que se enseñan, en orden. `lowerIsBetter`: menos es mejor (el tiempo). `hideIfZero`: solo si pasó algo.
  const ROWS = [
    { key: 'ready', lowerIsBetter: true },
    { key: 'time', lowerIsBetter: true },
    { key: 'mineral' },
    { key: 'earned' },
    { key: 'pps' },
    { key: 'clicks', hideIfZero: true },
    { key: 'bought', hideIfZero: true },
    { key: 'crits', hideIfZero: true },
    { key: 'goldens', hideIfZero: true },
  ];

  const els = {};
  const rows = {}; // key → { root, label, value, change }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function init() {
    for (const id of ['summary', 'summary-title', 'summary-highlight', 'summary-grid', 'summary-cores',
                      'summary-spend', 'summary-share', 'summary-close']) {
      els[id] = $(id);
    }
    for (const row of ROWS) {
      const root = el('div', 'summary-row');
      const label = el('span', 'summary-label');
      const value = el('span', 'summary-value');
      const change = el('span', 'summary-change');
      root.append(label, value, change);
      rows[row.key] = { root, label, value, change };
      els['summary-grid'].append(root);
    }
    els['summary-spend'].addEventListener('click', () => Game.ui.closeModal(els.summary)); // el panel de Renacer queda debajo
    els['summary-share'].addEventListener('click', () => Game.shareUi.open());
    els['summary-close'].addEventListener('click', () => {
      Game.ui.closeModal(els.summary);
      Game.ui.closeModal($('prestige'));
    });
  }

  // Valor de una cifra del resumen, con el formato que le toca.
  function format(key, summary) {
    switch (key) {
      case 'ready': return summary.ready >= 0 ? Game.formatDuration(summary.ready) : '—';
      case 'time': return Game.formatDuration(summary.time);
      case 'mineral': return Game.minerals[summary.mineral].icon + ' ' + Game.mineralName(Game.minerals[summary.mineral]);
      case 'pps': return formatNumber(summary.pps) + '/s';
      default: return formatNumber(summary[key]);
    }
  }

  // Texto y clase (good / bad) del cambio respecto a la vuelta anterior.
  function describeChange(key, lowerIsBetter, comparison, summary, previous) {
    if (comparison.first) return null;
    if (key === 'mineral') {
      const d = comparison.deeper;
      return d === 0 ? { text: '=', kind: '' } : { text: (d > 0 ? '▲ +' : '▼ ') + d, kind: d > 0 ? 'good' : 'bad' };
    }
    const c = comparison.changes[key];
    if (c === null || Math.abs(c) < 0.005) return c === null ? null : { text: '=', kind: '' };
    const better = lowerIsBetter ? c < 0 : c > 0;
    // Los saltos enormes (más de ×10) se dicen como veces, no como un porcentaje de cinco cifras.
    const amount = c >= 9 ? '×' + formatNumber(Math.round(1 + c)) : Math.round(Math.abs(c) * 100) + '%';
    return { text: (c > 0 ? '▲ ' : '▼ ') + amount, kind: better ? 'good' : 'bad' };
  }

  // Enseña el resumen de lo que devolvió Game.prestigeNow().
  function show(result) {
    const { summary, previous } = result;
    const comparison = Game.getRunComparison(summary, previous);

    setText(els['summary-title'], tr('summary.title', { n: summary.count }));
    let highlight;
    if (comparison.first) highlight = tr('summary.first');
    else if (comparison.faster !== null) highlight = tr('summary.faster', { pct: Math.round(comparison.faster * 100) });
    else if (comparison.deeper > 0) highlight = tr('summary.deeper', { n: comparison.deeper });
    else if (comparison.deeper === 0) highlight = tr('summary.same');
    else highlight = tr('summary.shallower', { n: -comparison.deeper });
    setText(els['summary-highlight'], highlight);

    for (const row of ROWS) {
      const view = rows[row.key];
      const hide = row.hideIfZero && summary[row.key] === 0 && (!previous || previous[row.key] === 0);
      view.root.hidden = hide;
      if (hide) continue;
      setText(view.label, tr('summary.' + row.key));
      setText(view.value, format(row.key, summary));
      const change = describeChange(row.key, !!row.lowerIsBetter, comparison, summary, previous);
      setText(view.change, change ? change.text : '');
      view.change.className = 'summary-change' + (change && change.kind ? ' ' + change.kind : '');
      view.root.title = previous ? tr('summary.before', { value: format(row.key, previous) }) : '';
    }

    setText(els['summary-cores'], tr('summary.cores', {
      icon: config.prestige.coreIcon, gain: summary.gain, total: Game.state.prestige.cores,
    }));
    els['summary-spend'].hidden = Game.state.prestige.cores < 1;
    Game.ui.openModal(els.summary, els['summary-spend'].hidden ? els['summary-close'] : els['summary-spend']);
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  Game.summaryPanel = { init, show };
})(window.Game);

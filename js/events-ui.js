// Parte visual de los eventos: el mineral dorado que cruza la pantalla y el
// indicador de frenesí. La lógica está en events.js; aquí solo se pinta y se recoge el toque.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);
  const cfg = config.events;

  const els = {};
  let goldenNode = null; // el botón dorado que se ve ahora
  let shownGolden = 0;   // id del dorado que se está enseñando

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function init() {
    for (const id of ['golden-layer', 'boost']) els[id] = $(id);
    els.app = document.querySelector('.app');
    els['golden-layer'].addEventListener('click', (e) => {
      const node = e.target.closest('.golden');
      if (node) collect(node);
    });
    Game.ui.onRender(render);
  }

  // ── Mineral dorado ────────────────────────────────────────
  function showGolden(golden) {
    removeGolden();
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'golden' + (Math.random() < 0.5 ? ' rtl' : '');
    node.textContent = '✨';
    node.setAttribute('aria-label', tr('golden.aria'));
    node.style.setProperty('--y', (12 + Math.random() * 55).toFixed(0) + '%');
    node.style.setProperty('--cross', cfg.golden.lifetime + 's');
    els['golden-layer'].append(node);
    goldenNode = node;
    shownGolden = golden.id;
    Game.sound.play('achievement'); // un destello para avisar de que ha salido
  }

  function removeGolden() {
    if (goldenNode) goldenNode.remove();
    goldenNode = null;
  }

  function collect(node) {
    const result = Game.collectGolden();
    if (!result) return;
    Game.sound.play('unlock');
    Game.ui.celebrate();
    node.classList.add('popped');
    setTimeout(() => node.remove(), 300);
    goldenNode = null;
    Game.ui.notify(tr('golden.title'), result.kind === 'frenzy'
      ? tr('golden.frenzy', { n: formatNumber(result.mult), s: Math.round(result.seconds) })
      : tr('golden.lump', { n: formatNumber(Math.floor(result.amount)) }));
    Game.ui.render();
  }

  // ── Pintado (10 veces por segundo, con la interfaz) ───────
  function render() {
    const live = Game.live;

    if (live.golden) {
      if (live.golden.id !== shownGolden) showGolden(live.golden);
    } else if (goldenNode) {
      removeGolden(); // se fue sin que lo tocaran
    }

    const boosted = live.boostTime > 0;
    els.boost.hidden = !boosted;
    els.app.classList.toggle('frenzy', boosted);
    if (boosted) setText(els.boost, tr('boost.label', { n: formatNumber(live.boostMult), s: Math.ceil(live.boostTime) }));
  }

  Game.eventsUi = { init };
})(window.Game);

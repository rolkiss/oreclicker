// Panel de colecciones (botón 📖): la Mineralpedia (todos los minerales por biomas, con su dato curioso) y el
// Catálogo de maquinaria (los 50 productores por eras). Lo descubierto sale con su dato curioso y el resto
// como silueta. La lógica está en dex.js y catalog.js.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);

  const TABS = ['minerals', 'machines'];
  const els = {};
  const entries = []; // minerales: { index, root, name, meta, fact }
  const biomeRows = []; // { biome, root, name, count }
  const machines = []; // productores: { index, root, gem, name, meta, fact }
  const eraRows = []; // { era, root, name, count }
  const tabButtons = []; // { node, id }
  let tab = 'minerals';

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const percent = (bonus) => Math.round(bonus * 1000) / 10; // 0.02 → 2

  function init() {
    for (const id of ['dex', 'dex-open', 'dex-badge', 'dex-close', 'dex-title', 'dex-tabs', 'dex-progress', 'dex-fill',
                      'dex-bonus', 'dex-list', 'catalog-list']) {
      els[id] = $(id);
    }

    for (const id of TABS) {
      const node = el('button', 'seg-btn');
      node.type = 'button';
      node.addEventListener('click', () => switchTab(id));
      tabButtons.push({ node, id });
      els['dex-tabs'].append(node);
    }

    // Se crea todo una vez, agrupado; luego solo cambia de estado y de idioma.
    for (const biome of Game.biomes) {
      const head = el('div', 'dex-biome');
      const name = el('span', '');
      const count = el('span', '');
      head.append(name, count);
      biomeRows.push({ biome, root: head, name, count });
      els['dex-list'].append(head);

      for (let i = biome.first; i <= biome.last; i++) {
        const m = Game.minerals[i];
        const root = el('div', 'dex-entry');
        root.style.setProperty('--entry-accent', m.accent);
        const gem = el('span', 'dex-gem');
        gem.append(Game.gem.toSvg(m, i));
        const body = el('span', 'dex-body');
        const nameNode = el('span', 'dex-name');
        const meta = el('span', 'dex-meta');
        const fact = el('span', 'dex-fact');
        body.append(nameNode, meta, fact);
        root.append(gem, body);
        entries.push({ index: i, root, name: nameNode, meta, fact });
        els['dex-list'].append(root);
      }
    }

    for (const era of Game.eras) {
      const head = el('div', 'dex-biome');
      const name = el('span', '');
      const count = el('span', '');
      head.append(name, count);
      eraRows.push({ era, root: head, name, count });
      els['catalog-list'].append(head);

      for (let i = era.first; i <= era.last; i++) {
        const root = el('div', 'dex-entry');
        const gem = el('span', 'dex-gem emoji', config.producers[i].icon);
        const body = el('span', 'dex-body');
        const nameNode = el('span', 'dex-name');
        const meta = el('span', 'dex-meta');
        const fact = el('span', 'dex-fact');
        body.append(nameNode, meta, fact);
        root.append(gem, body);
        machines.push({ index: i, root, name: nameNode, meta, fact });
        els['catalog-list'].append(root);
      }
    }

    els['dex-open'].addEventListener('click', open);
    els['dex-close'].addEventListener('click', () => Game.ui.closeModal(els.dex));
    Game.ui.onRender(render);
  }

  const markSeen = () => (tab === 'minerals' ? Game.markDexSeen() : Game.markCatalogSeen());

  function switchTab(id) {
    tab = id;
    markSeen();
    renderContent();
  }

  function open() {
    markSeen();
    renderContent();
    Game.ui.openModal(els.dex, els['dex-close']);
    Game.storage.save();
  }

  // Un bioma o una era recién completados: aviso en la cola de avisos de abajo.
  function announceComplete(biomes) {
    Game.sound.play('achievement');
    for (const b of biomes) {
      Game.achievementsPanel.toast(tr('dex.biomeDone', { icon: b.icon, name: Game.biomeName(b), pct: percent(config.dex.biomeBonus) }));
    }
  }

  function announceEras(eras) {
    Game.sound.play('achievement');
    for (const e of eras) {
      Game.achievementsPanel.toast(tr('catalog.eraDone', { icon: e.icon, name: tr('era.' + e.id), pct: percent(config.catalog.eraBonus) }));
    }
  }

  // ── Pintado ───────────────────────────────────────────────
  // Se llama 10 veces por segundo con la interfaz: el numerito siempre, el álbum solo si está abierto.
  function render() {
    // Con el álbum abierto lo que se descubre en la pestaña a la vista ya cuenta como visto.
    if (!els.dex.hidden) markSeen();
    const unseen = Game.getDexUnseen() + Game.getCatalogUnseen();
    els['dex-badge'].hidden = unseen < 1;
    setText(els['dex-badge'], String(unseen));
    if (!els.dex.hidden) renderContent();
  }

  function renderContent() {
    for (const b of tabButtons) {
      const unseen = b.id === 'minerals' ? Game.getDexUnseen() : Game.getCatalogUnseen();
      setText(b.node, tr(b.id === 'minerals' ? 'dex.tabMinerals' : 'dex.tabMachines') + (unseen > 0 ? ' (+' + unseen + ')' : ''));
      b.node.setAttribute('aria-pressed', String(b.id === tab));
    }
    els['dex-list'].hidden = tab !== 'minerals';
    els['catalog-list'].hidden = tab !== 'machines';
    if (tab === 'minerals') renderMinerals();
    else renderMachines();
  }

  function renderMinerals() {
    const best = Game.state.dex.best;
    const total = Game.realMineralCount;
    setText(els['dex-title'], tr('dex.title'));
    setText(els['dex-progress'], tr('dex.progress', { n: Game.getDexCount(), total }));
    els['dex-fill'].style.width = (Game.getDexCount() / total * 100).toFixed(1) + '%';
    const done = Game.getCompletedBiomes().length;
    setText(els['dex-bonus'], done > 0
      ? tr('dex.bonus', { n: done, pct: percent(done * config.dex.biomeBonus) })
      : tr('dex.bonusHint', { pct: percent(config.dex.biomeBonus) }));

    for (const row of biomeRows) {
      const b = row.biome;
      const found = Math.min(best, b.last) - b.first + 1;
      const size = b.last - b.first + 1;
      row.root.classList.toggle('complete', Game.isBiomeComplete(b));
      setText(row.name, b.icon + ' ' + Game.biomeName(b));
      setText(row.count, Game.isBiomeComplete(b) ? tr('dex.biomeComplete') : tr('dex.biomeCount', { done: Math.max(found, 0), total: size }));
    }

    for (const entry of entries) {
      const m = Game.minerals[entry.index];
      const found = Game.isDiscovered(entry.index);
      entry.root.classList.toggle('found', found);
      if (found) {
        setText(entry.name, m.icon + ' ' + Game.mineralName(m));
        setText(entry.meta, tr('dex.meta', { rarity: Game.rarityName(m), n: formatNumber(m.value) }));
        setText(entry.fact, tr('fact.' + m.id));
      } else {
        setText(entry.name, tr('dex.locked'));
        // Solo el siguiente por descubrir enseña lo que hace falta; el resto, un "aún por descubrir".
        const gated = !Game.isMineralAvailable(entry.index);
        setText(entry.meta, gated ? tr('dex.gated', { n: m.unlockPrestiges }) : entry.index === best + 1 ? tr('dex.unlockAt', { n: formatNumber(m.unlockAt) }) : tr('dex.undiscovered'));
        setText(entry.fact, '');
      }
    }
  }

  function renderMachines() {
    const best = Game.state.catalog.best;
    const total = config.producers.length;
    setText(els['dex-title'], tr('catalog.title'));
    setText(els['dex-progress'], tr('catalog.progress', { n: Game.getCatalogCount(), total }));
    els['dex-fill'].style.width = (Game.getCatalogCount() / total * 100).toFixed(1) + '%';
    const done = Game.getCompletedEras().length;
    setText(els['dex-bonus'], done > 0
      ? tr('catalog.bonus', { n: done, pct: percent(done * config.catalog.eraBonus) })
      : tr('catalog.bonusHint', { pct: percent(config.catalog.eraBonus) }));

    for (const row of eraRows) {
      const e = row.era;
      const found = Math.min(best, e.last) - e.first + 1;
      const size = e.last - e.first + 1;
      row.root.classList.toggle('complete', Game.isEraComplete(e));
      setText(row.name, e.icon + ' ' + tr('era.' + e.id));
      setText(row.count, Game.isEraComplete(e) ? tr('catalog.eraComplete') : tr('catalog.eraCount', { done: Math.max(found, 0), total: size }));
    }

    for (const entry of machines) {
      const p = config.producers[entry.index];
      const found = Game.isMachineFound(entry.index);
      entry.root.classList.toggle('found', found);
      if (found) {
        setText(entry.name, Game.producerName(p.id));
        setText(entry.meta, tr('catalog.meta', { prod: formatNumber(p.baseProduction), cost: formatNumber(p.baseCost) })
          + ' · ' + tr('catalog.owned', { n: formatNumber(Game.state.producers[p.id]) }));
        setText(entry.fact, tr('machine.' + p.id));
      } else {
        setText(entry.name, tr('dex.locked'));
        const prev = config.producers[entry.index - 1];
        setText(entry.meta, entry.index === best + 1 && prev ? tr('catalog.unlockAt', { name: Game.producerName(prev.id) }) : tr('catalog.undiscovered'));
        setText(entry.fact, '');
      }
    }
  }

  Game.dexPanel = { init, announceComplete, announceEras };
})(window.Game);

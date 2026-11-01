// Interfaz: pinta el estado en el DOM y recoge la entrada del jugador.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);

  const els = {};
  const shop = { producers: {}, upgrades: {} }; // id → { root, icon, name, sub, cost, count }
  const tr = (key, params) => Game.tr(key, params);
  const amountButtons = []; // { node, amount }
  const getBuyAmount = () => Game.state.settings.buyAmount; // selector de compra de productores
  let shownMineral = -1; // índice de mineral que muestra la interfaz (-1 = aún ninguno)
  let shownBiome = -1; // lo mismo con el bioma
  let shownProgress = ''; // último ancho de la barra aplicado
  let toastTimer = null;
  const renderHooks = []; // funciones que se ejecutan en cada render (paneles que dependen del estado)
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shownLevel = 0; // nivel de rareza del mineral que se está mostrando
  // La moneda sube "rodando" hacia su valor real en vez de saltar cada 100 ms.
  let shownCurrency = -1; // -1 = aún no se ha pintado
  let targetCurrency = 0;
  let frameId = 0;
  let lastFrame = 0;
  let frameAskedAt = 0;
  let handlers = {};

  function init(h) {
    handlers = h;

    for (const id of ['currency', 'currency-name', 'pps', 'per-click', 'mineral-icon',
                      'mineral-name', 'mineral-mult', 'progress-fill', 'progress-label', 'next-milestone', 'toast',
                      'rock', 'rock-gem', 'floaters', 'dust', 'biome-name',
                      'producers', 'upgrades', 'upgrades-empty', 'buy-amount', 'buy-all',
                      'offline', 'offline-amount', 'offline-unit', 'offline-detail',
                      'offline-mineral', 'offline-close']) {
      els[id] = $(id);
    }

    const root = document.documentElement.style;
    root.setProperty('--floater-ms', config.ui.floaterMs + 'ms');
    root.setProperty('--toast-ms', config.ui.toastMs + 'ms');
    root.setProperty('--ach-toast-ms', config.ui.achToastMs + 'ms');
    root.setProperty('--spark-ms', config.ui.sparkMs + 'ms');

    buildShop();
    bindRock();
    bindShop();
    bindModals();
    bindDustPause();
    translate();
  }

  // Partículas de fondo (polvo, gotas, nieve, brasas…): las del bioma actual, con la animación pausada
  // cuando la pestaña no se ve. El CSS de cada tipo (`kind`) está en css/style.css (.dust[data-fx]).
  const STILL = ['glint', 'sparkle', 'stars']; // se quedan en su sitio y titilan, en vez de subir o caer
  const range = (pair) => pair[0] + Math.random() * (pair[1] - pair[0]);

  function buildDust(fx) {
    els.dust.replaceChildren();
    els.dust.dataset.fx = fx.kind;
    const count = Math.round(fx.count * config.ui.dust);
    for (let i = 0; i < count; i++) {
      const mote = el('span', 'mote');
      mote.style.left = (Math.random() * 100).toFixed(1) + '%';
      if (STILL.includes(fx.kind)) mote.style.top = (Math.random() * 100).toFixed(1) + '%';
      mote.style.setProperty('--s', range(fx.size).toFixed(1) + 'px');
      if (fx.colors) mote.style.setProperty('--c', fx.colors[Math.floor(Math.random() * fx.colors.length)]);
      mote.style.animationDuration = range(fx.seconds).toFixed(1) + 's';
      mote.style.animationDelay = (-Math.random() * fx.seconds[1]).toFixed(1) + 's';
      mote.style.setProperty('--sway', ((Math.random() - 0.5) * 60).toFixed(0) + 'px');
      els.dust.append(mote);
    }
  }

  function bindDustPause() {
    document.addEventListener('visibilitychange', () => {
      document.documentElement.classList.toggle('paused', document.hidden);
    });
  }

  // El bioma manda en el aspecto: paleta de fondo y paneles (el CSS la anima), partículas y nombre en el HUD.
  function applyBiome(biome) {
    const p = biome.palette;
    const root = document.documentElement.style;
    root.setProperty('--bg', p.bg);
    root.setProperty('--bg-deep', p.bgDeep);
    root.setProperty('--glow-top', p.glow);
    root.setProperty('--panel', p.panel);
    root.setProperty('--panel-raised', p.panelRaised);
    root.setProperty('--line', p.line);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.bg); // la barra del navegador en el móvil
    document.documentElement.dataset.biome = biome.id;
    buildDust(biome.fx);
    setText(els['biome-name'], biome.icon + ' ' + Game.biomeName(biome));
  }

  // Textos fijos del HTML y los que solo se escriben una vez.
  function translate() {
    Game.i18n.applyStatic();
    setText(els['currency-name'], tr('currency.name'));
  }

  // ── Utilidades DOM ────────────────────────────────────────
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Solo escribe si cambia, para no tocar el DOM 10 veces por segundo sin motivo.
  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  // ── Entrada: roca ─────────────────────────────────────────
  // pointerdown se dispara una vez por cada dedo/puntero, así que el multitáctil
  // cuenta como varios clics. El teclado (Enter/Espacio) llega como 'click' con detail 0.
  function bindRock() {
    const rock = els.rock;

    rock.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const box = els.floaters.getBoundingClientRect();
      press(e.clientX - box.left, e.clientY - box.top);
    });

    rock.addEventListener('click', (e) => {
      if (e.detail !== 0) return; // ratón/toque ya contados en pointerdown
      const box = els.floaters.getBoundingClientRect();
      press(box.width / 2, box.height / 2);
    });

    rock.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function press(x, y) {
    const { gain, crit } = handlers.onMine();
    Game.sound.play('click', { pitch: (1 + Game.getMineralIndex() * 0.012) * (crit ? 1.6 : 1) });
    hitRock();
    spawnFloater(gain, x, y, crit);
    spawnSparks(x, y, crit ? { count: config.ui.burstSparks / 2, reach: 1.4 } : {});
    spawnRipple(x, y);
    render();
  }

  // ── Tienda ────────────────────────────────────────────────
  function makeItem(id, icon, name, withCount) {
    const root = el('button', 'item');
    root.type = 'button';
    root.dataset.id = id;

    const body = el('span', 'item-body');
    const nameNode = el('span', 'item-name', name);
    const sub = el('span', 'item-sub');
    const cost = el('span', 'item-cost');
    body.append(nameNode, sub, cost);

    const iconNode = el('span', 'item-icon', icon);
    root.append(iconNode, body);
    let count = null;
    if (withCount) {
      count = el('span', 'item-count');
      root.append(count);
    }
    return { root, icon: iconNode, name: nameNode, sub, cost, count };
  }

  function amountLabel(amount) {
    return amount === 'max' ? tr('shop.max') : '×' + amount;
  }

  function buildAmountSelector() {
    for (const amount of config.buyAmounts) {
      const node = el('button', 'seg-btn', amountLabel(amount));
      node.type = 'button';
      node.addEventListener('click', () => {
        Game.state.settings.buyAmount = amount;
        render();
      });
      amountButtons.push({ node, amount });
      els['buy-amount'].append(node);
    }
  }

  function buildShop() {
    buildAmountSelector();
    for (const p of config.producers) {
      const item = makeItem(p.id, p.icon, '', true);
      shop.producers[p.id] = item;
      els.producers.append(item.root);
    }
    // Se crean todas una vez (ya ordenadas por coste); la tienda solo enseña las disponibles.
    for (const u of Game.upgrades) {
      const item = makeItem(u.id, u.icon, '', false);
      item.root.hidden = true;
      shop.upgrades[u.id] = item;
      els.upgrades.append(item.root);
    }
  }

  function describeUpgrade(u) {
    const { type, value, target } = u.effect;
    switch (type) {
      case 'clickAdd': return tr('upgrade.clickAdd', { n: formatNumber(value) });
      case 'clickMult': return tr('upgrade.clickMult', { n: formatNumber(value) });
      case 'clickPps': return tr('upgrade.clickPps', { n: formatNumber(value * 100) });
      case 'globalMult': return tr('upgrade.globalMult', { n: formatNumber(value) });
      case 'producerMult': return tr('upgrade.producerMult', { n: formatNumber(value), name: Game.producerName(target) });
      case 'synergy': return tr('upgrade.synergy', { source: Game.producerName(u.effect.source), n: formatNumber(value * 100), target: Game.producerName(target) });
      default: return '';
    }
  }

  function bindShop() {
    bindShopList(els.producers, (id) => handlers.onBuyProducer(id, getBuyAmount()));
    bindShopList(els.upgrades, handlers.onBuyUpgrade);
    els['buy-all'].addEventListener('click', buyAll);
    // Atajo: U compra todas las mejoras asequibles (no con una ventana abierta ni escribiendo).
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'u' || e.ctrlKey || e.metaKey || e.altKey || openModals.length) return;
      if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
      buyAll();
    });
  }

  function buyAll() {
    const result = Game.buyAllUpgrades();
    if (!result.count) return;
    Game.sound.play('buy');
    flash(els['buy-all']);
    Game.achievementsPanel.toast(tr('shop.boughtAll', { n: result.count, cost: formatNumber(result.spent) }));
    render();
  }

  function bindShopList(list, buy) {
    list.addEventListener('click', (e) => {
      const node = e.target.closest('.item');
      if (!node || !buy(node.dataset.id)) return; // la lógica decide si se puede pagar
      Game.sound.play('buy');
      flash(node);
      render();
    });
  }

  function setAffordable(node, affordable) {
    node.classList.toggle('can-buy', affordable);
    node.setAttribute('aria-disabled', String(!affordable));
  }

  function renderShop() {
    const s = Game.state;
    const buyAmount = getBuyAmount();

    for (const b of amountButtons) {
      setText(b.node, amountLabel(b.amount));
      b.node.setAttribute('aria-pressed', String(b.amount === buyAmount));
    }

    for (const p of config.producers) {
      const item = shop.producers[p.id];
      const visibility = Game.getProducerVisibility(p.id);

      item.root.hidden = visibility === 'hidden';
      item.root.classList.toggle('teaser', visibility === 'teaser');
      if (visibility === 'hidden') continue;

      if (visibility === 'teaser') {
        setText(item.icon, '❓');
        setText(item.name, tr('shop.teaserName'));
        setText(item.sub, tr('shop.teaserHint'));
        setText(item.cost, '');
        setText(item.count, '');
        setAffordable(item.root, false);
        continue;
      }

      const owned = s.producers[p.id];
      const each = formatNumber(Game.getProducerUnitOutput(p.id));

      // Con 'máx' se muestra lo que realmente comprarías (o el precio de 1 si no llegas).
      const count = buyAmount === 'max' ? Math.max(Game.getMaxAffordable(p.id), 1) : buyAmount;
      const cost = Game.getProducerCost(p.id, count);
      const costText = formatNumber(cost);

      setText(item.icon, p.icon);
      // Una estrella por cada escalón de mejora alcanzado (a partir de 5, "★7"); desde `producerGoldAt` unidades se ve dorado.
      const stars = config.producerUpgradeTiers.filter((t) => owned >= t.at).length;
      item.root.classList.toggle('gold', owned >= config.producerGoldAt);
      setText(item.name, Game.producerName(p.id) + (stars ? ' ' + (stars <= 5 ? '★'.repeat(stars) : '★' + stars) : ''));
      if (item.lastOwned !== undefined && owned > item.lastOwned) restartClass(item.count, 'bump');
      item.lastOwned = owned;
      setText(item.count, formatNumber(owned));
      setText(item.cost, buyAmount === 1 ? costText : '×' + formatNumber(count) + ' · ' + costText);
      setText(item.sub, owned > 0
        ? tr('shop.eachTotal', { n: each, total: formatNumber(Game.getProducerOutput(p.id)) })
        : tr('shop.each', { n: each }));
      setAffordable(item.root, s.currency >= cost);
    }

    let available = 0;
    for (const u of Game.upgrades) {
      const item = shop.upgrades[u.id];
      const isAvailable = Game.isUpgradeAvailable(u);
      item.root.hidden = !isAvailable;
      if (!isAvailable) continue;

      available++;
      setText(item.name, Game.upgradeName(u));
      setText(item.sub, describeUpgrade(u));
      setText(item.cost, formatNumber(u.cost));
      setAffordable(item.root, s.currency >= u.cost);
    }
    els['upgrades-empty'].hidden = available > 0;

    // "Comprar todas": solo se ofrece cuando hay varias a la vez; enseña cuántas se pagarían y lo que cuestan.
    const plan = Game.getBuyAllPlan();
    els['buy-all'].hidden = plan.available < 2;
    els['buy-all'].classList.toggle('can-buy', plan.count > 0);
    els['buy-all'].setAttribute('aria-disabled', String(plan.count === 0));
    setText(els['buy-all'], plan.count > 0
      ? tr('shop.buyAll', { n: plan.count, cost: formatNumber(plan.cost) })
      : tr('shop.buyAllNone', { n: plan.available }));
  }

  // ── Render ────────────────────────────────────────────────
  function render() {
    setCurrency(Game.state.currency);
    setText(els['per-click'], formatNumber(Game.getClickValue()));
    setText(els.pps, formatNumber(Game.getIncomePerSecond()));
    renderMineral();
    renderShop();
    for (const hook of renderHooks) hook();
  }

  function paintCurrency() {
    setText(els.currency, formatNumber(Math.floor(shownCurrency)));
  }

  // Sube de forma suave; al gastar (o la primera vez, o con "reducir movimiento") salta directo.
  function setCurrency(value) {
    targetCurrency = value;
    if (shownCurrency < 0 || reduceMotion || value < shownCurrency) shownCurrency = value;
    paintCurrency();
    if (shownCurrency >= targetCurrency) return;
    // Si el navegador dejó sin atender un fotograma pedido hace rato (p. ej. pestaña oculta), se pide de nuevo.
    if (frameId && performance.now() - frameAskedAt > 500) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (!frameId) {
      lastFrame = frameAskedAt = performance.now();
      frameId = requestAnimationFrame(rollCurrency);
    }
  }

  function rollCurrency(now) {
    frameId = 0;
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    const gap = targetCurrency - shownCurrency;
    shownCurrency = gap < 1 ? targetCurrency : shownCurrency + gap * Math.min(1, dt / 0.12);
    paintCurrency();
    if (shownCurrency < targetCurrency) frameId = requestAnimationFrame(rollCurrency);
  }

  // ── Minerales ─────────────────────────────────────────────
  function renderMineral() {
    const progress = Game.getMineralProgress();

    if (progress.index !== shownMineral) {
      const firstTime = shownMineral === -1; // al cargar la partida no se celebra nada
      const biomeIndex = Game.getBiomeIndexOf(progress.index);
      const newBiome = biomeIndex !== shownBiome;
      shownMineral = progress.index;
      applyMineral(Game.minerals[progress.index], progress.index);
      if (newBiome) {
        shownBiome = biomeIndex;
        applyBiome(Game.biomes[biomeIndex]);
      }
      if (!firstTime) announceMineral(Game.minerals[progress.index], newBiome ? Game.biomes[biomeIndex] : null);
    }

    const width = (progress.fraction * 100).toFixed(1) + '%';
    if (width !== shownProgress) {
      shownProgress = width;
      els['progress-fill'].style.width = width;
    }
    setText(els['progress-label'], progress.next
      ? tr('hud.next', {
        icon: progress.next.icon,
        name: Game.mineralName(progress.next),
        have: formatNumber(Game.state.totalEarned),
        need: formatNumber(progress.next.unlockAt),
      })
      : progress.locked
        ? tr('hud.locked', { icon: progress.locked.icon, name: Game.mineralName(progress.locked), n: progress.locked.unlockPrestiges })
        : tr('hud.complete'));

    // Siguiente hito: el cartel que dice qué se abrirá y dónde.
    const milestone = Game.getNextMilestone();
    els['next-milestone'].hidden = !milestone;
    if (milestone) {
      const at = Game.minerals[milestone.index];
      setText(els['next-milestone'], tr('milestone.next', {
        icon: at.icon, mineral: Game.mineralName(at), name: tr('milestone.' + milestone.id), mIcon: milestone.icon,
      }));
    }
  }

  // El color de acento, el icono de la roca y el chip del HUD siguen al mineral actual.
  function applyMineral(m, index) {
    shownLevel = Game.rarityLevel(m);
    const root = document.documentElement.style;
    root.setProperty('--accent', m.accent);
    root.setProperty('--glow', (0.2 + shownLevel * 0.06).toFixed(2)); // las rarezas altas brillan algo más
    setText(els['mineral-icon'], m.icon);
    setText(els['mineral-name'], Game.mineralName(m));
    setText(els['mineral-mult'], '×' + formatNumber(m.value));
    els['rock-gem'].replaceChildren(Game.gem.toSvg(m, index));
  }

  // Al llegar a un mineral nuevo; si además cambia de bioma, el aviso es el del bioma (con el mineral en la línea pequeña).
  function announceMineral(m, biome) {
    Game.sound.play('unlock');
    restartClass(els.rock, 'unlocked');
    celebrate();
    if (biome) {
      if (!reduceMotion) celebrate(); // el cambio de bioma se celebra el doble
      notify(tr('biome.enter', { icon: biome.icon, name: Game.biomeName(biome) }),
        tr('toast.unlocked', { icon: m.icon, name: Game.mineralName(m) }) + ' · ' + tr('toast.sub', { rarity: Game.rarityName(m), n: formatNumber(m.value) }));
      return;
    }
    notify(tr('toast.unlocked', { icon: m.icon, name: Game.mineralName(m) }),
      tr('toast.sub', { rarity: Game.rarityName(m), n: formatNumber(m.value) }));
  }

  // Aviso grande en la parte alta de la zona de juego: título y línea pequeña.
  function notify(title, sub) {
    els.toast.replaceChildren(el('span', 'toast-title', title), el('span', 'toast-sub', sub));
    restartClass(els.toast, 'show');
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, config.ui.toastMs);
  }

  // Estallido de chispas alrededor de la roca y un fogonazo del color del mineral.
  function celebrate() {
    if (reduceMotion) return;
    const box = els.floaters.getBoundingClientRect();
    spawnSparks(box.width / 2, box.height / 2, { count: config.ui.burstSparks, reach: config.ui.burstReach });
    const flash = el('div', 'flash');
    els.floaters.closest('.stage').append(flash);
    setTimeout(() => flash.remove(), 700);
  }

  // ── Ventanas modales ──────────────────────────────────────
  // Pila de ventanas abiertas: Escape cierra la de arriba (la última) y devuelve el foco.
  const openModals = []; // { modal, returnFocus }

  function openModal(modal, focusTarget) {
    modal.style.zIndex = String(100 + openModals.length); // la que se abre encima de otra se ve encima, esté donde esté en el HTML
    openModals.push({ modal, returnFocus: document.activeElement });
    modal.hidden = false;
    const card = modal.querySelector('.modal-card');
    if (card) card.scrollTop = 0; // si no, el foco en "Cerrar" (al final) desplazaría la ventana hacia abajo
    (focusTarget || modal.querySelector('button')).focus({ preventScroll: true });
  }

  function closeModal(modal) {
    modal.hidden = true;
    modal.style.zIndex = '';
    const i = openModals.findIndex((m) => m.modal === modal);
    if (i === -1) return;
    const { returnFocus } = openModals.splice(i, 1)[0];
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }

  // Mantiene el Tab dentro de la ventana abierta.
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = [...e.currentTarget.querySelectorAll('button, input, textarea, select, a[href]')]
      .filter((n) => !n.disabled && !n.hidden && !n.closest('[hidden]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function bindModals() {
    for (const modal of document.querySelectorAll('.modal')) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal); // clic en el fondo
      });
      modal.addEventListener('keydown', trapFocus);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && openModals.length) closeModal(openModals[openModals.length - 1].modal);
    });
    els['offline-close'].addEventListener('click', () => closeModal(els.offline));
  }

  // ── Aviso de ganancias offline ────────────────────────────
  function showOffline(summary) {
    const rate = Game.getOfflineRate();
    const { maxHours } = config.offline;

    setText(els['offline-amount'], formatNumber(Math.floor(summary.earned)));
    setText(els['offline-unit'], tr('currency.name'));
    setText(els['offline-detail'], tr(summary.capped ? 'offline.detailCapped' : 'offline.detail', {
      time: Game.formatDuration(summary.away),
      rate: Math.round(rate * 100),
      hours: maxHours,
    }));

    const reached = summary.mineralAfter > summary.mineralBefore;
    els['offline-mineral'].hidden = !reached;
    if (reached) {
      const m = Game.minerals[summary.mineralAfter];
      setText(els['offline-mineral'], tr('offline.reached', { icon: m.icon, name: Game.mineralName(m) }));
    }

    openModal(els.offline, els['offline-close']);
  }

  // ── Feedback ──────────────────────────────────────────────
  function restartClass(node, className) {
    node.classList.remove(className);
    void node.offsetWidth; // fuerza reflow para reiniciar la animación
    node.classList.add(className);
  }

  function flash(node) {
    restartClass(node, 'bought');
  }

  function hitRock() {
    const gem = els['rock-gem'];
    gem.style.setProperty('--tilt', (Math.random() * 10 - 5).toFixed(1) + 'deg');
    restartClass(gem, 'hit');
  }

  // Añade un nodo efímero a la capa de efectos y lo retira pasado `ms`.
  function addEffect(node, ms) {
    const layer = els.floaters;
    while (layer.childElementCount >= config.ui.maxEffects) layer.firstElementChild.remove();
    layer.appendChild(node);
    setTimeout(() => node.remove(), ms);
  }

  function spawnFloater(gain, x, y, crit) {
    const node = el('span', crit ? 'floater crit' : 'floater',
      crit ? tr('floater.crit', { n: formatNumber(gain) }) : '+' + formatNumber(gain));
    node.style.left = (x + (Math.random() * 36 - 18)) + 'px';
    node.style.top = y + 'px';
    addEffect(node, config.ui.floaterMs);
  }

  // Esquirlas de roca en las rarezas bajas y estrellitas en las altas; más cuanto más raro.
  function spawnSparks(x, y, options = {}) {
    const kind = shownLevel < 3 ? 'chip' : 'star';
    const count = options.count || Math.round(config.ui.sparks + shownLevel * config.ui.sparksPerLevel);
    const reach = options.reach || 1;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (24 + Math.random() * 28) * reach;
      const node = el('span', 'spark ' + kind);
      node.style.left = x + 'px';
      node.style.top = y + 'px';
      node.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
      node.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
      node.style.setProperty('--rot', ((Math.random() - 0.5) * 720).toFixed(0) + 'deg');
      addEffect(node, config.ui.sparkMs * Math.sqrt(reach));
    }
  }

  // Onda que se expande desde el punto del clic.
  function spawnRipple(x, y) {
    const node = el('span', 'ripple');
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    addEffect(node, 420);
  }

  // Tras sustituir la partida entera (importar, reiniciar): vuelve a pintar todo sin celebrar
  // el cambio de mineral como si fuera un desbloqueo.
  function reload() {
    shownCurrency = -1;
    for (const id of Object.keys(shop.producers)) shop.producers[id].lastOwned = undefined;
    shownMineral = -1;
    shownBiome = -1;
    shownProgress = '';
    els.toast.hidden = true;
    render();
  }

  // Tras cambiar de idioma: vuelve a escribir todos los textos (sin celebrar nada).
  function retranslate() {
    translate();
    reload();
  }

  const onRender = (fn) => { renderHooks.push(fn); };

  Game.ui = { init, render, reload, retranslate, onRender, showOffline, openModal, closeModal, notify, celebrate };
})(window.Game);

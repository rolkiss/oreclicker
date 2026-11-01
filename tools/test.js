// Pruebas de la lógica del juego (sin navegador). Uso, desde la raíz del proyecto:
//   node tools/test.js
// Termina con código 1 si algo falla. Las expectativas salen del config siempre que se puede,
// así que sirve tras retocar costes, mejoras o minerales.
'use strict';

const path = require('path');

global.window = global;
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
// Node 21+ trae su propio `navigator`, y el idioma por defecto saldría del sistema donde se ejecuten las pruebas
// (en un servidor de CI es inglés). Se fija un navegador en español para que el resultado no dependa del equipo.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'es-ES' }, configurable: true, writable: true });
for (const f of ['config', 'lang/es', 'lang/en', 'i18n', 'format', 'state', 'upgrades', 'minerals', 'game', 'biomes', 'events', 'prestige', 'milestones', 'dex', 'catalog', 'challenges', 'ads', 'share', 'missions', 'achievements', 'offline', 'save', 'sound', 'gem']) {
  require(path.join(__dirname, '..', 'js', f + '.js'));
}
const G = window.Game;
const config = G.config;

let failures = 0;
let checks = 0;
function ok(condition, message) {
  checks++;
  if (!condition) {
    failures++;
    console.log('FALLO:', message);
  }
}
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const fresh = () => { G.state = G.createState(); return G.state; };
const throwsMessage = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// ── Catálogos ───────────────────────────────────────────────
{
  const expected = config.clickUpgrades.length + config.globalUpgrades.length
    + config.producers.length * config.producerUpgradeTiers.length + (config.producers.length - 1); // + una sinergia por productor menos el primero
  ok(G.upgrades.length === expected, 'nº de mejoras: ' + G.upgrades.length + ' vs ' + expected);
  ok(new Set(G.upgrades.map((u) => u.id)).size === G.upgrades.length, 'ids de mejora únicos');
  ok(G.upgrades.every((u, i, a) => i === 0 || a[i - 1].cost <= u.cost), 'mejoras ordenadas por coste');
  ok(G.upgrades.every((u) => u.cost > 0 && Number.isFinite(u.cost) && u.unlock), 'mejoras con coste y desbloqueo');
  ok(new Set(config.producers.map((p) => p.id)).size === config.producers.length, 'ids de productor únicos');
  ok(config.producers.every((p, i, a) => i === 0 || (p.baseCost > a[i - 1].baseCost && p.baseProduction > a[i - 1].baseProduction)),
    'cada productor cuesta y produce más que el anterior');
}

// ── Minerales ───────────────────────────────────────────────
{
  const m = G.minerals;
  ok(m.length === config.minerals.length + config.endless.count && G.realMineralCount === config.minerals.length, 'nº de minerales (los de verdad más los rangos sin fin)');
  ok(m[0].unlockAt === 0 && m[0].value === 1, 'el primer mineral empieza a 0 con valor 1');
  ok(m.every((x, i, a) => i === 0 || (x.unlockAt > a[i - 1].unlockAt && x.value > a[i - 1].value)), 'umbrales y valores crecientes');
  ok(m.every((x) => x.id && x.icon && x.rarity && /^#[0-9a-f]{6}$/i.test(x.accent)), 'minerales con id, icono, rareza y color');
  const s = fresh();
  ok(G.getMineralIndex() === 0, 'empieza en el primer mineral');
  s.totalEarned = m[1].unlockAt - 1; ok(G.getMineralIndex() === 0, 'justo antes del umbral');
  s.totalEarned = m[1].unlockAt; ok(G.getMineralIndex() === 1, 'en el umbral');
  s.totalEarned = 1e300;
  const gated = m.findIndex((x) => x.unlockPrestiges);
  ok(gated > 0 && G.getMineralIndex() === gated - 1, 'sin renaceres el tope es el último mineral del tramo abierto (' + G.getMineralIndex() + ')');
  ok(G.getMineralProgress().next === null && G.getMineralProgress().locked === m[gated], 'y el progreso avisa de qué tramo está cerrado');
  s.prestige.count = Math.max(...m.map((x) => x.unlockPrestiges || 0)) - 1; ok(G.getMineralIndex() === gated - 1, 'un renacer antes de que se abra, sigue cerrado');
  s.prestige.count += 1; ok(G.getMineralIndex() === m.length - 1 && G.getMineralProgress().locked === undefined, 'con los renaceres necesarios se llega hasta el último');
  s.prestige.count = 0; s.totalEarned = m[gated].unlockAt; ok(G.getMineralIndex() === gated - 1, 'aunque se tenga el total, sin renaceres no se abre');
  s.totalEarned = Math.sqrt(m[1].unlockAt);
  ok(near(G.getMineralProgress().fraction, 0.5), 'progreso a escala logarítmica');
  s.totalEarned = 1e300; const last = G.getMineralProgress(); ok(last.next === null && last.fraction === 1, 'progreso en el último mineral');
}

// ── Producción, clic y multiplicadores ──────────────────────
{
  let s = fresh();
  ok(G.getClickValue() === config.click.base, 'clic base');
  s.producers.novice = 10;
  const base = G.getPps();
  ok(near(base, 10 * config.producers[0].baseProduction), 'PPS de 10 productores base');
  s.upgrades['novice-10'] = true;
  ok(near(G.getPps(), base * 2), 'mejora de productor ×2');
  const globalUp = G.upgradesByType.globalMult[0];
  s.upgrades[globalUp.id] = true;
  ok(near(G.getPps(), base * 2 * globalUp.effect.value), 'mejora global');
  ok(near(G.getClickValue(), config.click.base * globalUp.effect.value), 'la global también multiplica el clic');

  s = fresh();
  const add = G.upgradesByType.clickAdd[0], mult = G.upgradesByType.clickMult[0];
  s.upgrades[add.id] = true; s.upgrades[mult.id] = true;
  ok(near(G.getClickValue(), (config.click.base + add.effect.value) * mult.effect.value), '(base + suma) × multiplicador');
  s = fresh(); s.producers.novice = 100; s.upgrades[G.upgradesByType.clickPps[0].id] = true;
  ok(near(G.getClickValue(), config.click.base + G.getPps() * G.upgradesByType.clickPps[0].effect.value), 'clic suma % de la producción');
  s = fresh(); s.producers.novice = 10; s.totalEarned = G.minerals[1].unlockAt;
  ok(near(G.getPps(), 10 * config.producers[0].baseProduction * G.minerals[1].value), 'el mineral multiplica la producción');

  s = fresh(); G.mine(); G.mine(); s.producers.novice = 5; G.tick(2);
  ok(near(s.totalEarned, 2 + 5 * config.producers[0].baseProduction * 2) && s.currency === s.totalEarned, 'clic y tick suman a moneda y total');
  s.currency = 0; ok(s.totalEarned > 0, 'gastar no baja el total ganado');
}

// ── Costes y compras ────────────────────────────────────────
{
  const g = config.defaultCostGrowth;
  for (const p of config.producers) {
    for (const owned of [0, 7, 50]) for (const k of [1, 10, 100]) {
      let direct = 0;
      for (let i = 0; i < k; i++) direct += Math.ceil(p.baseCost * Math.pow(g, owned + i));
      const bulk = G.getProducerCost(p.id, k, owned);
      const tolerance = direct > 2 ** 53 ? direct * 1e-12 : k;
      ok(Math.abs(bulk - direct) <= tolerance, 'coste múltiple ' + p.id + ' n=' + owned + ' k=' + k);
    }
  }
  const s = fresh();
  let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const p = config.producers[Math.floor(Math.random() * config.producers.length)];
    s.producers[p.id] = Math.floor(Math.random() * 300);
    const budget = Math.pow(10, Math.random() * 40);
    const k = G.getMaxAffordable(p.id, budget);
    if ((k > 0 && G.getProducerCost(p.id, k) > budget) || G.getProducerCost(p.id, k + 1) <= budget) bad++;
  }
  ok(bad === 0, 'getMaxAffordable exacto (' + bad + ' fallos de 2000)');

  fresh(); const t = G.state;
  t.currency = 1e12;
  const names = config.producers.map((p) => p.id);
  ok(!G.buyProducer(names[2]) && !G.buyProducer(names[names.length - 1]), 'no se compran los no descubiertos');
  ok(G.buyProducer(names[0]), 'compra el primero');
  ok(G.getProducerVisibility(names[1]) === 'open' && G.getProducerVisibility(names[2]) === 'teaser' && G.getProducerVisibility(names[3]) === 'hidden',
    'descubrimiento de uno en uno');
  t.currency = G.getProducerCost(names[0], 10) - 1;
  ok(!G.buyProducer(names[0], 10) && t.producers[names[0]] === 1, '×10 sin dinero no compra nada');
  t.currency = G.getProducerCost(names[0], 10);
  ok(G.buyProducer(names[0], 10) && t.producers[names[0]] === 11 && t.currency === 0, '×10 exacto');
  t.currency = 5000; const before = t.producers[names[0]], k = G.getMaxAffordable(names[0]);
  ok(G.buyProducer(names[0], 'max') && t.producers[names[0]] === before + k, 'comprar máx');

  fresh(); const u = G.upgradeById['novice-10'];
  G.state.currency = 1e9;
  ok(!G.buyUpgrade('novice-10'), 'mejora bloqueada no se compra');
  G.state.producers.novice = 10; ok(G.isUpgradeAvailable(u), 'desbloqueo por unidades');
  G.state.currency = u.cost - 1; ok(!G.buyUpgrade('novice-10'), 'mejora sin dinero');
  G.state.currency = u.cost; ok(G.buyUpgrade('novice-10') && G.state.currency === 0, 'compra mejora');
  ok(!G.buyUpgrade('novice-10') && !G.buyUpgrade('no-existe'), 'no se repite ni existen ids falsos');
  fresh(); const click = G.upgradeById.pick;
  ok(!G.isUpgradeAvailable(click), 'mejora por ganancia oculta al inicio');
  G.state.totalEarned = click.unlock.earned; ok(G.isUpgradeAvailable(click), 'se desbloquea al ganar lo suficiente');
}

// ── Offline ─────────────────────────────────────────────────
{
  const NOW = 1_700_000_000_000;
  G.obtenerHora = () => NOW;
  const { rate, maxHours, minSeconds } = config.offline;
  const hours = 3600 * 1000;
  const withProducers = (n) => { const s = fresh(); s.producers.novice = n; return s; };
  const pps = config.producers[0].baseProduction;

  withProducers(100);
  ok(G.applyOffline(NOW - (minSeconds - 1) * 1000) === null, 'menos del mínimo: nada');
  let r = G.applyOffline(NOW - 2 * hours);
  ok(r && near(r.earned, 100 * pps * 7200 * rate) && !r.capped, 'ganancia offline proporcional');
  ok(near(G.state.currency, r.earned) && near(G.state.totalEarned, r.earned), 'se suma a moneda y total');
  withProducers(100); r = G.applyOffline(NOW - (maxHours + 12) * hours);
  ok(r.capped && near(r.earned, 100 * pps * maxHours * 3600 * rate), 'tope de horas');
  withProducers(100); ok(G.applyOffline(NOW + 5 * 60 * 1000) === null, 'reloj atrasado: nada');
  fresh(); ok(G.applyOffline(NOW - 5 * hours) === null, 'sin productores: nada');
  ok(G.applyOffline(NaN) === null && G.applyOffline(undefined) === null, 'savedAt inválido');
  withProducers(10); G.state.upgrades.pick = true; G.state.upgrades.gloves = true;
  r = G.applyOffline(NOW - hours); ok(near(r.earned, 10 * pps * 3600 * rate), 'el clic no cuenta offline');
  withProducers(1000); G.state.totalEarned = 1000;
  r = G.applyOffline(NOW - maxHours * hours); ok(r.mineralAfter >= r.mineralBefore, 'resumen con mineral antes/después');

  fresh(); G.state.currency = 5; G.storage.save();
  const L = G.storage.load();
  ok(L && L.savedAt === NOW && L.state.currency === 5, 'load devuelve { state, savedAt } con la hora de obtenerHora');
  const d = G.formatDuration;
  ok([d(5), d(60), d(8100), d(100000)].join('|') === '5 s|1 min|2 h 15 min|1 d 3 h', 'formatDuration');
}

// ── Guardado, migración y exportar/importar ─────────────────
{
  const key = config.saveKey;
  const put = (state, extra) => { store[key] = JSON.stringify({ version: 2, savedAt: 1, ...extra, state }); return G.storage.load(); };

  let s = fresh();
  Object.assign(s.producers, { novice: 7, cart: 2 });
  s.currency = 1234.5; s.totalEarned = 99999; s.totalClicks = 12;
  s.upgrades = { pick: true, 'novice-10': true }; s.settings = { ...s.settings, notation: 'scientific', buyAmount: 100 };
  G.storage.save();
  ok(JSON.stringify(G.storage.load().state) === JSON.stringify(s), 'guardar y cargar devuelve lo mismo');

  ok(G.storage.load() !== null, 'hay partida');
  store[key] = '{no es json'; ok(G.storage.load() === null, 'JSON corrupto → sin partida');
  store[key] = JSON.stringify({ version: 2, state: 'hola' }); ok(G.storage.load() === null, 'estado que no es objeto');
  let loaded = put({ currency: -5, totalClicks: 'x', producers: { novice: 3.9, barrow: -2, fantasma: 5 }, upgrades: { pick: 'sí', fantasma: true }, settings: { notation: 'raro', buyAmount: 7 } });
  ok(loaded.state.currency === 0 && loaded.state.producers.novice === 3 && loaded.state.producers.barrow === 0 && Object.keys(loaded.state.upgrades).length === 0
     && loaded.state.settings.notation === 'abbreviated' && loaded.state.settings.buyAmount === config.buyAmounts[0], 'valores raros saneados');
  loaded = put({ currency: 321, producers: { novice: 4 }, clickUpgrades: { pick: true, gloves: true, fantasma: true } }, { version: 1 });
  ok(loaded.state.upgrades.pick && loaded.state.upgrades.gloves && !loaded.state.upgrades.fantasma && loaded.state.totalEarned === 321, 'migración desde la versión 1');
  loaded = put({ currency: 10, totalEarned: 3 }); ok(loaded.state.totalEarned === 10, 'totalEarned nunca menor que la moneda');
  loaded = put({}, { savedAt: 'ayer' }); ok(loaded.savedAt === null, 'savedAt basura → null');

  s = fresh();
  Object.assign(s.producers, { novice: 7, cart: 2 });
  s.currency = 1234.5; s.totalEarned = 99999; s.upgrades = { pick: true }; s.settings = { ...s.settings, notation: 'scientific', buyAmount: 10 };
  const code = G.storage.exportCode();
  ok(/^[A-Za-z0-9+/=]+$/.test(code), 'el código es base64');
  ok(JSON.stringify(G.storage.parseCode(code)) === JSON.stringify(G.state), 'exportar → importar exacto');
  ok(JSON.stringify(G.storage.parseCode('  ' + code.replace(/(.{40})/g, '$1\n') + '\n ')) === JSON.stringify(G.state), 'tolera saltos de línea al pegar');
  ok(throwsMessage(() => G.storage.parseCode('')) === 'import.empty', 'código vacío');
  ok(throwsMessage(() => G.storage.parseCode('hola mundo!!')) === 'import.invalid', 'código basura');
  ok(throwsMessage(() => G.storage.parseCode(Buffer.from('{"a":1}').toString('base64'))) === 'import.foreign', 'código de otro juego');
  const envelope = JSON.parse(Buffer.from(code, 'base64').toString());
  envelope.state = envelope.state.replace('"currency":1234.5', '"currency":9999999');
  ok(throwsMessage(() => G.storage.parseCode(Buffer.from(JSON.stringify(envelope)).toString('base64'))) === 'import.corrupt', 'código alterado');
  ok(throwsMessage(() => G.storage.parseCode('A'.repeat(1_000_001))) === 'import.tooLong', 'código demasiado largo');

  s = fresh(); s.settings = { ...s.settings, notation: 'scientific', buyAmount: 'max', language: 'en' }; s.currency = 500; s.producers.novice = 3;
  G.resetGame();
  ok(G.state.currency === 0 && G.state.producers.novice === 0 && G.state.settings.notation === 'scientific' && G.state.settings.buyAmount === 'max'
     && G.state.settings.language === 'en', 'reiniciar conserva los ajustes (también el idioma)');
  loaded = put({ settings: { language: 'en' } }); ok(loaded.state.settings.language === 'en', 'el idioma guardado se conserva');
  loaded = put({ settings: { language: 'klingon' } }); ok(config.languages.includes(loaded.state.settings.language), 'idioma inválido → uno válido');
}

// ── Prestigio ───────────────────────────────────────────────
{
  const pc = config.prestige;
  const idx = (id) => config.minerals.findIndex((m) => m.id === id);
  const first = idx(pc.firstMineral);
  const reach = (s, mineralIndex) => { s.totalEarned = Math.max(s.totalEarned, G.minerals[mineralIndex].unlockAt); s.currency = Math.min(s.currency, s.totalEarned); };

  // Catálogo
  ok(first > 0 && new Set(pc.skills.map((k) => k.id)).size === pc.skills.length, 'habilidades con id único y mineral de partida válido');
  ok(pc.skills.every((k) => k.icon && k.levels.length > 0 && k.levels.every((l, i, a) => l.cost >= 1 && (i === 0 || l.cost >= a[i - 1].cost))), 'habilidades con icono y costes crecientes');
  ok(pc.skills.every((k) => ['globalMult', 'clickMult', 'costMult', 'offlineRate', 'prestigeMult', 'startCash', 'startProducers', 'goldenRate', 'goldenPower', 'synergyMult', 'critChance'].includes(k.type)), 'tipos de habilidad conocidos');
  ok(pc.unlocks.every((u) => (u.skill ? !!G.skillById[u.skill] : u.biome ? G.biomes.some((b) => b.id === u.biome) : typeof u.feature === 'string') && u.at > 0), 'los desbloqueos apuntan a algo que existe');
  ok(config.minerals.filter((m) => m.unlockPrestiges).every((m) => pc.unlocks.some((u) => u.biome && u.at === m.unlockPrestiges)), 'cada mineral del tramo final coincide con un desbloqueo del bioma');
  ok(pc.coreCaps.every((c, i, a) => c.max >= 1 && (i === 0 ? c.from === 1 : c.from > a[i - 1].from && c.max > a[i - 1].max)), 'topes de Núcleos crecientes desde el renacer 1');
  ok(pc.skills.filter((k) => k.type === 'startProducers').every((k) => k.levels.every((l) => Object.keys(l.value).every((id) => id in G.state.producers))), 'la cuadrilla inicial usa productores reales');

  // Condición y recompensa
  let s = fresh();
  ok(G.getPrestigeTarget() === first && !G.canPrestige() && G.getPrestigeGain() === 0, 'al empezar no se puede renacer');
  ok(G.prestigeNow() === null && s.prestige.count === 0, 'renacer sin llegar no hace nada');
  reach(s, first);
  ok(G.canPrestige() && G.getPrestigeGain() === 1, 'al llegar al mineral exigido: 1 Núcleo');
  reach(s, first + pc.mineralsPerCore); ok(G.getPrestigeGain() === 2, 'cada ' + pc.mineralsPerCore + ' minerales de más: +1 Núcleo');
  s.totalEarned = 1e300; ok(G.getPrestigeGain() === G.getCoreCap() && G.getCoreCap() === pc.coreCaps[0].max, 'el Núcleo máximo respeta el tope');
  ok(G.getNextCoreMineral() === null, 'en el tope no hay siguiente Núcleo');
  s.prestige.count = pc.coreCaps[1].from - 2; ok(G.getCoreCap() === pc.coreCaps[0].max, 'antes del renacer ' + pc.coreCaps[1].from + ' el tope no cambia');
  s.prestige.count = pc.coreCaps[1].from - 1; ok(G.getCoreCap() === pc.coreCaps[1].max, 'el tope sube en el renacer ' + pc.coreCaps[1].from);
  s.prestige.count = pc.coreCaps[2].from - 2; ok(G.getCoreCap() === pc.coreCaps[1].max, 'justo antes del último hito el tope no cambia');
  s.prestige.count = pc.coreCaps[2].from - 1; ok(G.getCoreCap() === pc.coreCaps[2].max, 'el tope sube en el renacer ' + pc.coreCaps[2].from);
  s = fresh(); reach(s, first); ok(G.getNextCoreMineral() === first + pc.mineralsPerCore, 'siguiente Núcleo: mineral correcto');
  s = fresh(); s.prestige.count = 4; ok(G.getPrestigeTarget() === first + Math.floor(4 * pc.mineralsPerPrestige), 'cada renacer exige llegar más lejos');
  s.prestige.count = 1e6; ok(G.getPrestigeTarget() === G.minerals.length - 1 - (pc.targetHeadroom || 0), 'el objetivo nunca pasa del último mineral menos el margen');

  // Renacer
  s = fresh();
  reach(s, first); Object.assign(s.producers, { novice: 40, cart: 3 }); s.upgrades = { pick: true }; s.currency = 777; s.totalClicks = 321; s.playTime = 5000;
  s.achievements = { 'clicks-1': true }; s.settings.notation = 'scientific'; s.offlineReturns = 2; s.prestige.skills.power = 1; s.prestige.cores = 4;
  s.prestige.runTime = 4000; s.prestige.readyTime = 3600;
  const settingsBefore = s.settings;
  const out = G.prestigeNow();
  const n = G.state;
  ok(out && out.gain === 1 && out.mineral === first, 'renacer devuelve lo ganado');
  ok(n.currency === 0 && n.totalEarned === 0 && G.getMineralIndex() === 0 && Object.keys(n.upgrades).length === 0 && Object.values(n.producers).every((v) => v === 0), 'renacer reinicia moneda, mineral, productores y mejoras');
  ok(n.totalClicks === 321 && n.playTime === 5000 && n.offlineReturns === 2 && n.achievements['clicks-1'] && n.settings === settingsBefore, 'renacer conserva clics, tiempo, logros y ajustes');
  ok(n.prestige.count === 1 && n.prestige.cores === 5 && n.prestige.coresEarned === 1 && n.prestige.skills.power === 1, 'renacer suma el contador y los Núcleos y conserva habilidades');
  ok(n.prestige.runTime === 0 && n.prestige.readyTime === -1 && n.prestige.lastRunTime === 3600 && n.prestige.lastRunMineral === first, 'renacer guarda cuánto tardó la vuelta');
  ok(n.prestige.unlocked, 'tras renacer el botón queda desbloqueado');
  ok(!G.canPrestige() && G.getPrestigeTarget() === first + Math.floor(pc.mineralsPerPrestige), 'tras renacer hay que volver a llegar (algo más lejos)');

  // Tick: marca el botón y el tiempo de la vuelta
  s = fresh(); G.tick(10); ok(!s.prestige.unlocked && s.prestige.readyTime === -1 && near(s.prestige.runTime, 10), 'tick suma tiempo de vuelta');
  reach(s, first); G.tick(5); ok(s.prestige.unlocked && near(s.prestige.readyTime, 15), 'tick marca cuándo se pudo renacer');
  G.tick(5); ok(near(s.prestige.readyTime, 15) && near(s.prestige.runTime, 20), 'readyTime no se mueve después');

  // Habilidades
  s = fresh();
  const power = G.skillById.power, strike = G.skillById.strike, discount = G.skillById.discount;
  ok(!G.canBuySkill('power') && !G.buySkill('power') && G.getSkillLevel('power') === 0, 'sin Núcleos no se compra');
  s.prestige.cores = 100;
  ok(G.getPrestigeMultiplier() === 1, 'sin habilidades el multiplicador es ×1');
  ok(G.buySkill('power') && s.prestige.cores === 100 - power.levels[0].cost && G.getSkillLevel('power') === 1, 'comprar descuenta los Núcleos');
  ok(near(G.getPrestigeMultiplier(), power.levels[0].value), 'globalMult: valor del nivel');
  s.producers.novice = 10;
  ok(near(G.getPps(), 10 * config.producers[0].baseProduction * power.levels[0].value) && near(G.getClickValue(), config.click.base * power.levels[0].value), 'la habilidad global multiplica producción y clic');
  while (G.buySkill('power'));
  ok(G.getSkillLevel('power') === power.levels.length && G.getSkillCost('power') === null && !G.canBuySkill('power'), 'se detiene en el nivel máximo');
  ok(near(G.getPrestigeMultiplier(), power.levels[power.levels.length - 1].value), 'el nivel máximo da el valor del último nivel');
  const clickBefore = G.getClickValue(), ppsBefore = G.getPps(); G.buySkill('strike');
  ok(near(G.getClickValue(), clickBefore * strike.levels[0].value) && near(G.getPps(), ppsBefore), 'clickMult solo multiplica el clic');

  s = fresh(); s.prestige.cores = 50; s.currency = 5000;
  const costBefore = G.getProducerCost('barrow', 10, 3), maxBefore = G.getMaxAffordable('barrow');
  G.buySkill('discount');
  ok(Math.abs(G.getProducerCost('barrow', 10, 3) - costBefore * discount.levels[0].value) <= 1, 'costMult abarata los productores');
  const maxAfter = G.getMaxAffordable('barrow');
  ok(maxAfter >= maxBefore && G.getProducerCost('barrow', maxAfter) <= 5000 && G.getProducerCost('barrow', maxAfter + 1) > 5000, 'comprar máx. con descuento es coherente');
  s.producers.novice = 1; const maxNow = G.getMaxAffordable('barrow'); // el siguiente productor solo se abre al tener el anterior
  ok(G.buyProducer('barrow', 'max') && s.producers.barrow === maxNow && s.currency >= 0, 'la compra real usa el precio con descuento');

  s = fresh(); s.prestige.cores = 50; G.buySkill('dream');
  ok(near(G.getOfflineRate(), config.offline.rate + G.skillById.dream.levels[0].value), 'offlineRate suma a la fracción offline');
  const NOW2 = 1_700_000_000_000; G.obtenerHora = () => NOW2; s.producers.novice = 100;
  const expected = G.getPps() * 3600 * G.getOfflineRate(); // antes de cobrar: cobrar puede subir de mineral
  ok(near(G.applyOffline(NOW2 - 3600 * 1000).earned, expected), 'las ganancias offline usan la fracción con habilidades');

  // Habilidades bloqueadas por número de renaceres
  s = fresh(); s.prestige.cores = 999;
  for (const u of pc.unlocks.filter((x) => x.skill)) {
    s.prestige.count = u.at - 1; ok(!G.isSkillUnlocked(u.skill) && !G.canBuySkill(u.skill) && !G.buySkill(u.skill), u.skill + ' bloqueada antes del renacer ' + u.at);
    s.prestige.count = u.at; ok(G.isSkillUnlocked(u.skill) && G.buySkill(u.skill), u.skill + ' se abre en el renacer ' + u.at);
  }
  s = fresh(); s.prestige.count = pc.unlocks.find((u) => u.skill === 'legacy').at; s.prestige.skills.legacy = 1;
  ok(near(G.getPrestigeMultiplier(), 1 + G.skillById.legacy.levels[0].value * s.prestige.count), 'prestigeMult: +x por cada renacer hecho');

  // Mecánica de los 10 renaceres: Autominero
  s = fresh(); s.producers.novice = 10; const feat = pc.unlocks.find((u) => u.feature === 'autoMiner');
  s.prestige.count = feat.at - 1; ok(!G.hasFeature('autoMiner') && G.getIncomePerSecond() === G.getPps(), 'sin Autominero antes del renacer ' + feat.at);
  s.prestige.count = feat.at; ok(G.hasFeature('autoMiner') && near(G.getAutoMinerIncome(), G.getClickValue() * pc.autoMiner.clicksPerSecond), 'el Autominero pica solo desde el renacer ' + feat.at);
  const before = s.currency; G.tick(10);
  ok(near(s.currency - before, G.getIncomePerSecond() * 10) && G.getIncomePerSecond() > G.getPps() && s.totalClicks === 0, 'el Autominero gana en cada tick sin contar como clics');
  const NOW3 = 1_700_000_000_000; G.obtenerHora = () => NOW3; s.currency = 0; s.totalEarned = 0;
  const expectedAuto = G.getPps() * 3600 * G.getOfflineRate();
  ok(near(G.applyOffline(NOW3 - 3600 * 1000).earned, expectedAuto), 'offline no cuenta el Autominero');

  // Ventaja al renacer: moneda y cuadrilla inicial
  s = fresh(); reach(s, first); s.prestige.cores = 100;
  for (const id of ['fund', 'crew']) while (G.buySkill(id));
  const fund = G.skillById.fund, crew = G.skillById.crew;
  G.prestigeNow();
  const cash = fund.levels[fund.levels.length - 1].value, team = crew.levels[crew.levels.length - 1].value;
  ok(G.state.currency === cash && G.state.totalEarned >= G.state.currency, 'startCash: se empieza con moneda (y el total no baja de ella)');
  ok(Object.keys(team).every((id) => G.state.producers[id] === team[id]), 'startProducers: se empieza con la cuadrilla');
  ok(G.getPps() > 0, 'se empieza ya produciendo');
}

// ── Prestigio: guardado y partidas antiguas ─────────────────
{
  const fs = require('fs');
  const key = config.saveKey;
  const put = (state, extra) => { store[key] = JSON.stringify({ version: 3, savedAt: 1, ...extra, state }); return G.storage.load(); };
  ok(config.saveVersion >= 4, 'saveVersion sube con el prestigio');

  // Guardado REAL de la versión 3, escrito por el juego antes de existir el prestigio (tools/fixtures)
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v3.json'), 'utf8');
  const old = JSON.parse(raw);
  ok(old.version === 3 && !('prestige' in old.state), 'el fixture es un guardado v3 sin prestigio');
  store[key] = raw;
  const L = G.storage.load();
  ok(L !== null && L.savedAt === old.savedAt, 'una partida v3 real se carga');
  const o = old.state, m = L.state;
  ok(m.currency === o.currency && m.totalEarned === o.totalEarned && m.totalClicks === o.totalClicks && m.playTime === o.playTime, 'v3: moneda, total, clics y tiempo intactos');
  ok(Object.keys(o.producers).every((k) => m.producers[k] === o.producers[k]) && JSON.stringify(m.upgrades) === JSON.stringify(o.upgrades) && JSON.stringify(m.achievements) === JSON.stringify(o.achievements), 'v3: productores, mejoras y logros intactos');
  ok(Object.keys(o.settings).every((k) => m.settings[k] === o.settings[k]) && m.settings.adsConsent === 'unset', 'v3: ajustes intactos (y la elección de anuncios sin hacer)');
  ok(m.prestige.count === 0 && m.prestige.cores === 0 && Object.keys(m.prestige.skills).length === 0 && m.prestige.runTime === o.playTime && m.prestige.readyTime === -1, 'v3: el prestigio empieza en blanco');
  G.state = m;
  ok(G.getPps() > 0 && Number.isFinite(G.getClickValue()) && G.getPrestigeMultiplier() === 1, 'v3: la partida funciona (producción y clic con multiplicador ×1)');
  G.tick(1); ok(Number.isFinite(G.state.currency), 'v3: un tick no rompe nada');
  G.storage.save();
  const resaved = JSON.parse(store[key]);
  ok(resaved.version === config.saveVersion && resaved.state.prestige && resaved.state.prestige.count === 0, 'v3: al guardar queda en la versión nueva');
  ok(JSON.stringify(G.storage.load().state) === JSON.stringify(G.state), 'v3: guardar y cargar de nuevo da lo mismo');
  G.state.totalEarned = G.minerals[G.getPrestigeTarget()].unlockAt; ok(G.canPrestige(), 'v3: una partida avanzada puede renacer');
  // El código de importación antiguo (v3) también entra
  const codeFile = path.join(__dirname, 'codigo-importar.txt');
  if (fs.existsSync(codeFile)) {
    const imported = G.storage.parseCode(fs.readFileSync(codeFile, 'utf8'));
    ok(imported.prestige.count === 0 && imported.totalEarned > 0, 'código de importación v3 válido');
  }

  // Valores raros del prestigio
  let loaded = put({ prestige: { count: 3.9, cores: -2, coresEarned: 'x', skills: { power: 99, strike: 0, discount: 1.5, fantasma: 3, fund: -1 }, unlocked: 'sí', runTime: 'a', readyTime: -7, lastRunTime: 12, lastRunMineral: 9 } });
  const p = loaded.state.prestige;
  ok(p.count === 3 && p.cores === 0 && p.coresEarned === 0, 'prestigio: cantidades saneadas');
  ok(p.skills.power === G.skillById.power.levels.length && Object.keys(p.skills).length === 1, 'prestigio: niveles recortados al máximo y habilidades raras descartadas');
  ok(p.unlocked === false && p.runTime === 0 && p.readyTime === -1 && p.lastRunTime === 12 && p.lastRunMineral === 9, 'prestigio: resto de campos saneados');
  loaded = put({ prestige: 'hola' }); ok(loaded.state.prestige.count === 0, 'prestigio que no es objeto → en blanco');

  // Ida y vuelta con prestigio
  const s = fresh();
  Object.assign(s.prestige, { count: 12, cores: 3, coresEarned: 20, skills: { power: 2, crew: 1 }, unlocked: true, runTime: 99, readyTime: 60, lastRunTime: 120, lastRunMineral: 10 });
  G.storage.save(); ok(JSON.stringify(G.storage.load().state) === JSON.stringify(s), 'guardar y cargar conserva el prestigio');
  ok(JSON.stringify(G.storage.parseCode(G.storage.exportCode())) === JSON.stringify(s), 'exportar → importar conserva el prestigio');
  G.resetGame(); ok(G.state.prestige.count === 0 && G.state.prestige.cores === 0, 'reiniciar la partida borra también el prestigio');
}

// ── Hitos ───────────────────────────────────────────────────
{
  const ms = G.milestones;
  const idx = (id) => config.minerals.findIndex((m) => m.id === id);
  const reach = (st, mineralIndex) => { st.totalEarned = Math.max(st.totalEarned, G.minerals[mineralIndex].unlockAt); st.currency = Math.min(st.currency, st.totalEarned); };

  ok(ms.length === config.milestones.length && new Set(ms.map((m) => m.id)).size === ms.length, 'hitos con id único');
  ok(ms.every((m) => m.icon && m.feature && m.index > 0), 'hitos con icono, novedad y mineral válido');
  ok(ms.every((m, i, a) => i === 0 || a[i - 1].index <= m.index), 'hitos ordenados por mineral');
  ok(ms.every((m) => m.mineral !== undefined && idx(m.mineral) === m.index), 'el mineral del hito sale del config');
  ok(ms.find((m) => m.id === 'rebirth').mineral === config.prestige.firstMineral, 'el hito de renacer coincide con el mineral de renacer');

  let s = fresh();
  ok(!G.hasMilestone('crit') && !G.hasFeature('crit') && G.getNextMilestone() === ms[0], 'al empezar no hay hitos');
  ok(G.checkMilestones().length === 0, 'sin llegar a ningún mineral no se cumple nada');
  const base = G.getClickValue();
  let r = G.mine(() => 0);
  ok(r.crit === false && near(r.gain, base), 'sin el hito no hay críticos aunque el azar los diera');

  reach(s, ms[0].index - 1); ok(G.checkMilestones().length === 0, 'un mineral antes del hito no basta');
  reach(s, ms[0].index);
  let got = G.checkMilestones();
  ok(got.length === 1 && got[0].id === ms[0].id && G.hasMilestone(ms[0].id), 'al llegar al mineral se cumple el hito');
  ok(G.checkMilestones().length === 0, 'cada hito se avisa una sola vez');
  ok(G.getNextMilestone() === ms[1], 'el siguiente hito pasa al siguiente');

  // Golpe crítico
  reach(s, idx('clay')); G.checkMilestones();
  ok(G.hasFeature('crit'), 'el hito abre el golpe crítico');
  const value = G.getClickValue(), clicks = s.totalClicks, before = s.currency;
  r = G.mine(() => 0);
  ok(r.crit === true && near(r.gain, value * config.crit.mult) && s.totalClicks === clicks + 1 && near(s.currency - before, r.gain), 'crítico: ×mult, cuenta como clic y suma a la moneda');
  r = G.mine(() => config.crit.chance); ok(r.crit === false && near(r.gain, value), 'el límite de probabilidad no es crítico');
  r = G.mine(() => 0.999); ok(r.crit === false, 'sin suerte no hay crítico');
  let hits = 0; for (let i = 0; i < 20000; i++) if (G.mine().crit) hits++;
  ok(Math.abs(hits / 20000 - config.crit.chance) < 0.02, 'la frecuencia real de críticos ronda ' + config.crit.chance + ' (' + hits / 20000 + ')');
  s.producers.novice = 10; s.prestige.count = config.prestige.unlocks.find((u) => u.feature === 'autoMiner').at;
  ok(near(G.getAutoMinerIncome(), G.getClickValue() * config.prestige.autoMiner.clicksPerSecond), 'el Autominero no hace críticos');
  s.prestige.count = 0;

  // Producción: el informe suma lo mismo que el multiplicador
  const parts = G.getMultiplierParts();
  ok(near(parts.upgrades * parts.mineral * parts.achievements * parts.prestige * parts.dex * parts.catalog * parts.challenge * parts.boost, G.getGlobalMultiplier()), 'el informe de multiplicadores cuadra con el real');

  // Saltar muchos minerales de golpe cumple todos los hitos, en orden
  s = fresh(); s.totalEarned = 1e300; got = G.checkMilestones();
  ok(got.length === ms.length && got.every((m, i) => m === ms[i]) && G.getNextMilestone() === null, 'llegar lejos cumple todos los hitos en orden');

  // Los hitos sobreviven a renacer
  s = fresh(); s.totalEarned = G.minerals[idx(config.prestige.firstMineral)].unlockAt; G.checkMilestones();
  ok(G.canPrestige(), 'preparado para renacer');
  G.prestigeNow();
  ok(G.getMineralIndex() === 0 && G.hasMilestone('crit') && G.hasFeature('crit') && G.hasMilestone('rebirth'), 'tras renacer los hitos y el golpe crítico siguen abiertos');

  // Guardado: valores raros, partida v3 real y ida y vuelta
  const key = config.saveKey;
  store[key] = JSON.stringify({ version: 4, savedAt: 1, state: { milestones: { crit: true, fantasma: true, report: 'sí' } } });
  const loaded = G.storage.load().state.milestones;
  ok(loaded.crit === true && Object.keys(loaded).length === 1, 'hitos: solo se aceptan ids reales con true');
  store[key] = JSON.stringify({ version: 5, savedAt: 1, state: { milestones: { combo: true, golden: true } } });
  const old = G.storage.load().state.milestones;
  ok(old.golden === true && !('combo' in old), 'un guardado con el hito de combo (ya retirado) se carga sin él');
  store[key] = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'save-v3.json'), 'utf8');
  G.state = G.storage.load().state;
  ok(Object.keys(G.state.milestones).length === 0, 'v3: sin hitos guardados');
  got = G.checkMilestones();
  ok(got.length >= 1 && got[0].id === ms[0].id && G.hasFeature('crit'), 'v3: en el primer tick se cumplen los hitos que ya tocaban (según su mineral)');
  s = fresh(); s.milestones.crit = true; G.storage.save();
  ok(JSON.stringify(G.storage.load().state) === JSON.stringify(s), 'guardar y cargar conserva los hitos');
  ok(JSON.stringify(G.storage.parseCode(G.storage.exportCode())) === JSON.stringify(s), 'exportar → importar conserva los hitos');
  G.resetGame(); ok(Object.keys(G.state.milestones).length === 0, 'reiniciar la partida borra los hitos');
}

// ── Eventos: frenesí y mineral dorado ─────────────────
{
  const ev = config.events;
  const idx = (id) => config.minerals.findIndex((m) => m.id === id);
  const open = (s, ...ids) => { for (const id of ids) s.milestones[config.milestones.find((m) => m.feature === id).id] = true; };
  const reset = () => { const s = fresh(); G.resetEvents(); return s; };
  const advance = (secs) => { for (let t = 0; t < secs; t += 1) G.tickEvents(Math.min(1, secs - t)); }; // los ticks largos se recortan: se avanza de 1 en 1

  // Catálogo
  ok(ev.golden.rewards.every((r) => r.weight > 0 && ['frenzy', 'lump'].includes(r.id)), 'recompensas del dorado con peso y tipo conocido');
  ok(ev.golden.minInterval > 0 && ev.golden.maxInterval >= ev.golden.minInterval && ev.golden.lifetime > 0, 'intervalos del dorado coherentes');
  ok(config.milestones.some((m) => m.feature === 'golden') && !('combo' in ev), 'el dorado se abre con un hito y el combo ya no existe');

  // Frenesí
  let s = reset(); s.producers.novice = 10;
  const base = G.getPps(), clickBase = G.getClickValue();
  ok(G.getBoostMultiplier() === 1, 'sin frenesí el multiplicador es ×1');
  G.live.boostTime = 10; G.live.boostMult = 5;
  ok(near(G.getPps(), base * 5) && near(G.getClickValue(), clickBase * 5), 'el frenesí multiplica producción y clic');
  G.tickEvents(4); ok(near(G.live.boostTime, 6) && G.getBoostMultiplier() === 5, 'el frenesí se gasta con el tiempo');
  advance(100); ok(G.live.boostTime === 0 && G.getBoostMultiplier() === 1 && near(G.getPps(), base), 'al acabar vuelve a ×1');
  ok(near(G.getMultiplierParts().boost, 1), 'el informe incluye el frenesí');

  // Un tick enorme no adelanta los eventos más allá de maxTickSeconds
  G.resetEvents(); G.live.boostTime = 100; G.live.boostMult = 2; G.tickEvents(3600); ok(near(G.live.boostTime, 100 - ev.maxTickSeconds), 'un tick largo apenas avanza los eventos');

  // Mineral dorado
  s = reset();
  G.tickEvents(1000); ok(G.live.golden === null, 'sin el hito no sale ningún dorado');
  open(s, 'golden');
  ok(G.collectGolden() === null, 'sin dorado a la vista no hay nada que tocar');
  advance(ev.golden.firstDelay - 1);
  ok(G.live.golden === null, 'el primero tarda firstDelay');
  G.tickEvents(2); ok(G.live.golden && G.live.golden.id === 1 && near(G.live.golden.left, ev.golden.lifetime), 'sale el primer dorado');
  advance(ev.golden.lifetime - 0.1); ok(G.live.golden !== null, 'sigue a la vista mientras no acabe su tiempo');
  G.tickEvents(0.2);
  ok(G.live.golden === null && G.live.goldenTimer >= ev.golden.minInterval * 0.999 && G.live.goldenTimer <= ev.golden.maxInterval, 'si no se toca se va y programa el siguiente');
  // Frecuencia con las habilidades
  G.live.goldenTimer = 0; G.tickEvents(0.1); ok(G.live.golden && G.live.golden.id === 2, 'el siguiente sale al acabar el tiempo');

  // Recompensas (con el azar inyectado: primera = frenesí, última = botín)
  const total = ev.golden.rewards.reduce((a, x) => a + x.weight, 0);
  const frenzy = ev.golden.rewards.find((x) => x.id === 'frenzy'), lump = ev.golden.rewards.find((x) => x.id === 'lump');
  s.producers.novice = 100;
  let got = G.collectGolden(() => 0);
  ok(got.kind === 'frenzy' && got.mult === frenzy.mult && near(got.seconds, frenzy.seconds) && G.getBoostMultiplier() === frenzy.mult && near(G.live.boostTime, frenzy.seconds), 'tocarlo puede dar un frenesí');
  ok(G.live.golden === null && G.live.goldenTimer > 0, 'al tocarlo desaparece y se programa el siguiente');
  G.resetEvents(); G.live.golden = { id: 1, left: 5 };
  const pps = G.getPps(), before = s.currency;
  got = G.collectGolden(() => 0.999);
  ok(got.kind === 'lump' && near(got.amount, Math.max(pps * lump.seconds, G.getClickValue() * lump.minClicks)) && near(s.currency - before, got.amount) && s.totalEarned >= got.amount, 'tocarlo puede dar un botín que cuenta como ganado');
  fresh(); G.resetEvents(); G.live.golden = { id: 1, left: 5 };
  got = G.collectGolden(() => 0.999); ok(near(got.amount, G.getClickValue() * lump.minClicks), 'sin producción el botín se mide en clics');
  // El reparto sigue los pesos
  let frenzies = 0; const N = 20000;
  for (let i = 0; i < N; i++) { G.live.golden = { id: 1, left: 5 }; if (G.collectGolden().kind === 'frenzy') frenzies++; }
  ok(Math.abs(frenzies / N - frenzy.weight / total) < 0.02, 'el reparto de recompensas sigue los pesos (' + (frenzies / N).toFixed(3) + ')');
  // Un frenesí nuevo no recorta uno mejor que ya está en marcha
  G.resetEvents(); G.live.boostTime = 50; G.live.boostMult = 20; G.live.golden = { id: 1, left: 5 }; G.collectGolden(() => 0);
  ok(G.live.boostMult === 20 && G.live.boostTime === 50, 'un frenesí menor no recorta a uno mayor');

  // Habilidades del dorado
  s = reset(); open(s, 'golden'); s.prestige.cores = 100;
  const rate = G.skillById.goldRate, power = G.skillById.goldPower;
  ok(G.buySkill('goldRate') && G.buySkill('goldPower'), 'las habilidades del dorado se compran');
  let max = 0; for (let i = 0; i < 200; i++) { G.live.golden = { id: 1, left: 5 }; G.collectGolden(() => 0.999); max = Math.max(max, G.live.goldenTimer); }
  ok(max <= ev.golden.maxInterval * rate.levels[0].value + 1e-9, 'goldenRate acorta el tiempo hasta el siguiente');
  G.live.golden = { id: 1, left: 5 }; got = G.collectGolden(() => 0);
  ok(near(got.seconds, frenzy.seconds * power.levels[0].value), 'goldenPower alarga el frenesí');
  G.resetEvents(); s.producers.novice = 100; G.live.golden = { id: 1, left: 5 };
  const expectedLump = Math.max(G.getPps() * lump.seconds, G.getClickValue() * lump.minClicks) * power.levels[0].value;
  ok(near(G.collectGolden(() => 0.999).amount, expectedLump), 'goldenPower multiplica el botín');

  // Lo temporal no se guarda ni se arrastra
  s = reset(); G.live.boostTime = 9; G.live.boostMult = 5; G.storage.save();
  ok(!('live' in G.storage.load().state) && !JSON.stringify(G.state).includes('boostTime'), 'los eventos no entran en el guardado');
  G.resetEvents(); ok(G.live.boostTime === 0 && G.live.golden === null, 'resetEvents lo deja limpio');
}

// ── Misiones: inicio y objetivos diarios ─────────────────────
{
  const mc = config.missions, daily = mc.daily;
  const features = new Set([...config.milestones.map((m) => m.feature), ...config.prestige.unlocks.filter((u) => u.feature).map((u) => u.feature)]);
  const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime(); // mediodía local de esa fecha
  const setDay = (y, m, d) => { const t = at(y, m, d); G.obtenerHora = () => t; };
  const open = (st, ...ids) => { for (const id of ids) st.milestones[config.milestones.find((x) => x.feature === id).id] = true; };

  // Catálogo
  ok(daily.pool.length > 0 && new Set(daily.pool.map((g) => g.id)).size === daily.pool.length, 'objetivos diarios con id único');
  ok(daily.pool.every((g) => ['clicks', 'play', 'bought', 'crit', 'golden', 'prestige'].includes(g.counter) && g.target > 0 && g.seconds > 0 && g.minClicks > 0), 'objetivos con contador conocido, meta y recompensa');
  ok(daily.pool.every((g) => !g.requires || features.has(g.requires)), 'los objetivos piden novedades que existen');
  const basic = new Set(daily.pool.filter((g) => !g.requires).map((g) => g.counter));
  ok(basic.size >= daily.count, 'siempre hay al menos ' + daily.count + ' tipos de objetivo sin requisitos (para el primer día)');
  ok(mc.intro.length > 0 && new Set(mc.intro.map((m) => m.id)).size === mc.intro.length && mc.intro.every((m) => m.cash > 0), 'misiones de inicio con id único y recompensa');
  ok(mc.intro.every((m) => (m.producer ? m.producer in G.state.producers && m.count > 0 : m.mineral ? config.minerals.some((x) => x.id === m.mineral) : (m.clicks > 0 || m.upgrades > 0))), 'misiones de inicio con una condición válida');
  ok(daily.gift.seconds > 0 && daily.gift.maxStreak >= 1 && daily.allBonus.seconds > 0, 'regalo y bonus coherentes');

  // Misiones de inicio
  let s = fresh();
  ok(!G.isIntroDone() && G.getIntroMission() === mc.intro[0] && G.checkIntro().length === 0, 'al empezar toca la primera misión');
  s.totalClicks = mc.intro[0].clicks - 1; ok(G.checkIntro().length === 0 && near(G.getIntroProgress(mc.intro[0]).fraction, (mc.intro[0].clicks - 1) / mc.intro[0].clicks), 'a medias no se cumple');
  s.totalClicks = mc.intro[0].clicks;
  let done = G.checkIntro();
  ok(done.length === 1 && done[0] === mc.intro[0] && s.missions.intro === 1 && s.currency === mc.intro[0].cash && s.totalEarned === mc.intro[0].cash, 'se cumple, se cobra y sale la siguiente');
  ok(G.getIntroMission() === mc.intro[1] && G.checkIntro().length === 0, 'cada misión se cobra una vez');
  s.producers.novice = 1; s.upgrades.pick = true; done = G.checkIntro();
  ok(done.length === 2 && s.missions.intro === 3, 'varias misiones cumplidas a la vez se cobran en orden');
  s.totalEarned = G.minerals[1].unlockAt; done = G.checkIntro();
  ok(done.length === 1 && G.isIntroDone() && G.getIntroMission() === null && G.checkIntro().length === 0, 'la última cierra el recorrido');
  ok(G.getIntroProgress(mc.intro[3]).fraction === 1 && G.getIntroProgress(mc.intro[3]).have <= G.getIntroProgress(mc.intro[3]).need, 'el progreso no pasa de la meta');
  {
    const mission = mc.intro[3];
    const target = G.minerals.findIndex((m) => m.id === mission.mineral);
    for (const earned of [0, 1, 500, 11_400, G.minerals[target].unlockAt - 1]) {
      s.totalEarned = earned;
      const mp = G.getMineralProgress();
      const ip = G.getIntroProgress(mission);
      ok(mp.index !== target - 1 || near(ip.fraction, mp.fraction), 'la barra de la misión de mineral coincide con la del HUD (' + earned + ')');
      ok(ip.fraction >= 0 && ip.fraction < 1, 'sin llegar al umbral la misión no está completa (' + earned + ')');
    }
  }

  // Fechas y racha
  setDay(2026, 10, 31); ok(G.dayKey() === '2026-10-31', 'dayKey da la fecha local');
  s = fresh();
  ok(G.checkDay() === true && s.missions.day === '2026-10-31' && s.missions.streak === 1 && s.missions.goals.length === daily.count, 'el primer día empieza con racha 1 y objetivos');
  ok(G.checkDay() === false, 'el mismo día no vuelve a empezar');
  const firstGoals = JSON.stringify(s.missions.goals);
  setDay(2026, 11, 1); ok(G.checkDay() && s.missions.streak === 2 && s.missions.day === '2026-11-01', 'al día siguiente (cambiando de mes) la racha sube');
  setDay(2026, 11, 2); G.checkDay(); setDay(2026, 11, 3); G.checkDay(); ok(s.missions.streak === 4, 'la racha sigue subiendo');
  setDay(2026, 11, 6); G.checkDay(); ok(s.missions.streak === 1, 'saltarse un día rompe la racha');
  setDay(2026, 11, 5); ok(G.checkDay() === false && s.missions.day === '2026-11-06' && s.missions.streak === 1, 'un reloj atrasado no cuenta como día nuevo');
  setDay(2027, 1, 1); s.missions.day = '2026-12-31'; s.missions.streak = 5; G.checkDay(); ok(s.missions.streak === 6, 'la racha cruza el cambio de año');

  // Elección de objetivos
  const kinds = (goals) => goals.map((g) => G.dailyGoalDef(g.id).counter);
  s = fresh();
  const sameA = JSON.stringify(G.pickDailyGoals('2026-10-31')), sameB = JSON.stringify(G.pickDailyGoals('2026-10-31'));
  ok(sameA === sameB, 'el mismo día sale lo mismo');
  const days = []; for (let d = 1; d <= 60; d++) days.push(G.pickDailyGoals('2026-11-' + String(d).padStart(2, '0')).map((g) => g.id).join());
  ok(new Set(days).size > 5, 'cada día sale una combinación distinta (' + new Set(days).size + ' de 60)');
  ok(Array.from({ length: 60 }, (_, d) => G.pickDailyGoals('2026-12-' + (d + 1))).every((g) => new Set(kinds(g)).size === daily.count && g.length === daily.count), 'tres tipos distintos cada día');
  ok(Array.from({ length: 60 }, (_, d) => G.pickDailyGoals('2026-12-' + (d + 1))).every((g) => kinds(g).every((k) => basic.has(k))), 'sin novedades abiertas solo salen objetivos básicos');
  open(s, 'crit', 'golden', 'rebirth');
  const seen = new Set(); for (let d = 1; d <= 120; d++) for (const k of kinds(G.pickDailyGoals('2027-02-' + d))) seen.add(k);
  ok(['clicks', 'play', 'bought', 'crit', 'golden', 'prestige'].every((k) => seen.has(k)), 'con todo abierto salen todos los tipos');
  ok(G.pickDailyGoals('2027-03-01').every((g) => g.claimed === false && g.base >= 0), 'los objetivos nuevos parten sin reclamar');

  // Contadores y progreso
  s = fresh(); open(s, 'crit', 'golden'); setDay(2026, 10, 31); G.checkDay();
  s.missions.goals = [{ id: 'clicks-a', base: 0, claimed: false }, { id: 'bought-a', base: 0, claimed: false }, { id: 'crit-a', base: 0, claimed: false }];
  s.currency = 1e12; s.totalEarned = 1e12; G.buyProducer('novice', 3); G.buyUpgrade('pick');
  ok(s.stats.bought === 4 && G.getGoalProgress(s.missions.goals[1]).have === 4, 'comprar cuenta unidades y mejoras');
  const clicks0 = s.totalClicks; G.mine(() => 0.999); ok(G.getGoalProgress(s.missions.goals[0]).have === s.totalClicks - clicks0 + clicks0, 'los clics cuentan');
  G.mine(() => 0); ok(s.stats.crits === 1 && G.getGoalProgress(s.missions.goals[2]).have === 1, 'los críticos cuentan');
  G.resetEvents(); G.live.golden = { id: 1, left: 5 }; G.collectGolden(); ok(s.stats.goldens === 1, 'los dorados cuentan');
  s.stats.bought = 1e6; ok(G.getGoalProgress(s.missions.goals[1]).fraction === 1 && G.getGoalProgress(s.missions.goals[1]).have === G.dailyGoalDef('bought-a').target, 'el progreso no pasa de la meta');
  s.missions.goals[0].base = 5; s.totalClicks = 3; ok(G.getGoalProgress(s.missions.goals[0]).have === 0, 'el progreso nunca es negativo');

  // Reclamar
  s = fresh(); setDay(2026, 10, 31); G.checkDay(); s.producers.novice = 50;
  s.missions.goals = [{ id: 'clicks-a', base: 0, claimed: false }, { id: 'play-a', base: 0, claimed: false }, { id: 'bought-a', base: 0, claimed: false }];
  ok(!G.canClaimGoal(0) && G.claimGoal(0) === null && G.claimGoal(7) === null, 'sin cumplir no se reclama');
  s.totalClicks = 1000; ok(G.canClaimGoal(0) && G.countClaimable() === 2, 'cumplido se puede reclamar (y el regalo cuenta)');
  const g0 = G.dailyGoalDef('clicks-a'), expect0 = G.getRewardAmount(g0.seconds, g0.minClicks), cash0 = s.currency;
  let got = G.claimGoal(0);
  ok(got && near(got.amount, expect0) && got.bonus === 0 && near(s.currency - cash0, expect0) && s.totalEarned >= expect0, 'reclamar da la recompensa (segundos de producción)');
  ok(G.claimGoal(0) === null && !G.canClaimGoal(0), 'no se reclama dos veces');
  s.playTime = 1e5; s.stats.bought = 1e5; G.claimGoal(1);
  const expBonus = G.getRewardAmount(daily.allBonus.seconds, daily.allBonus.minClicks), before = s.currency; got = G.claimGoal(2);
  ok(got.bonus > 0 && s.missions.allClaimed && near(got.bonus, expBonus) && near(s.currency - before, got.amount + got.bonus), 'reclamar los tres da el bonus');
  s.missions.goals.forEach((g) => { g.claimed = true; }); ok(G.claimGoal(0) === null && s.missions.allClaimed, 'el bonus se da una vez');
  // La recompensa se mide con la producción normal, no con el frenesí
  s = fresh(); s.producers.novice = 100; const plain = G.getRewardAmount(60, 1); G.live.boostTime = 10; G.live.boostMult = 5;
  ok(near(G.getRewardAmount(60, 1), plain), 'la recompensa no se infla con un frenesí'); G.resetEvents();
  s = fresh(); ok(near(G.getRewardAmount(60, 30), G.getClickValue() * 30), 'sin producción la recompensa se mide en clics');

  // Regalo diario y racha
  setDay(2026, 10, 31); s = fresh(); s.producers.novice = 20; ok(!G.canClaimGift() && G.claimGift() === null, 'sin empezar el día no hay regalo');
  G.checkDay(); ok(G.canClaimGift() && G.getGiftMultiplier() === 1, 'el primer día el regalo es ×1');
  const gift1 = G.getGiftAmount(); got = G.claimGift();
  ok(near(got.amount, gift1) && near(gift1, G.getRewardAmount(daily.gift.seconds, daily.gift.minClicks)) && !G.canClaimGift() && G.claimGift() === null, 'el regalo se cobra una vez al día');
  s.missions.streak = 99; ok(G.getGiftMultiplier() === daily.gift.maxStreak, 'el regalo crece con la racha hasta el tope');
  s.missions.streak = 3; ok(near(G.getGiftAmount(), G.getRewardAmount(daily.gift.seconds * 3, daily.gift.minClicks * 3)), 'regalo de racha 3');
  setDay(2026, 11, 1); G.checkDay(); ok(G.canClaimGift() && s.missions.allClaimed === false, 'un día nuevo trae regalo nuevo');

  // Renacer no borra las misiones ni los contadores
  s = fresh(); setDay(2026, 10, 31); G.checkDay(); s.stats = { bought: 7, crits: 3, goldens: 2 }; s.missions.intro = 4;
  s.totalEarned = G.minerals[config.prestige.firstMineral === 'iron' ? 7 : 7].unlockAt; const keepMissions = s.missions;
  G.prestigeNow(); ok(G.state.missions === keepMissions && G.state.stats.bought === 7 && G.state.stats.goldens === 2, 'renacer conserva misiones y contadores');

  // Guardado y partidas antiguas
  const key = config.saveKey;
  s = fresh(); setDay(2026, 10, 31); G.checkDay(); s.missions.intro = 2; s.missions.giftClaimed = true; s.stats.crits = 4; G.storage.save();
  ok(JSON.stringify(G.storage.load().state) === JSON.stringify(s), 'guardar y cargar conserva misiones y contadores');
  ok(JSON.stringify(G.storage.parseCode(G.storage.exportCode())) === JSON.stringify(s), 'exportar → importar conserva misiones');
  store[key] = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'save-v3.json'), 'utf8');
  let L = G.storage.load().state;
  ok(L.missions.intro === mc.intro.length && L.missions.day === '' && L.stats.bought === 0, 'v3 real: se salta las misiones de inicio y empieza sin día');
  G.state = L; ok(G.checkDay() && L.missions.streak === 1 && L.missions.goals.length === daily.count, 'v3 real: el primer tick abre el día y genera objetivos');
  store[key] = JSON.stringify({ version: 5, savedAt: 1, state: { currency: 0 } });
  ok(G.storage.load().state.missions.intro === 0, 'una partida vacía sin misiones sí ve las misiones de inicio');
  store[key] = JSON.stringify({ version: 5, savedAt: 1, state: { totalClicks: 12 } });
  ok(G.storage.load().state.missions.intro === mc.intro.length, 'una partida con clics se salta las misiones de inicio');
  store[key] = JSON.stringify({ version: 6, savedAt: 1, state: { totalClicks: 12, missions: { intro: 99, streak: -3, day: 'ayer', giftClaimed: 'sí', goals: [{ id: 'fantasma', base: 1 }] }, stats: { bought: -1, crits: 'x', goldens: 2.7 } } });
  L = G.storage.load().state;
  ok(L.missions.intro === mc.intro.length && L.missions.streak === 0 && L.missions.day === '' && L.missions.giftClaimed === false && L.missions.goals.length === 0, 'misiones raras saneadas');
  ok(L.stats.bought === 0 && L.stats.crits === 0 && L.stats.goldens === 2, 'contadores raros saneados');
  store[key] = JSON.stringify({ version: 6, savedAt: 1, state: { missions: { day: '2026-10-31', streak: 2, goals: [{ id: 'clicks-a', base: 5, claimed: true }, { id: 'nope', base: 0 }] } } });
  L = G.storage.load().state; ok(L.missions.day === '' && L.missions.goals.length === 0, 'un objetivo desconocido invalida los de ese día (se regeneran)');
  G.obtenerHora = () => Date.now();
}

// ── Biomas ──────────────────────────────────────────────────
{
  const bs = G.biomes;
  const hex = /^#[0-9a-f]{6}$/i;
  ok(bs.length === config.biomes.length && new Set(bs.map((b) => b.id)).size === bs.length, 'biomas con id único');
  ok(bs.every((b) => b.icon && b.first >= 0), 'biomas con icono y mineral de arranque válido');
  ok(bs[0].first === 0, 'el primer bioma empieza en el primer mineral');
  ok(bs.every((b, i, a) => i === 0 || a[i - 1].first < b.first), 'los biomas van en orden de escalera');
  ok(config.minerals.every((m, i) => G.getBiomeIndexOf(i) !== undefined), 'cada mineral tiene bioma');
  ok(config.minerals.every((m, i) => i === 0 || G.getBiomeIndexOf(i) >= G.getBiomeIndexOf(i - 1)), 'el bioma nunca retrocede al subir de mineral');
  ok(bs.every((b) => ['bg', 'bgDeep', 'glow', 'panel', 'panelRaised', 'line'].every((k) => hex.test(b.palette[k]))), 'paletas con los seis colores');
  const kinds = ['dust', 'drip', 'glint', 'snow', 'sparkle', 'ember', 'stars'];
  ok(bs.every((b) => kinds.includes(b.fx.kind) && b.fx.count >= 0 && b.fx.size[0] <= b.fx.size[1] && b.fx.seconds[0] <= b.fx.seconds[1] && (!b.fx.colors || b.fx.colors.every((c) => hex.test(c)))), 'partículas con tipo conocido y rangos coherentes');
  ok(new Set(bs.map((b) => b.fx.kind)).size > 4, 'los biomas se distinguen también por sus partículas');
  const lum = (c) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
  ok(bs.every((b) => lum(b.palette.bg) < 150 && lum(b.palette.panelRaised) < 260 && lum(b.palette.line) > lum(b.palette.panel)), 'paletas oscuras (el texto claro sigue legible) y con bordes visibles');
  fresh(); ok(G.getBiomeIndex() === 0, 'se empieza en el primer bioma');
  G.state.totalEarned = G.minerals[bs[1].first].unlockAt; ok(G.getBiomeIndex() === 1, 'al llegar al primer mineral de un bioma se entra en él');
  G.state.totalEarned = G.minerals[bs[1].first].unlockAt - 1; ok(G.getBiomeIndex() === 0, 'un mineral antes seguimos en el anterior');
  G.state.prestige.count = 1000; G.state.totalEarned = 1e300; ok(G.getBiomeIndex() === bs.length - 1, 'al final, el último bioma');
}

// ── Mineralpedia ─────────────────────────────────────────────
{
  const bonus = config.dex.biomeBonus;
  const reach = (st, i) => { st.totalEarned = Math.max(st.totalEarned, G.minerals[i].unlockAt); st.currency = Math.min(st.currency, st.totalEarned); };
  ok(bonus > 0 && bonus <= 0.1, 'bonus por bioma pequeño y positivo');
  ok(G.biomes.every((b) => b.last >= b.first) && G.biomes[G.biomes.length - 1].last === G.realMineralCount - 1, 'cada bioma conoce su último mineral');

  let s = fresh();
  ok(s.dex.best === 0 && s.dex.seen === 1 && G.isDiscovered(0) && !G.isDiscovered(1) && G.getDexCount() === 1, 'al empezar solo está el primer mineral');
  ok(G.getDexUnseen() === 0 && G.getDexMultiplier() === 1 && G.checkDex().length === 0, 'sin novedades ni bonus');
  reach(s, 3); ok(G.checkDex().length === 0 && s.dex.best === 3 && G.getDexCount() === 4 && G.getDexUnseen() === 3, 'al llegar a un mineral se descubren los anteriores y quedan sin ver');
  G.markDexSeen(); ok(G.getDexUnseen() === 0, 'abrir el álbum los marca como vistos');
  const first = G.biomes[0];
  ok(!G.isBiomeComplete(first) && G.getCompletedBiomes().length === 0, 'a medias el bioma no está completo');
  reach(s, first.last - 1); G.checkDex();
  reach(s, first.last); let done = G.checkDex();
  ok(done.length === 1 && done[0] === first && G.isBiomeComplete(first) && near(G.getDexMultiplier(), 1 + bonus), 'completar un bioma lo avisa una vez y da el bonus');
  ok(G.checkDex().length === 0, 'no se avisa dos veces');
  s.prestige.count = 1000; reach(s, G.realMineralCount - 1); done = G.checkDex();
  ok(done.length === G.biomes.length - 1 && near(G.getDexMultiplier(), 1 + bonus * G.biomes.length) && G.getDexCount() === G.realMineralCount, 'saltar al final completa todos los biomas de golpe');
  s.producers.novice = 10; const withDex = G.getPps(); s.dex.best = 0; ok(near(withDex / G.getPps(), 1 + bonus * G.biomes.length), 'el bonus entra en la producción');

  // Persiste al renacer
  s = fresh(); reach(s, 9); G.checkDex(); G.markDexSeen(); const kept = s.dex;
  s.totalEarned = G.minerals[config.minerals.findIndex((m) => m.id === config.prestige.firstMineral)].unlockAt; G.checkDex();
  const bestBefore = s.dex.best; G.prestigeNow();
  ok(G.state.dex === kept && G.state.dex.best === bestBefore && G.getMineralIndex() === 0 && G.isDiscovered(bestBefore), 'renacer conserva lo descubierto');
  ok(G.getDexUnseen() === 0, 'y no lo vuelve a marcar como novedad');

  // Guardado y partidas antiguas
  const key = config.saveKey;
  s = fresh(); s.dex = { best: 12, seen: 8 }; G.storage.save();
  ok(JSON.stringify(G.storage.load().state) === JSON.stringify(s), 'guardar y cargar conserva la Mineralpedia');
  ok(JSON.stringify(G.storage.parseCode(G.storage.exportCode())) === JSON.stringify(s), 'exportar → importar conserva la Mineralpedia');
  store[key] = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'save-v3.json'), 'utf8');
  let L = G.storage.load().state;
  ok(L.dex.best === 2 && L.dex.seen === 3, 'v3 real: lo descubierto sale del total ganado y no cuenta como novedad (best ' + L.dex.best + ')');
  store[key] = JSON.stringify({ version: 6, savedAt: 1, state: { totalEarned: G.minerals[10].unlockAt, currency: 0 } });
  L = G.storage.load().state; ok(L.dex.best === 10 && L.dex.seen === 11, 'sin dex guardado: se deduce del total ganado');
  store[key] = JSON.stringify({ version: 7, savedAt: 1, state: { dex: { best: 99, seen: 500 } } });
  L = G.storage.load().state; ok(L.dex.best === G.minerals.length - 1 && L.dex.seen === G.realMineralCount, 'dex fuera de rango se recorta (el álbum solo cuenta los de verdad)');
  store[key] = JSON.stringify({ version: 7, savedAt: 1, state: { dex: { best: -3, seen: 'x' } } });
  L = G.storage.load().state; ok(L.dex.best === 0 && L.dex.seen === 1, 'dex raro vuelve a los valores iniciales');
  store[key] = JSON.stringify({ version: 7, savedAt: 1, state: { dex: 'hola' } });
  L = G.storage.load().state; ok(L.dex.best >= 0, 'dex que no es objeto se deduce de la partida');
}

// ── Tarjeta compartible ──────────────────────────────────────
{
  const sc = config.share;
  ok(sc.title && Array.isArray(sc.size) && sc.size[0] > 0 && sc.size[1] > 0 && typeof sc.url === 'string', 'config de la tarjeta');

  // Total histórico
  let s = fresh();
  ok(s.stats.lifetime === 0, 'el total histórico empieza en 0');
  G.earn(500); G.mine(() => 0.999);
  ok(s.stats.lifetime === s.totalEarned && s.stats.lifetime >= 500, 'todo lo que se gana suma al total histórico');
  const lifeBefore = s.stats.lifetime;
  s.totalEarned = G.minerals[config.minerals.findIndex((m) => m.id === config.prestige.firstMineral)].unlockAt; s.stats.lifetime += s.totalEarned;
  const lifeAtRebirth = s.stats.lifetime; G.prestigeNow();
  ok(G.state.totalEarned === 0 && G.state.stats.lifetime === lifeAtRebirth && lifeAtRebirth > lifeBefore, 'renacer reinicia lo de la vuelta pero no el total histórico');
  G.earn(1000); ok(G.state.stats.lifetime === lifeAtRebirth + 1000, 'y sigue sumando después');

  // Datos
  s = fresh(); s.prestige.count = 12; s.dex.best = 23; s.stats.lifetime = 4.2e18; s.playTime = 7300; s.producers.novice = 10;
  const st = G.getShareStats();
  ok(st.prestiges === 12 && st.mineralIndex === 23 && st.mineral.id === 'diamond' && st.lifetime === 4.2e18 && st.playTime === 7300, 'datos de la tarjeta');
  ok(st.biome === G.biomes[G.getBiomeIndexOf(23)] && st.biome.id === 'crystal', 'el bioma es el del mineral más lejano');
  ok(st.dexCount === 24 && st.dexTotal === config.minerals.length && st.title === sc.title && near(st.pps, G.getPps()), 'Mineralpedia, título y producción');
  G.live.boostTime = 10; G.live.boostMult = 5; ok(near(G.getShareStats().pps, st.pps), 'la producción de la tarjeta no cuenta el frenesí'); G.resetEvents();
  s.settings.language = 'es'; s.settings.notation = 'scientific';
  const txt = G.getShareText();
  ok(txt.includes('Prestigio 12') && txt.includes('Diamante') && txt.includes('4.20e18') && txt.includes(sc.title) && txt.includes('¿Me superas?'), 'texto con prestigio, mineral y total: ' + txt);
  s.settings.language = 'en'; ok(G.getShareText().includes('Prestige 12') && G.getShareText().includes('Diamond') && G.getShareText().includes('beat me'), 'texto en inglés');
  s.prestige.count = 0; s.settings.language = 'es'; ok(!G.getShareText().includes('Prestigio') && G.getShareText().includes('Diamante'), 'sin renaceres el texto no habla de prestigio');
  s.prestige.count = 3;
  const urlBefore = sc.url; sc.url = 'https://ejemplo.test'; ok(G.getShareText().endsWith('https://ejemplo.test'), 'con url, se añade al final'); sc.url = urlBefore;
  ok(!G.getShareText().includes('undefined') && !G.getShareText().includes('{'), 'el texto no deja marcadores sin rellenar');

  // Guardado
  const key = config.saveKey;
  s = fresh(); s.stats.lifetime = 123456; G.storage.save(); ok(G.storage.load().state.stats.lifetime === 123456, 'guardar y cargar conserva el total histórico');
  ok(G.storage.parseCode(G.storage.exportCode()).stats.lifetime === 123456, 'exportar → importar conserva el total histórico');
  store[key] = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'save-v3.json'), 'utf8');
  let L = G.storage.load().state; ok(L.stats.lifetime === L.totalEarned && L.stats.lifetime > 1e9, 'v3 real: el total histórico parte de lo ganado hasta ahora');
  store[key] = JSON.stringify({ version: 7, savedAt: 1, state: { totalEarned: 5000, currency: 10, stats: { bought: 3 } } });
  L = G.storage.load().state; ok(L.stats.lifetime === 5000 && L.stats.bought === 3, 'v7: sin total histórico se deduce de la vuelta');
  store[key] = JSON.stringify({ version: 8, savedAt: 1, state: { totalEarned: 5000, stats: { lifetime: -4 } } });
  L = G.storage.load().state; ok(L.stats.lifetime === 5000, 'un total histórico raro se sustituye');
  store[key] = JSON.stringify({ version: 8, savedAt: 1, state: { totalEarned: 5000, stats: { lifetime: 9e9 } } });
  ok(G.storage.load().state.stats.lifetime === 9e9, 'un total histórico válido se respeta');
}

// ── Ajustes de balance (Núcleos por tramo, margen del objetivo, habilidad de clic) ──
{
  const pc = config.prestige;
  const first = config.minerals.findIndex((m) => m.id === pc.firstMineral);
  const reach = (st, i) => { st.totalEarned = Math.max(st.totalEarned, G.minerals[i].unlockAt); st.currency = Math.min(st.currency, st.totalEarned); };
  const saved = { caps: pc.coreCaps, headroom: pc.targetHeadroom, per: pc.mineralsPerCore };

  // Cada tramo puede traer su propio "minerales por Núcleo"
  pc.coreCaps = [{ from: 1, max: 3 }, { from: 10, max: 5, mineralsPerCore: 1 }]; pc.mineralsPerCore = 2; pc.targetHeadroom = 0;
  let s = fresh(); reach(s, first + 2);
  ok(G.getPrestigeGain() === 2 && G.getCoreTier().max === 3, 'tramo sin mineralsPerCore usa el general (' + G.getPrestigeGain() + ')');
  s.prestige.count = 9; s.prestige.count = 9; // el próximo es el renacer nº 10
  const target10 = G.getPrestigeTarget(); reach(s, target10 + 2);
  ok(G.getCoreTier().mineralsPerCore === 1 && G.getPrestigeGain() === 3, 'el tramo del renacer 10 gana 1 Núcleo por mineral (' + G.getPrestigeGain() + ')');
  s.totalEarned = 1e300; ok(G.getPrestigeGain() === 5 && G.getCoreCap() === 5, 'y el tope sigue mandando');
  fresh(); G.state.prestige.count = 9; reach(G.state, G.getPrestigeTarget());
  ok(G.getNextCoreMineral() === G.getPrestigeTarget() + 1, 'siguiente Núcleo con el paso del tramo');
  fresh(); reach(G.state, G.getPrestigeTarget()); ok(G.getNextCoreMineral() === G.getPrestigeTarget() + 2, 'y con el general en el primero');
  pc.coreCaps = saved.caps; pc.mineralsPerCore = saved.per;

  // El mineral exigido deja margen por encima
  pc.targetHeadroom = 5; s = fresh(); s.prestige.count = 1e6;
  ok(G.getPrestigeTarget() === G.minerals.length - 1 - 5, 'el objetivo se detiene `targetHeadroom` minerales antes del último');
  reach(s, G.minerals.length - 1); ok(G.getPrestigeGain() > 1, 'con margen, llegar al final da más de 1 Núcleo (' + G.getPrestigeGain() + ')');
  pc.targetHeadroom = 0; ok(G.getPrestigeTarget() === G.minerals.length - 1, 'sin margen, el objetivo llega al último');
  pc.targetHeadroom = saved.headroom;

  // La habilidad de clic multiplica el clic entero, también la parte que sale de la producción
  s = fresh(); s.producers.novice = 20; s.upgrades.hands1 = true; s.upgrades.pick = true; s.prestige.cores = 50;
  const before = G.getClickValue(), pps = G.getPps();
  ok(before > config.click.base + 1 && before > pps * 0.01, 'el clic incluye parte de la producción');
  G.buySkill('strike');
  const strike = G.skillById.strike.levels[0].value;
  ok(near(G.getClickValue(), before * strike) && near(G.getPps(), pps), 'strike multiplica el clic entero y no la producción');
}

// ── Productores (50) y mejoras hasta 1000 unidades ───────────
{
  const ps = config.producers, tiers = config.producerUpgradeTiers;
  ok(ps.length === 50, 'hay 50 productores (' + ps.length + ')');
  ok(ps.every((p, i, a) => i < 2 || (p.baseCost / a[i - 1].baseCost > 5 && p.baseCost / a[i - 1].baseCost < 30 && p.baseProduction / a[i - 1].baseProduction > 2.5 && p.baseProduction / a[i - 1].baseProduction < 12)), 'saltos de coste (×5-30) y de producción (×2,5-12) razonables entre productores');
  ok(ps.every((p) => p.icon && G.lang.es['producer.' + p.id] && G.lang.en['producer.' + p.id]), 'cada productor con icono y nombre en los dos idiomas');
  ok(Number.isFinite(ps[ps.length - 1].baseCost * tiers[tiers.length - 1].costFactor) && ps[ps.length - 1].baseCost * tiers[tiers.length - 1].costFactor < 1e300, 'el coste más alto cabe en un Number');

  ok(tiers[tiers.length - 1].at === 1000 && tiers.every((t, i, a) => i === 0 || (t.at > a[i - 1].at && t.costFactor > a[i - 1].costFactor)), 'los escalones llegan a 1000 unidades y van creciendo');
  ok(tiers.length === new Set(tiers.map((t) => t.label)).size && tiers.every((t) => t.mult > 1), 'escalones con etiqueta única y multiplicador');
  ok(tiers.filter((t) => t.at >= 100).every((t) => Math.abs(t.costFactor / (0.04 * Math.pow(config.defaultCostGrowth, t.at)) - 1) < 0.15), 'desde 100 unidades la mejora cuesta ~4% de la siguiente unidad');

  const s = fresh();
  const novice = 'novice';
  s.producers[novice] = 999;
  ok(G.upgrades.filter((u) => u.effect.target === novice && G.isUpgradeUnlocked(u)).length === tiers.length - 1, 'con 999 unidades falta solo el último escalón');
  s.producers[novice] = 1000;
  const top = G.upgradeById[novice + '-1000'];
  ok(top && G.isUpgradeUnlocked(top) && top.cost === ps[0].baseCost * tiers[tiers.length - 1].costFactor, 'a las 1000 aparece la mejora XIII');
  ok(G.upgradeName(top) === 'Minero novato XIII', 'nombre con la etiqueta romana');
  // Todas las mejoras multiplican: el efecto acumulado de los 13 escalones
  const base = G.getProducerUnitOutput(novice);
  for (const u of G.upgrades) if (u.effect.target === novice) s.upgrades[u.id] = true;
  ok(near(G.getProducerUnitOutput(novice) / base, Math.pow(2, tiers.length)), 'los escalones se acumulan (×2 cada uno)');
  ok(G.upgrades.length === config.clickUpgrades.length + config.globalUpgrades.length + ps.length * tiers.length + ps.length - 1, 'nº total de mejoras');

  // Descubrimiento de los productores nuevos: de uno en uno, también pasados los 16 originales
  const t = fresh(); t.producers.wormhole = 1;
  ok(G.getProducerVisibility('robot') === 'open' && G.getProducerVisibility('shuttle') === 'teaser' && G.getProducerVisibility('harvester') === 'hidden', 'tras el último original se abre el 17º');
  t.producers.timeloop = 1; ok(G.getProducerVisibility('trident') === 'open' && G.getProducerVisibility('bigbang') === 'hidden', 'se siguen descubriendo en orden');

  // Compra de uno de los nuevos con coste enorme
  const u = fresh(); u.currency = 1e22; u.producers.robot = 0; u.producers.wormhole = 1;
  ok(G.buyProducer('robot', 1) && u.producers.robot === 1 && u.currency < 1e22, 'comprar un productor nuevo funciona');
}

// ── Comprar todas las mejoras ─────────────────────────────────
{
  const avail = () => G.upgrades.filter((u) => G.isUpgradeAvailable(u));
  let s = fresh();
  ok(G.getBuyAllPlan().available === 0 && G.getBuyAllPlan().count === 0 && G.buyAllUpgrades().count === 0, 'sin mejoras disponibles no hay nada que comprar');

  // Hay varias disponibles pero solo alcanza para algunas: se compran las más baratas
  s.totalEarned = 1e9; s.currency = 0;
  const list = avail();
  ok(list.length >= 5, 'preparado: varias mejoras disponibles (' + list.length + ')');
  s.currency = list[0].cost + list[1].cost + list[2].cost + 0.5 * list[3].cost;
  let plan = G.getBuyAllPlan();
  ok(plan.available === list.length && plan.count === 3 && near(plan.cost, list[0].cost + list[1].cost + list[2].cost), 'el plan paga las más baratas mientras alcance');
  const money = s.currency, boughtBefore = s.stats.bought;
  let r = G.buyAllUpgrades();
  ok(r.count === 3 && near(r.spent, plan.cost) && near(s.currency, money - r.spent) && s.currency >= 0, 'compra exactamente lo planeado y no deja negativo');
  ok(list.slice(0, 3).every((u) => s.upgrades[u.id]) && !s.upgrades[list[3].id] && s.stats.bought === boughtBefore + 3, 'compró las tres más baratas y las cuenta para los objetivos');
  ok(G.buyAllUpgrades().count === 0 && G.getBuyAllPlan().count === 0, 'repetirlo sin fondos no compra nada');

  // Con dinero de sobra se compran todas, y salen otras al dejar de estar bloqueadas
  s.currency = 1e30;
  r = G.buyAllUpgrades();
  ok(avail().length === 0 && r.count === list.length - 3, 'con dinero de sobra se compran todas las disponibles');
  ok(G.getBuyAllPlan().available === 0, 'después no queda ninguna disponible');
  s.producers.novice = 100; s.currency = 1e30;
  r = G.buyAllUpgrades(); ok(r.count >= 3 && G.upgradeById['novice-100'] && s.upgrades['novice-100'], 'al tener más unidades salen y se compran los escalones nuevos');

  // No compra mejoras todavía bloqueadas
  s = fresh(); s.currency = 1e30; s.totalEarned = 0; s.producers.novice = 9;
  r = G.buyAllUpgrades(); ok(!s.upgrades['novice-10'] && r.count === 0, 'no compra lo que aún no se ha desbloqueado');
  // El orden de la lista es de menor a mayor coste (lo que hace correcto el plan)
  ok(G.upgrades.every((u, i, a) => i === 0 || a[i - 1].cost <= u.cost), 'la lista de mejoras está ordenada por coste');
}

// ── Sinergias entre productores ──────────────────────────────
{
  const sy = config.synergy, ps = config.producers;
  const syns = G.upgrades.filter((u) => u.effect.type === 'synergy');
  ok(sy.perUnit > 0 && sy.needSource > 0 && sy.needTarget > 0 && sy.costFactor > 0, 'config de sinergias');
  ok(syns.length === ps.length - 1 && new Set(syns.map((u) => u.id)).size === syns.length, 'una sinergia por productor menos el primero');
  ok(syns.every((u, i) => true) && ps.slice(1).every((p, i) => { const u = G.upgradeById['syn-' + p.id]; return u && u.effect.source === p.id && u.effect.target === ps[i].id && u.effect.value === sy.perUnit && u.cost === p.baseCost * sy.costFactor; }), 'cada productor ayuda al anterior, con el coste del config');
  ok(Object.keys(G.synergyUpgrades).length === ps.length && G.synergyUpgrades.novice.length === 1 && G.synergyUpgrades.wormhole.length === 1 && G.synergyUpgrades.bigbang.length === 0, 'las sinergias se agrupan por el productor que mejoran');

  // Desbloqueo: hacen falta los dos
  let st = fresh();
  const syn = G.upgradeById['syn-barrow'];
  st.producers.barrow = sy.needSource; st.producers.novice = sy.needTarget - 1; ok(!G.isUpgradeUnlocked(syn), 'sin las unidades del que recibe no sale');
  st.producers.novice = sy.needTarget; st.producers.barrow = sy.needSource - 1; ok(!G.isUpgradeUnlocked(syn), 'sin las unidades del que ayuda no sale');
  st.producers.barrow = sy.needSource; ok(G.isUpgradeUnlocked(syn) && G.isUpgradeAvailable(syn), 'con las dos sale');

  // Efecto: cada unidad del que ayuda suma perUnit a la producción del que recibe
  st.currency = syn.cost; const base = G.getProducerUnitOutput('novice'), baseBarrow = G.getProducerUnitOutput('barrow'), basePps = G.getPps();
  ok(G.buyUpgrade('syn-barrow') && st.currency === 0, 'se compra como cualquier mejora');
  ok(near(G.getProducerUnitOutput('novice') / base, 1 + sy.perUnit * sy.needSource), 'la unidad del productor que recibe produce (1 + perUnit × unidades) veces más');
  ok(near(G.getProducerUnitOutput('barrow'), baseBarrow), 'el que ayuda no cambia');
  st.producers.barrow += 80; ok(near(G.getProducerUnitOutput('novice') / base, 1 + sy.perUnit * st.producers.barrow), 'y crece con las unidades que se tengan');
  ok(G.getPps() > basePps, 'la producción total sube');
  // Se combina con las demás mejoras por multiplicación
  st.upgrades['novice-10'] = true; ok(near(G.getProducerUnitOutput('novice') / base, 2 * (1 + sy.perUnit * st.producers.barrow)), 'se multiplica con los escalones del productor');
  const globalUp = G.upgradesByType.globalMult[0]; st.upgrades[globalUp.id] = true; ok(near(G.getProducerUnitOutput('novice') / base, 2 * globalUp.effect.value * (1 + sy.perUnit * st.producers.barrow)), 'y con las globales');
  st = fresh(); st.producers.barrow = 100; ok(G.getSynergyMultiplier('novice') === 1, 'sin comprar la sinergia no hay efecto');
  ok(G.getSynergyMultiplier('bigbang') === 1, 'un productor sin sinergias vale ×1');

  // Texto
  st.settings.language = 'es';
  ok(G.upgradeName(syn) === 'Sinergia: Carretilla → Minero novato', 'nombre en español: ' + G.upgradeName(syn));
  st.settings.language = 'en';
  ok(G.upgradeName(syn) === 'Synergy: Wheelbarrow → Novice Miner', 'nombre en inglés: ' + G.upgradeName(syn));
  ok(G.tr('upgrade.synergy', { source: 'A', n: 2, target: 'B' }).includes('2%') && !G.tr('upgrade.synergy', { source: 'A', n: 2, target: 'B' }).includes('{'), 'descripción sin marcadores');
  st.settings.language = 'es';

  // Guardado
  st = fresh(); st.upgrades['syn-barrow'] = true; st.upgrades['syn-fantasma'] = true; G.storage.save();
  const back = G.storage.load().state; ok(back.upgrades['syn-barrow'] === true && !back.upgrades['syn-fantasma'], 'la sinergia comprada se guarda y las inventadas se descartan');
}

// ── Catálogo de maquinaria ────────────────────────────────────
{
  const cc = config.catalog, es = G.eras, ps = config.producers;
  const bonus = cc.eraBonus;
  const own = (st, upTo) => { for (let i = 0; i <= upTo; i++) st.producers[ps[i].id] = Math.max(st.producers[ps[i].id], 1); };
  ok(bonus > 0 && bonus <= 0.1, 'bonus por era pequeño y positivo');
  ok(es.length === cc.eras.length && new Set(es.map((e) => e.id)).size === es.length && es.every((e) => e.icon && e.first >= 0), 'eras con id único, icono y productor de arranque válido');
  ok(es[0].first === 0 && es[es.length - 1].last === ps.length - 1 && es.every((e, i, a) => i === 0 || (a[i - 1].last + 1 === e.first && e.last >= e.first)), 'las eras cubren los 50 productores sin huecos ni solapes');
  ok(es.every((e) => G.lang.es['era.' + e.id] && G.lang.en['era.' + e.id]), 'eras con nombre en los dos idiomas');
  ok(ps.every((p) => G.lang.es['machine.' + p.id] && G.lang.en['machine.' + p.id] && G.lang.es['machine.' + p.id].length < 170 && G.lang.en['machine.' + p.id].length < 170), 'cada productor con un dato curioso breve en los dos idiomas');

  let st = fresh();
  ok(st.catalog.best === -1 && st.catalog.seen === 0 && G.getCatalogCount() === 0 && !G.isMachineFound(0), 'al empezar no hay nada descubierto');
  ok(G.getCatalogMultiplier() === 1 && G.checkCatalog().length === 0 && G.getCatalogUnseen() === 0, 'sin novedades ni bonus');
  st.producers.novice = 5; G.checkCatalog();
  ok(st.catalog.best === 0 && G.isMachineFound(0) && !G.isMachineFound(1) && G.getCatalogUnseen() === 1, 'tener uno lo descubre y queda sin ver');
  st.producers.barrow = 1; st.producers.cart = 1; G.checkCatalog(); ok(G.getCatalogCount() === 3 && G.getCatalogUnseen() === 3, 'se descubren de uno en uno');
  G.markCatalogSeen(); ok(G.getCatalogUnseen() === 0, 'abrir la pestaña los marca como vistos');
  st.producers.novice = 0; G.checkCatalog(); ok(G.getCatalogCount() === 3, 'perder productores (renacer) no quita lo descubierto');

  const first = es[0];
  ok(!G.isEraComplete(first) && G.getCompletedEras().length === 0, 'a medias la era no está completa');
  own(st, first.last - 1); G.checkCatalog();
  own(st, first.last); const done = G.checkCatalog();
  ok(done.length === 1 && done[0] === first && G.isEraComplete(first) && near(G.getCatalogMultiplier(), 1 + bonus), 'completar una era la avisa una vez y da el bonus');
  ok(G.checkCatalog().length === 0, 'no se avisa dos veces');
  own(st, ps.length - 1); const rest = G.checkCatalog();
  ok(rest.length === es.length - 1 && near(G.getCatalogMultiplier(), 1 + bonus * es.length) && G.getCatalogCount() === ps.length, 'tener el último completa todas las eras de golpe');
  st.producers.novice = 10; const withBonus = G.getPps(); st.catalog.best = -1;
  ok(near(withBonus / G.getPps(), 1 + bonus * es.length), 'el bonus entra en la producción');

  // Renacer lo conserva
  st = fresh(); own(st, 7); G.checkCatalog(); G.markCatalogSeen(); const kept = st.catalog;
  st.totalEarned = G.minerals[config.minerals.findIndex((m) => m.id === config.prestige.firstMineral)].unlockAt; G.checkDex();
  G.prestigeNow(); ok(G.state.catalog === kept && G.state.catalog.best === 7 && G.getCatalogUnseen() === 0, 'renacer conserva el catálogo');
  G.checkCatalog(); ok(G.state.catalog.best === 7, 'y empezar de cero no lo reduce');

  // Guardado y partidas antiguas
  const key = config.saveKey;
  st = fresh(); st.catalog = { best: 12, seen: 9 }; G.storage.save();
  ok(JSON.stringify(G.storage.load().state) === JSON.stringify(st), 'guardar y cargar conserva el catálogo');
  ok(JSON.stringify(G.storage.parseCode(G.storage.exportCode())) === JSON.stringify(st), 'exportar → importar conserva el catálogo');
  store[key] = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'save-v3.json'), 'utf8');
  let L = G.storage.load().state;
  ok(L.catalog.best === 1 && L.catalog.seen === 2, 'v3 real: lo descubierto sale de los productores que tiene (novice y barrow → best ' + L.catalog.best + ')');
  store[key] = JSON.stringify({ version: 8, savedAt: 1, state: { producers: { novice: 3, barrow: 2, cart: 1, mine: 4 } } });
  L = G.storage.load().state; ok(L.catalog.best === 4 && L.catalog.seen === 5, 'sin catálogo guardado: se deduce del productor más lejano');
  store[key] = JSON.stringify({ version: 8, savedAt: 1, state: {} });
  L = G.storage.load().state; ok(L.catalog.best === -1 && L.catalog.seen === 0, 'una partida sin productores no tiene nada descubierto');
  store[key] = JSON.stringify({ version: 9, savedAt: 1, state: { catalog: { best: 99, seen: 500 } } });
  L = G.storage.load().state; ok(L.catalog.best === ps.length - 1 && L.catalog.seen === L.catalog.best + 1, 'catálogo fuera de rango se recorta');
  store[key] = JSON.stringify({ version: 9, savedAt: 1, state: { catalog: { best: -9, seen: 'x' } } });
  L = G.storage.load().state; ok(L.catalog.best === -1 && L.catalog.seen === 0, 'catálogo raro vuelve a los valores iniciales');
}

// ── Retos especiales ──────────────────────────────────────────
{
  const cs = G.challenges, cfgc = config.challenges;
  const unlock = (st) => { st.prestige.unlocked = true; };
  const get = (id) => G.challengeById[id];
  const TYPES = ['globalMult', 'clickMult', 'costMult', 'goldenRate', 'offlineRate'];

  // Catálogo
  ok(cs.length === cfgc.length && new Set(cs.map((c) => c.id)).size === cs.length, 'retos con id único');
  ok(cs.every((c) => c.icon && (c.earned > 0 || c.goalIndex > 0) && c.limit >= 0 && c.rules && TYPES.includes(c.reward.type) && c.reward.value > 0), 'retos con objetivo, reglas y recompensa válidos');
  ok(cs.every((c) => Object.keys(c.rules).every((k) => ['noProducers', 'noUpgrades', 'maxProducers', 'costGrowth'].includes(k))), 'solo reglas conocidas');
  ok(cs.every((c) => G.lang.es['challenge.' + c.id] && G.lang.en['challenge.' + c.id]), 'retos con nombre en los dos idiomas');
  ok(cs.every((c) => ['offlineRate'].includes(c.reward.type) || c.reward.type === 'costMult' || c.reward.type === 'goldenRate' ? c.reward.value < 1 || c.reward.type === 'offlineRate' : c.reward.value > 1), 'las recompensas mejoran (×>1, o ×<1 en coste y dorado)');

  // Empezar
  let s = fresh();
  ok(!G.isChallengesUnlocked() && !G.startChallenge('clicks'), 'bloqueados antes del primer renacer posible');
  unlock(s);
  ok(G.isChallengesUnlocked() && !G.startChallenge('no-existe') && !G.isClean() && G.getActiveChallenge() === null, 'sin reto: nada limpio');
  s.currency = 5000; s.totalEarned = 9e9; s.producers.novice = 12; s.producers.barrow = 3; s.upgrades.pick = true; s.prestige.skills.power = 2; s.prestige.runTime = 77;
  const before = JSON.stringify({ c: s.currency, t: s.totalEarned, p: s.producers, u: s.upgrades });
  ok(G.startChallenge('bare'), 'empieza un reto');
  ok(s.challenges.active.id === 'bare' && s.currency === 0 && s.totalEarned === 0 && Object.values(s.producers).every((n) => n === 0) && Object.keys(s.upgrades).length === 0, 'la vuelta del reto empieza de cero');
  ok(G.isClean() && G.getActiveChallenge() === get('bare') && !G.startChallenge('few'), 'no se puede empezar otro con uno en curso');
  ok(s.challenges.active.snapshot.currency === 5000 && s.challenges.active.snapshot.producers.novice === 12, 'la vuelta de verdad queda guardada aparte');

  // Ámbito limpio: no cuentan los bonus permanentes
  ok(G.getSkillValue('globalMult', 1) === 1 && G.getPrestigeMultiplier() === 1, 'las habilidades no cuentan');
  s.dex.best = 31; s.catalog.best = 49; s.achievements['clicks-1'] = true;
  for (let i = 0; i < 40; i++) s.achievements['fake' + i] = true;
  ok(G.getDexMultiplier() === 1 && G.getCatalogMultiplier() === 1 && G.getAchievementMultiplier() === 1, 'los álbumes y los logros no cuentan');
  s.prestige.count = 30; ok(!G.hasFeature('autoMiner') && G.getAutoMinerIncome() === 0, 'el Autominero no funciona');
  s.milestones.crit = true; ok(G.mine(() => 0).crit === false, 'sin críticos');
  s.milestones.golden = true; G.resetEvents(); G.tickEvents(5); G.live.goldenTimer = 0; G.tickEvents(1); ok(G.live.golden === null, 'sin mineral dorado');
  s.totalEarned = G.minerals[config.minerals.findIndex((m) => m.id === config.prestige.firstMineral)].unlockAt; ok(!G.canPrestige(), 'no se puede renacer');
  s.totalEarned = 0; const rt = s.prestige.runTime; G.tick(10); ok(s.prestige.runTime === rt && s.prestige.readyTime === -1, 'la vuelta guardada no avanza durante el reto');
  s.totalEarned = 0; s.currency = 0; s.prestige.count = 0; for (let i = 0; i < 40; i++) delete s.achievements['fake' + i];

  // Reglas
  s.currency = 1e30; s.totalEarned = 1e30;
  ok(G.getBuyAllPlan().available === 0 && G.buyAllUpgrades().count === 0 && !G.buyUpgrade('pick'), 'sin mejoras: ninguna disponible ni comprable');
  G.abandonChallenge();
  s.challenges.done = {};
  G.startChallenge('clicks'); s.currency = 1e30;
  ok(G.getProducerVisibility('novice') === 'hidden' && !G.buyProducer('novice', 1) && s.producers.novice === 0, 'sin productores: no se compra ninguno');
  ok(G.buyUpgrade('pick') || G.upgradeById.pick, 'pero las mejoras sí');
  G.abandonChallenge(); G.startChallenge('few'); s.currency = 1e30;
  const max = get('few').rules.maxProducers;
  s.producers.novice = 1; s.producers.barrow = 1; s.producers.cart = 1;
  ok(config.producers.slice(0, max).every((p) => G.getProducerVisibility(p.id) === 'open' || G.getProducerVisibility(p.id) === 'hidden') && config.producers.slice(max).every((p) => G.getProducerVisibility(p.id) === 'hidden'), 'solo los primeros productores se ven');
  s.producers.cart = 0; s.producers.barrow = 0; G.abandonChallenge();
  G.startChallenge('inflation'); s.currency = 1e30;
  const g = get('inflation').rules.costGrowth;
  ok(near(G.getProducerCost('novice', 1, 5), Math.ceil(config.producers[0].baseCost * Math.pow(g, 5))), 'costGrowth cambia lo que cuesta cada unidad');
  ok(G.getProducerCost('novice', 1, 5) > Math.ceil(config.producers[0].baseCost * Math.pow(config.defaultCostGrowth, 5)), 'y es más caro que normalmente');
  G.abandonChallenge();
  ok(near(G.getProducerCost('novice', 1, 5), Math.ceil(config.producers[0].baseCost * Math.pow(config.defaultCostGrowth, 5))), 'al salir, el coste vuelve a lo normal');

  // Objetivos: por mineral y por cantidad
  G.takeChallengeEvents(); // (vacía los avisos de las pruebas anteriores)
  s = fresh(); unlock(s); s.currency = 7; s.totalEarned = 70; s.producers.novice = 4; s.upgrades.pick = true; G.resetEvents();
  const snap = JSON.stringify({ c: s.currency, t: s.totalEarned, p: s.producers, u: s.upgrades });
  G.startChallenge('clicks'); const clicksChallenge = get('clicks');
  ok(!G.isChallengeGoalReached() && G.getChallengeProgress().remaining === null, 'objetivo de cantidad: aún no');
  s.totalEarned = clicksChallenge.earned - 1; G.tick(1); ok(G.getActiveChallenge() !== null && s.challenges.active.elapsed === 1, 'el tiempo del reto avanza con cada tick');
  s.totalEarned = clicksChallenge.earned; G.tick(2.5);
  ok(G.getActiveChallenge() === null && !G.isClean(), 'al cumplir el objetivo el reto termina');
  ok(JSON.stringify({ c: s.currency, t: s.totalEarned, p: s.producers, u: s.upgrades }) === snap, 'y vuelve exactamente la vuelta guardada');
  ok(near(s.challenges.done.clicks, 3.5) && G.isChallengeDone('clicks') && G.getChallengeBest('clicks') === s.challenges.done.clicks, 'queda registrado el tiempo');
  let evs = G.takeChallengeEvents(); ok(evs.length === 1 && evs[0].type === 'won' && evs[0].id === 'clicks' && evs[0].first === true && G.takeChallengeEvents().length === 0, 'un aviso de victoria, una sola vez');
  // Repetir: solo se guarda el mejor tiempo
  G.startChallenge('clicks'); s.totalEarned = clicksChallenge.earned; G.tick(9); evs = G.takeChallengeEvents();
  ok(near(s.challenges.done.clicks, 3.5) && evs[0].first === false && evs[0].seconds === 9, 'un tiempo peor no pisa el mejor');
  G.startChallenge('clicks'); s.totalEarned = clicksChallenge.earned; G.tick(1.5); G.takeChallengeEvents();
  ok(near(s.challenges.done.clicks, 1.5), 'uno mejor sí');
  s = G.state; G.startChallenge('bare'); const bare = get('bare');
  s.totalEarned = G.minerals[bare.goalIndex].unlockAt - 1; G.tick(1); ok(G.getActiveChallenge() !== null, 'un mineral antes no basta');
  s.totalEarned = G.minerals[bare.goalIndex].unlockAt; G.tick(1); ok(G.getActiveChallenge() === null && G.isChallengeDone('bare'), 'llegar al mineral objetivo completa el reto');
  G.takeChallengeEvents();

  // Límite de tiempo y abandono
  G.startChallenge('rush'); const rush = get('rush');
  G.tick(rush.limit - 1); ok(G.getActiveChallenge() !== null && near(G.getChallengeProgress().remaining, 1), 'con límite: se ve cuánto queda');
  G.tick(2); ok(G.getActiveChallenge() === null && !G.isChallengeDone('rush'), 'al agotar el tiempo se pierde (sin premio)');
  evs = G.takeChallengeEvents(); ok(evs.length === 1 && evs[0].type === 'failed', 'aviso de tiempo agotado');
  G.startChallenge('few'); const ab = G.abandonChallenge(); ok(ab.type === 'abandoned' && !G.isChallengeDone('few') && G.getActiveChallenge() === null && G.abandonChallenge() === null, 'abandonar devuelve la vuelta sin premio');
  G.takeChallengeEvents();

  // Recompensas (fuera del reto)
  s = fresh(); unlock(s); s.producers.novice = 10; const base = G.getPps(), baseClick = G.getClickValue(), baseCost = G.getProducerCost('novice', 1, 3);
  const rate0 = G.getOfflineRate();
  s.challenges.done = { clicks: 5, bare: 5, few: 5, inflation: 5, purist: 5, rush: 5 };
  const gm = cs.filter((c) => c.reward.type === 'globalMult').reduce((a, c) => a * c.reward.value, 1);
  ok(near(G.getChallengeValue('globalMult', 1), gm) && near(G.getPps() / base, gm), 'las recompensas globales se multiplican y suben la producción');
  ok(near(G.getClickValue() / baseClick, gm * get('clicks').reward.value), 'la de clic multiplica el valor por clic');
  ok(near(G.getProducerCost('novice', 1, 3) / baseCost, get('few').reward.value, 0.01) || Math.abs(G.getProducerCost('novice', 1, 3) - baseCost * get('few').reward.value) <= 1, 'la de coste abarata los productores');
  s.milestones.golden = true; G.resetEvents(); let mx = 0; for (let i = 0; i < 100; i++) { G.live.golden = { id: 1, left: 5 }; G.collectGolden(() => 0.999); mx = Math.max(mx, G.live.goldenTimer); }
  ok(mx <= config.events.golden.maxInterval * get('rush').reward.value + 1e-9, 'la del dorado acorta el tiempo entre minerales dorados');
  ok(G.getChallengeValue('offlineRate', 0) === 0 && near(G.getOfflineRate(), rate0), 'sin recompensa offline, el offline no cambia');
  G.startChallenge('few'); ok(G.getChallengeValue('globalMult', 1) === 1 && G.getChallengeValue('costMult', 1) === 1 && G.getMultiplierParts().challenge === 1, 'dentro de un reto las recompensas no cuentan'); G.abandonChallenge(); G.takeChallengeEvents();
  ok(near(G.getMultiplierParts().challenge, gm), 'el informe incluye las recompensas de retos');

  // Renacer los conserva
  s = fresh(); unlock(s); s.challenges.done = { clicks: 12 }; const keep = s.challenges;
  s.totalEarned = G.minerals[config.minerals.findIndex((m) => m.id === config.prestige.firstMineral)].unlockAt; G.checkDex();
  G.prestigeNow(); ok(G.state.challenges === keep && G.state.challenges.done.clicks === 12, 'renacer conserva los retos');

  // Guardado, incluido cerrar el juego en mitad de un reto
  const key = config.saveKey;
  s = fresh(); unlock(s); s.currency = 123; s.totalEarned = 456; s.producers.novice = 9; s.upgrades.pick = true; s.challenges.done = { bare: 321 };
  G.startChallenge('rush'); G.tick(30); G.storage.save();
  const L = G.storage.load().state;
  ok(JSON.stringify(L) === JSON.stringify(G.state), 'guardar y cargar en mitad de un reto da lo mismo');
  G.state = L; ok(G.isClean() && G.getActiveChallenge().id === 'rush' && L.challenges.active.elapsed === 30, 'el reto en curso se recupera (con su tiempo)');
  G.abandonChallenge(); ok(L.currency === 123 && L.producers.novice === 9 && L.upgrades.pick === true, 'y al salir está la vuelta guardada');
  ok(JSON.stringify(G.storage.parseCode((() => { G.state = fresh(); G.startChallenge('clicks'); return G.storage.exportCode(); })())) === JSON.stringify(G.state), 'exportar → importar conserva un reto en curso');
  G.state = fresh();
  store[key] = JSON.stringify({ version: 10, savedAt: 1, state: { challenges: { done: { bare: 40, fantasma: 5, few: -3, clicks: 'x' }, active: { id: 'no-existe', elapsed: 1, snapshot: { currency: 1, totalEarned: 1 } } } } });
  let M = G.storage.load().state; ok(M.challenges.done.bare === 40 && Object.keys(M.challenges.done).length === 1 && M.challenges.active === null, 'retos raros: solo valen los tiempos válidos y el reto en curso desconocido se descarta');
  store[key] = JSON.stringify({ version: 10, savedAt: 1, state: { challenges: { active: { id: 'clicks', elapsed: 5, snapshot: { currency: 'x' } } } } });
  M = G.storage.load().state; ok(M.challenges.active === null, 'un reto en curso con la vuelta guardada rota se descarta');
  store[key] = JSON.stringify({ version: 10, savedAt: 1, state: { challenges: { active: { id: 'clicks', elapsed: 5, snapshot: { currency: 10, totalEarned: 3, producers: { novice: 4.9, fantasma: 2 }, upgrades: { pick: true, fantasma: true } } } } } });
  M = G.storage.load().state; ok(M.challenges.active && M.challenges.active.snapshot.producers.novice === 4 && M.challenges.active.snapshot.totalEarned === 10 && M.challenges.active.snapshot.upgrades.pick && !M.challenges.active.snapshot.upgrades.fantasma, 'la vuelta guardada se sanea (productores enteros, mejoras reales, total ≥ moneda)');
  store[key] = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'save-v3.json'), 'utf8');
  M = G.storage.load().state; ok(M.challenges.active === null && Object.keys(M.challenges.done).length === 0, 'v3 real: sin retos');
  G.state = fresh();
}

// ── Resumen al renacer ────────────────────────────────────────
{
  const pc = config.prestige;
  const first = config.minerals.findIndex((m) => m.id === pc.firstMineral);
  const reach = (st, i) => { st.totalEarned = Math.max(st.totalEarned, G.minerals[i].unlockAt); st.currency = Math.min(st.currency, st.totalEarned); };

  // Primer renacer: nada con que comparar
  let s = fresh(); s.producers.novice = 20; s.milestones.crit = true; s.milestones.golden = true;
  s.currency = 1e12; s.totalEarned = 1e12; G.buyProducer('barrow', 1); G.buyUpgrade('pick'); // dos compras
  for (let i = 0; i < 7; i++) G.mine(() => 0.999);
  G.mine(() => 0); G.resetEvents(); G.live.golden = { id: 1, left: 5 }; G.collectGolden();
  s.prestige.runTime = 4000; s.prestige.readyTime = 3500; reach(s, first + 2);
  const pps = G.getPps() / G.getBoostMultiplier(); // (el resumen no cuenta el frenesí)
  let r = G.prestigeNow();
  ok(r && r.previous === null && r.summary.count === 1 && r.summary.gain === r.gain && r.summary.mineral === first + 2, 'el primer renacer trae resumen y no tiene vuelta anterior');
  ok(r.summary.time === 4000 && r.summary.ready === 3500 && near(r.summary.pps, pps) && r.summary.earned >= G.minerals[first + 2].unlockAt, 'tiempos, producción y minerales de la vuelta');
  ok(r.summary.clicks === 8 && r.summary.bought === 2 && r.summary.crits === 1 && r.summary.goldens === 1, 'clics, compras, críticos y dorados de esa vuelta (' + JSON.stringify([r.summary.clicks, r.summary.bought, r.summary.crits, r.summary.goldens]) + ')');
  ok(G.state.prestige.last === r.summary && G.state.prestige.runStart.clicks === 8 && G.state.prestige.runStart.bought === 2, 'el resumen queda guardado y los contadores de la vuelta nueva parten de ahí');
  ok(G.getRunComparison(r.summary, r.previous).first === true, 'sin vuelta anterior: es la primera');

  // Segunda vuelta: solo cuenta lo hecho después, y se compara con la primera
  s = G.state; s.currency = 1e12; for (let i = 0; i < 5; i++) G.mine(() => 0.999); G.buyProducer('novice', 3);
  s.prestige.runTime = 1500; s.prestige.readyTime = 1400; reach(s, first + 2); G.state.prestige.count = 1;
  const firstSummary = G.state.prestige.last;
  r = G.prestigeNow();
  ok(r && r.previous === firstSummary && r.summary.count === 2, 'la segunda vuelta recibe la primera como anterior');
  ok(r.summary.clicks === 5 && r.summary.bought === 3 && r.summary.crits === 0 && r.summary.goldens === 0, 'y sus contadores no arrastran los de la anterior');
  let cmp = G.getRunComparison(r.summary, r.previous);
  ok(!cmp.first && cmp.sameMineral && cmp.deeper === 0 && near(cmp.faster, 1 - 1400 / 3500), 'mismo objetivo: ' + Math.round(cmp.faster * 100) + '% más rápida');
  ok(near(cmp.changes.time, 1500 / 4000 - 1) && near(cmp.changes.ready, 1400 / 3500 - 1) && near(cmp.changes.clicks, 5 / 8 - 1) && cmp.changes.crits === -1 && cmp.changes.goldens === -1, 'cambio relativo de cada cifra');

  // Comparaciones sueltas
  const base = { count: 3, gain: 2, mineral: 9, time: 100, ready: 80, earned: 1e10, pps: 50, clicks: 0, bought: 5, crits: 0, goldens: 0 };
  cmp = G.getRunComparison({ ...base, mineral: 11, ready: 40 }, base);
  ok(!cmp.sameMineral && cmp.deeper === 2 && cmp.faster === null, 'con otro objetivo no se habla de "más rápida" sino de cuánto más lejos');
  cmp = G.getRunComparison({ ...base, mineral: 8 }, base); ok(cmp.deeper === -1 && cmp.faster === null, 'una vuelta menos profunda sale en negativo');
  cmp = G.getRunComparison({ ...base, ready: 120 }, base); ok(cmp.sameMineral && cmp.faster === null && cmp.changes.ready > 0, 'más lenta: no hay "más rápida"');
  cmp = G.getRunComparison({ ...base, ready: -1 }, base); ok(cmp.changes.ready === null, 'sin tiempo de "poder renacer" no se compara');
  cmp = G.getRunComparison(base, { ...base, clicks: 0, crits: 0 }); ok(cmp.changes.clicks === null && cmp.changes.crits === null, 'con 0 antes no se calcula un porcentaje');

  // Guardado y partidas antiguas
  const key = config.saveKey;
  s = fresh(); s.totalClicks = 50; s.stats.bought = 9; s.prestige.runStart = { clicks: 20, bought: 4, crits: 0, goldens: 0 }; s.prestige.last = { ...base };
  G.storage.save(); const L = G.storage.load().state;
  ok(JSON.stringify(L) === JSON.stringify(s), 'guardar y cargar conserva el resumen y los contadores de la vuelta');
  ok(JSON.stringify(G.storage.parseCode(G.storage.exportCode())) === JSON.stringify(s), 'exportar → importar lo conserva');
  store[key] = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'save-v3.json'), 'utf8');
  let M = G.storage.load().state;
  ok(M.prestige.runStart.clicks === M.totalClicks && M.prestige.runStart.bought === M.stats.bought && M.prestige.last === null, 'v3 real: la vuelta en curso cuenta desde ahora y no hay vuelta anterior');
  store[key] = JSON.stringify({ version: 11, savedAt: 1, state: { totalClicks: 10, stats: { bought: 3 }, prestige: { runStart: { clicks: 99, bought: -2, crits: 'x', goldens: 5 }, last: { count: 'a' } } } });
  M = G.storage.load().state;
  ok(M.prestige.runStart.clicks === 10 && M.prestige.runStart.bought === 3 && M.prestige.runStart.crits === 0 && M.prestige.runStart.goldens === 0 && M.prestige.last === null, 'contadores raros: nunca por encima de lo real, y un resumen roto se descarta');
  store[key] = JSON.stringify({ version: 11, savedAt: 1, state: { prestige: { last: { ...base, ready: -1 } } } });
  M = G.storage.load().state; ok(M.prestige.last && M.prestige.last.ready === -1 && M.prestige.last.mineral === 9, 'un resumen válido se conserva');
  G.resetEvents(); G.state = fresh();
}

// ── Ampliar el final: tramo nuevo, habilidades nuevas y árbol más largo ──
{
  const pc = config.prestige, cm = config.minerals;
  const gatedFrom = cm.findIndex((m) => m.unlockPrestiges);
  const gateAt = cm[gatedFrom].unlockPrestiges;
  const skill = (id) => G.skillById[id];

  // El tramo final
  ok(gatedFrom === 32 && cm.length === 40 && cm.slice(gatedFrom).every((m) => m.unlockPrestiges === gateAt && m.rarity === 'transcendent'), '8 minerales nuevos tras Unobtanio, todos trascendentes y con el mismo requisito (' + gateAt + ' renaceres)');
  ok(config.rarities[config.rarities.length - 1] === 'transcendent' && G.lang.es['rarity.transcendent'] && G.lang.en['rarity.transcendent'], 'rareza trascendente con nombre');
  ok(G.biomes[G.biomes.length - 1].id === 'beyond' && G.biomes[G.biomes.length - 1].first === gatedFrom && G.getBiomeIndexOf(cm.length - 1) === G.biomes.length - 1, 'el bioma "Más allá" agrupa los minerales nuevos');
  ok(G.minerals.slice(gatedFrom).every((m, i, a) => m.unlockAt > G.minerals[gatedFrom - 1 + i].unlockAt && m.value > G.minerals[gatedFrom - 1 + i].value), 'los minerales nuevos siguen creciendo en umbral y valor');
  ok(G.minerals.slice(gatedFrom, G.realMineralCount).every((m) => G.lang.es['mineral.' + m.id] && G.lang.en['mineral.' + m.id] && G.lang.es['fact.' + m.id] && G.lang.en['fact.' + m.id]), 'con nombre y dato curioso en los dos idiomas');

  // Objetivo de renacer con el tramo abierto o cerrado
  const saveHead = pc.targetHeadroom;
  pc.targetHeadroom = 3;
  let s = fresh(); s.prestige.count = 1000;
  ok(G.getPrestigeTarget() === G.minerals.length - 1 - 3, 'con el tramo abierto el objetivo llega hasta el último menos el margen (' + G.getPrestigeTarget() + ')');
  const capClosed = gatedFrom - 1 - 3;
  s = fresh(); s.prestige.count = gateAt - 1; ok(G.getPrestigeTarget() <= capClosed, 'con el tramo cerrado el objetivo no pasa de su último mineral (' + G.getPrestigeTarget() + ')');
  pc.targetHeadroom = saveHead;
  s = fresh(); s.prestige.count = gateAt - 1; s.totalEarned = 1e300; const gainClosed = G.getPrestigeGain();
  s.prestige.count = gateAt; s.totalEarned = 1e300; ok(G.getMineralIndex() === G.minerals.length - 1 && G.getPrestigeGain() >= gainClosed, 'al abrirse el tramo hay más minerales y más Núcleos posibles');


  // La escalera sin fin tras el último mineral
  const nReal = G.realMineralCount, en = config.endless, extra = G.minerals.slice(nReal);
  ok(extra.length === en.count && extra.every((m) => m.virtual && m.baseId === cm[nReal - 1].id && m.unlockPrestiges === gateAt), 'hay ' + en.count + ' rangos sin fin, cerrados con los mismos renaceres que el tramo final');
  ok(extra.every((m, i) => near(m.unlockAt / G.minerals[nReal - 1 + i].unlockAt, en.growth) && m.value > G.minerals[nReal - 1 + i].value), 'cada rango pide ×' + en.growth + ' más y vale más que el anterior');
  ok(extra.every((m) => /^#[0-9a-f]{6}$/i.test(m.accent)) && new Set(extra.slice(0, 8).map((m) => m.accent)).size === 8, 'cada rango gira el color');
  let ss = fresh(); ss.settings.language = 'es';
  ok(G.mineralName(extra[0]) === 'Omega 2' && G.mineralName(extra[4]) === 'Omega 6' && G.mineralName(cm[nReal - 1] && G.minerals[nReal - 1]) === 'Omega', 'nombres "Omega 2", "Omega 3"…');
  ok(G.getBiomeIndexOf(G.minerals.length - 1) === G.biomes.length - 1 && G.getBiomeIndexOf(nReal) === G.biomes.length - 1, 'los rangos sin fin están en el último bioma');
  // La búsqueda por mitades da lo mismo que recorrer la lista
  const linear = (earned, count) => { let idx = 0; for (let i = 1; i < G.minerals.length; i++) { const need = G.minerals[i].unlockPrestiges; if (earned < G.minerals[i].unlockAt || (need && count < need)) break; idx = i; } return idx; };
  let same = true;
  for (const count of [0, gateAt - 1, gateAt, 500]) {
    ss.prestige.count = count;
    for (let k = 0; k < 400; k++) { const earned = k === 0 ? 0 : Math.pow(10, Math.random() * 130); ss.totalEarned = earned; if (G.getMineralIndex() !== linear(earned, count)) same = false; }
    for (const m of G.minerals) { ss.totalEarned = m.unlockAt; if (G.getMineralIndex() !== linear(m.unlockAt, count)) same = false; ss.totalEarned = m.unlockAt * (1 - 1e-12); if (G.getMineralIndex() !== linear(ss.totalEarned, count)) same = false; }
  }
  ok(same, 'el mineral actual por búsqueda de mitades coincide con recorrer la lista (con y sin renaceres)');
  ss.prestige.count = 1000; ss.totalEarned = 1e300; ok(G.getMineralIndex() === G.minerals.length - 1 && G.getMineralProgress().next === null, 'con todo abierto se llega al último rango');
  ss.dex.best = 0; ss.dex.seen = 1; ss.prestige.count = 1000; ss.totalEarned = 1e300; G.checkDex(); ok(ss.dex.best === G.minerals.length - 1 && G.getDexCount() === nReal && G.getDexUnseen() === nReal - 1, 'la Mineralpedia guarda el rango pero solo cuenta los minerales de verdad');
  G.markDexSeen(); ok(G.getDexUnseen() === 0 && ss.dex.seen === nReal, 'y las entradas vistas tampoco cuentan rangos');
  ss.prestige.count = 100; ok(Number.isFinite(G.minerals[G.minerals.length - 1].unlockAt) && G.minerals[G.minerals.length - 1].unlockAt < 1e300, 'los números del último rango caben en un Number');
  ss.prestige.count = 0; ss.totalEarned = 1e300; G.getMineralIndex(); ss.prestige.count = gateAt; ok(G.getLastAvailableMineral() === G.minerals.length - 1, 'la caché del último mineral disponible sigue a los renaceres');

  // Desbloqueos por renaceres
  ok(pc.unlocks.filter((u) => u.skill).map((u) => u.skill).join() === 'legacy,stellar,forge,fortune,eternal', 'las habilidades nuevas se abren en orden de renaceres');
  s = fresh(); s.prestige.cores = 999;
  for (const id of ['forge', 'fortune', 'eternal']) { const at = G.getSkillUnlockAt(id); s.prestige.count = at - 1; ok(!G.canBuySkill(id), id + ' bloqueada antes de ' + at); s.prestige.count = at; ok(G.buySkill(id), id + ' se abre en ' + at); }

  // Árbol más largo
  ok(skill('power').levels.length >= 8 && skill('strike').levels.length >= 7 && skill('discount').levels.length >= 6, 'más niveles en las habilidades principales');
  ok(pc.skills.every((k) => k.levels.every((l, i, a) => i === 0 || l.cost >= a[i - 1].cost)), 'los costes siguen creciendo dentro de cada habilidad');
  ok(skill('power').levels.every((l, i, a) => i === 0 || l.value > a[i - 1].value) && skill('discount').levels.every((l, i, a) => i === 0 || l.value < a[i - 1].value), 'y los efectos también mejoran');
  const eternal = skill('eternal');
  ok(eternal.levels.length === 30 && eternal.levels[0].cost === 5 && near(eternal.levels[0].value, 1.1) && near(eternal.levels[29].value, Math.pow(1.1, 30)) && eternal.levels[29].cost > eternal.levels[0].cost * 10, 'el Núcleo eterno tiene 30 niveles de ×1,1 cada vez más caros');
  const total = pc.skills.reduce((sum, k) => sum + k.levels.reduce((a, l) => a + l.cost, 0), 0);
  ok(total > 800, 'el árbol entero cuesta más de 800 Núcleos (' + total + ')');

  // Efecto de las habilidades nuevas
  s = fresh(); s.prestige.cores = 999; s.prestige.count = 100;
  s.producers.novice = 20; s.producers.barrow = 30; s.upgrades['syn-barrow'] = true;
  const outBase = G.getProducerUnitOutput('novice');
  ok(G.buySkill('forge'), 'se compra la Fragua');
  ok(near(G.getProducerUnitOutput('novice') / outBase, (1 + config.synergy.perUnit * skill('forge').levels[0].value * 30) / (1 + config.synergy.perUnit * 30)), 'la Fragua multiplica la fuerza de la sinergia, no la producción');
  ok(G.getSkillValue('critChance', 0) === 0, 'sin Suerte minera no suma probabilidad');
  s.milestones.crit = true; G.buySkill('fortune');
  const chance = config.crit.chance + skill('fortune').levels[0].value;
  ok(G.mine(() => chance - 1e-9).crit === true && G.mine(() => chance + 1e-9).crit === false, 'la Suerte minera sube la probabilidad de crítico');
  const gm = G.getPrestigeMultiplier(); G.buySkill('eternal');
  ok(near(G.getPrestigeMultiplier() / gm, eternal.levels[0].value), 'el Núcleo eterno multiplica la producción');
}

// ── Anuncios ──────────────────────────────────────────────────
{
  const ac = config.ads;
  const keep = ac.provider;
  const setProvider = (name) => { ac.provider = name; };
  let ready = true, outcome = true;
  G.ads.registerProvider('stub', { isReady: () => ready, showRewarded: async () => { if (outcome === 'throw') throw new Error('x'); return outcome; } });

  // Config y valores por defecto
  ok(['none', 'adsterra', 'adsense', 'test'].includes(ac.provider), 'proveedor de anuncios conocido');
  ok(ac.rewards.boost.mult > 1 && ac.rewards.boost.seconds > 0 && ac.rewards.boost.cooldown >= ac.rewards.boost.seconds, 'frenesí por anuncio coherente (el espacio entre anuncios no baja de su duración)');
  ok(ac.startDelaySeconds === 1 && !G.ads.startDelayPassed(999) && G.ads.startDelayPassed(1000) && G.ads.startDelayPassed(60000), 'los anuncios empiezan a 1 s de entrar en la web');
  ok(keep !== 'test', "nunca se publica con el proveedor de prueba (da recompensas gratis)");
  let s = fresh();
  setProvider('none');
  ok(!G.ads.isEnabled() && !G.ads.needsConsent() && !G.ads.canOffer('offline') && !G.ads.canOffer('boost'), "con provider 'none' no se pide consentimiento ni se ofrece nada");
  ok(s.settings.adsConsent === 'unset' && s.ads.boostAt === 0, 'el estado empieza sin elegir y sin frenesí por anuncio');

  // Banner de Adsterra: el documento del iframe se construye solo con datos válidos
  const ad0 = { ...ac.adsterra };
  ac.adsterra = { key: 'abc12345def', src: 'https://ejemplo.org/22/abc12345def', width: 320, height: 50 };
  const doc = G.ads.adsterraDoc();
  ok(doc && doc.includes('"key":"abc12345def"') && doc.includes('"format":"iframe"') && doc.includes('"height":50') && doc.includes('"width":320') && doc.includes('<script src="https://ejemplo.org/22/abc12345def"></script>'), 'el banner de Adsterra lleva su clave, formato, medidas y script');
  for (const bad of [{ src: 'http://ejemplo.org/22/abc12345def' }, { src: 'javascript:alert(1)' }, { src: 'https://ejemplo.org/x"><script>alert(1)</script>' }, { src: '' }, { key: '' }, { key: 'a"b' }, { key: 'corta' }, { width: 0 }, { height: '50' }, { width: 3.5 }]) {
    ac.adsterra = { key: 'abc12345def', src: 'https://ejemplo.org/22/abc12345def', width: 320, height: 50, ...bad };
    ok(G.ads.adsterraDoc() === null, 'datos no válidos para el banner de Adsterra → no se monta (' + JSON.stringify(bad) + ')');
  }
  ac.adsterra = { key: '', src: '', width: 320, height: 50 }; ok(G.ads.adsterraDoc() === null, 'sin clave no hay banner');
  ac.adsterra = ad0;
  ok(ac.provider !== 'adsterra' || G.ads.adsterraDoc() !== null, "con provider 'adsterra' la clave y la dirección de config son válidas");

  // Consentimiento
  setProvider('stub');
  ok(G.ads.isEnabled() && G.ads.needsConsent() && !G.ads.hasConsent(), 'con proveedor y sin elegir: hay que pedir consentimiento');
  ok(!G.ads.canOffer('offline') && !G.ads.canOffer('gift') && !G.ads.canOffer('boost'), 'sin consentimiento no se ofrece ningún anuncio');
  ok(!G.ads.setConsent('quizá') && G.ads.getConsent() === 'unset', 'un valor raro no cambia la elección');
  ok(G.ads.setConsent('denied') && !G.ads.hasConsent() && G.ads.needsConsent() && !G.ads.canOffer('offline'), 'sin aceptar se sigue pidiendo (no se juega) y no se ofrece nada');
  ok(G.ads.setConsent('unset') && G.ads.needsConsent() && G.ads.setConsent('granted') && !G.ads.needsConsent(), 'al aceptar deja de pedirse');
  ok(G.ads.setConsent('granted') && G.ads.hasConsent() && G.ads.canOffer('offline') && G.ads.canOffer('gift') && G.ads.canOffer('boost'), 'aceptar: se ofrecen los tres anuncios');
  ready = false; ok(!G.ads.canOffer('offline'), 'sin anuncio listo en el proveedor no se ofrece'); ready = true;
  ac.rewards.gift.enabled = false; ok(!G.ads.canOffer('gift') && G.ads.canOffer('offline'), 'un anuncio se puede apagar por separado'); ac.rewards.gift.enabled = true;
  ok(!G.ads.canOffer('inventado'), 'un anuncio desconocido no se ofrece');
  s.prestige.unlocked = true; G.startChallenge('few'); ok(!G.ads.canOffer('offline') && !G.ads.canOffer('boost') && !G.grantAdBoost(), 'dentro de un reto no se ofrece ni se concede nada'); G.abandonChallenge(); G.takeChallengeEvents();

  // Pedir un anuncio
  outcome = true; ok(G.ads.request('offline') instanceof Promise, 'pedir un anuncio devuelve una promesa');
  const results = [];
  const run = async () => {
    outcome = true; results.push(await G.ads.request('offline'));
    outcome = false; results.push(await G.ads.request('offline'));
    outcome = 'throw'; results.push(await G.ads.request('offline'));
    outcome = true; ready = false; results.push(await G.ads.request('offline')); ready = true;
  };
  run().then(() => {
    ok(results.join() === 'true,false,false,false', 'visto → true; cancelado, con error o sin anuncio listo → false (' + results.join() + ')');
    setProvider(keep);
  });

  // Frenesí ×2 por anuncio
  s = fresh(); G.resetEvents(); const t0 = 1_700_000_000_000; G.obtenerHora = () => t0; setProvider('stub'); G.ads.setConsent('granted');
  s.producers.novice = 10; const base = G.getPps();
  ok(G.getAdBoostWait() === 0 && G.grantAdBoost(), 'el primero se concede');
  ok(G.live.boostMult === ac.rewards.boost.mult && G.live.boostTime === ac.rewards.boost.seconds && near(G.getPps() / base, ac.rewards.boost.mult), 'dura sus segundos y multiplica la producción');
  ok(s.ads.boostAt === t0 && near(G.getAdBoostWait(), ac.rewards.boost.cooldown) && !G.ads.canOffer('boost') && !G.grantAdBoost(), 'no se concede otro hasta que pase el espacio');
  G.obtenerHora = () => t0 + (ac.rewards.boost.cooldown - 1) * 1000; ok(near(G.getAdBoostWait(), 1) && !G.grantAdBoost(), 'a falta de un segundo todavía no');
  G.obtenerHora = () => t0 + ac.rewards.boost.cooldown * 1000; ok(G.getAdBoostWait() === 0 && G.ads.canOffer('boost'), 'pasado el espacio vuelve a ofrecerse');
  G.live.boostMult = 20; G.live.boostTime = 500; G.grantAdBoost(); ok(G.live.boostMult === 20 && G.live.boostTime === 500, 'un frenesí mejor ya en marcha no se rebaja');
  G.resetEvents(); G.obtenerHora = () => Date.now();

  // Duplicar lo ganado offline
  s = fresh(); const summary = { earned: 1000, bonusClaimed: false };
  ok(G.claimOfflineBonus(summary) === 1000 && s.currency === 1000 && s.totalEarned === 1000 && summary.bonusClaimed, 'duplicar lo offline suma otra vez lo ganado');
  ok(G.claimOfflineBonus(summary) === 0 && s.currency === 1000, 'solo una vez por aviso');
  ok(G.claimOfflineBonus(null) === 0 && G.claimOfflineBonus({ earned: 0 }) === 0, 'sin aviso o sin ganancias, nada');

  // Duplicar el regalo diario
  s = fresh(); s.producers.novice = 20; s.missions.day = '2026-10-31'; s.missions.streak = 1;
  const gift = G.getGiftAmount(); const before = s.currency;
  const claimed = G.claimGift(2);
  ok(near(claimed.amount, gift * 2) && near(s.currency - before, gift * 2) && !G.canClaimGift(), 'el regalo duplicado paga el doble y sigue siendo una vez al día');
  s = fresh(); s.producers.novice = 20; s.missions.day = '2026-10-31'; const g1 = G.getGiftAmount(); ok(near(G.claimGift().amount, g1), 'sin anuncio el regalo es el normal');

  // El proveedor de prueba solo con ?ads=test en el equipo local
  setProvider('none'); G.ads.getProvider; global.location = { hostname: 'localhost', search: '?ads=test' };
  ok(G.ads.providerName() === 'test' && G.ads.isEnabled(), 'en localhost, ?ads=test activa el proveedor de prueba');
  global.location = { hostname: '127.0.0.1', search: '?ads=test' }; ok(G.ads.providerName() === 'test', 'también en 127.0.0.1');
  global.location = { hostname: 'mi-juego.example', search: '?ads=test' }; ok(G.ads.providerName() === 'none', 'en un sitio publicado se ignora (no hay recompensas gratis)');
  global.location = { hostname: 'localhost', search: '' }; ok(G.ads.providerName() === 'none', 'sin el parámetro, el configurado');
  global.location = { hostname: '203.0.113.7', search: '?ads=test' }; ok(G.ads.providerName() === 'none', 'una IP que no es local tampoco');
  delete global.location;

  // Guardado
  s = fresh(); s.settings.adsConsent = 'granted'; s.ads.boostAt = 1234567; G.storage.save();
  let L = G.storage.load().state; ok(L.settings.adsConsent === 'granted' && L.ads.boostAt === 1234567, 'el consentimiento y el último frenesí se guardan');
  ok(JSON.stringify(G.storage.parseCode(G.storage.exportCode())) === JSON.stringify(s), 'exportar → importar los conserva');
  const key = config.saveKey;
  store[key] = JSON.stringify({ version: 12, savedAt: 1, state: { settings: { adsConsent: 'sí' }, ads: { boostAt: 'x' } } });
  L = G.storage.load().state; ok(L.settings.adsConsent === 'unset' && L.ads.boostAt === 0, 'valores raros vuelven a lo inicial');
  store[key] = JSON.stringify({ version: 12, savedAt: 1, state: { ads: { boostAt: Date.now() + 1e9 } } });
  L = G.storage.load().state; ok(L.ads.boostAt <= Date.now(), 'una hora futura (reloj atrasado) no bloquea para siempre');
  G.state = fresh(); setProvider(keep);
}

// ── Logros ──────────────────────────────────────────────────
{
  const list = G.achievements;
  const ids = (arr) => arr.map((a) => a.id).sort().join(',');
  const lastUnlock = G.minerals[G.minerals.length - 1].unlockAt;

  ok(list.length === config.achievements.length && new Set(list.map((a) => a.id)).size === list.length, 'ids de logro únicos');
  ok(list.every((a) => a.type && a.icon), 'cada logro con tipo e icono');
  ok(list.filter((a) => a.type === 'mineral').every((a) => config.minerals.some((m) => m.id === a.mineral)), 'logros de mineral existentes');
  ok(list.filter((a) => a.type === 'producer').every((a) => config.producers.some((p) => p.id === a.producer) && a.count > 0), 'logros de productor existentes');
  ok(list.filter((a) => a.type === 'upgrades').every((a) => a.upgrades <= G.upgrades.length), 'no se piden más mejoras de las que hay');
  ok(list.filter((a) => a.type === 'earned').every((a) => a.earned <= lastUnlock), 'el total ganado pedido se alcanza con la escalera');
  for (const l of config.languages) {
    G.state = G.createState(); G.state.settings.language = l;
    ok(list.every((a) => G.describeAchievement(a) && !/\{\w+\}/.test(G.describeAchievement(a))), l + ': descripciones completas');
  }

  let s = fresh();
  ok(G.checkAchievements().length === 0, 'partida nueva sin logros');
  s.totalClicks = 1; ok(ids(G.checkAchievements()) === 'clicks-1', 'primer clic');
  ok(G.checkAchievements().length === 0, 'un logro no se vuelve a anunciar');
  s.totalClicks = 1000; ok(ids(G.checkAchievements()) === 'clicks-1k', 'mil clics');
  s.totalEarned = G.minerals[1].unlockAt; ok(G.checkAchievements().some((a) => a.id === 'mineral-sand'), 'logro de mineral');
  s.producers.novice = 100; ok(G.checkAchievements().some((a) => a.id === 'producer-novice-100'), 'logro de unidades');
  s = fresh(); for (const p of config.producers) s.producers[p.id] = 10;
  ok(G.checkAchievements().some((a) => a.id === 'producer-all-10') && !G.state.achievements['producer-all-50'], 'diez de cada productor');
  s.producers.novice = 9; s.achievements = {}; ok(!G.checkAchievements().some((a) => a.id === 'producer-all-10'), 'falta uno: no se cumple');
  s = fresh(); for (let i = 0; i < 10; i++) s.upgrades['fake' + i] = true;
  ok(G.checkAchievements().some((a) => a.id === 'upgrades-10'), 'diez mejoras compradas');
  s = fresh(); G.tick(3600); ok(s.playTime === 3600 && G.checkAchievements().some((a) => a.id === 'play-1h'), 'tiempo jugado');
  s = fresh(); s.producers.novice = 100; ok(G.checkAchievements().some((a) => a.id === 'pps-100'), 'producción por segundo');
  s = fresh(); s.producers.novice = 10; G.obtenerHora = () => 1_700_000_000_000;
  ok(G.applyOffline(1_700_000_000_000 - 3600 * 1000) !== null && s.offlineReturns === 1 && G.checkAchievements().some((a) => a.id === 'offline-return'), 'volver tras estar fuera');

  // Bonus: +bonus por cada `per` logros
  const { per, bonus } = config.achievementBonus;
  s = fresh();
  const setCount = (n) => { s.achievements = {}; for (let i = 0; i < n; i++) s.achievements['x' + i] = true; };
  setCount(per - 1); ok(G.getAchievementMultiplier() === 1, 'sin bonus antes del primer tramo');
  setCount(per); ok(near(G.getAchievementMultiplier(), 1 + bonus), 'primer tramo de bonus');
  setCount(list.length); ok(near(G.getAchievementMultiplier(), 1 + Math.floor(list.length / per) * bonus), 'bonus con todos los logros');
  s = fresh(); s.producers.novice = 10; const base = G.getPps(); setCount(per);
  ok(near(G.getPps(), base * (1 + bonus)) && near(G.getClickValue(), config.click.base * (1 + bonus)), 'el bonus multiplica producción y clic');

  // Guardado
  s = fresh(); s.achievements = { 'clicks-1': true, 'clicks-1k': true }; s.playTime = 4321.5; s.offlineReturns = 3; G.storage.save();
  const back = G.storage.load().state;
  ok(JSON.stringify(back) === JSON.stringify(s), 'logros, tiempo y vueltas se guardan y cargan');
  store[config.saveKey] = JSON.stringify({ version: 3, savedAt: 1, state: { achievements: { 'clicks-1': true, fantasma: true, 'clicks-1k': 'sí' }, playTime: -5, offlineReturns: 'x' } });
  const odd = G.storage.load().state;
  ok(Object.keys(odd.achievements).join() === 'clicks-1' && odd.playTime === 0 && odd.offlineReturns === 0, 'logros y contadores raros saneados');
  store[config.saveKey] = JSON.stringify({ version: 2, savedAt: 1, state: { currency: 5 } });
  ok(Object.keys(G.storage.load().state.achievements).length === 0, 'partida antigua sin logros: empieza vacía');
  G.resetGame(); ok(Object.keys(G.state.achievements).length === 0 && G.state.playTime === 0, 'reiniciar borra logros y tiempo');
}

// ── Sonido ──────────────────────────────────────────────────
{
  // Un AudioContext falso que solo cuenta los nodos que se crean.
  class FakeParam {
    constructor() { this.value = 0; }
    setValueAtTime(v) { this.value = v; }
    exponentialRampToValueAtTime() {}
    setTargetAtTime(v) { this.value = v; }
  }
  class FakeNode {
    constructor(kind, ctx) { this.kind = kind; ctx.created.push(kind); this.gain = new FakeParam(); this.frequency = new FakeParam(); this.Q = new FakeParam(); }
    connect(target) { return target; }
    start() {}
    stop() {}
  }
  class FakeAudioContext {
    constructor() {
      this.currentTime = 0; this.state = 'running'; this.destination = {}; this.sampleRate = 8000; this.created = [];
      FakeAudioContext.last = this;
    }
    createGain() { return new FakeNode('gain', this); }
    createOscillator() { return new FakeNode('osc', this); }
    createBufferSource() { return new FakeNode('src', this); }
    createBiquadFilter() { return new FakeNode('filter', this); }
    createBuffer(channels, length) { this.created.push('buffer'); return { getChannelData: () => new Float32Array(length) }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  const count = (kind) => (FakeAudioContext.last ? FakeAudioContext.last.created.filter((k) => k === kind).length : 0);
  // El módulo guarda su contexto: se vuelve a cargar para cada situación.
  const freshSound = () => {
    FakeAudioContext.last = null;
    delete require.cache[require.resolve(path.join(__dirname, '..', 'js', 'sound.js'))];
    require(path.join(__dirname, '..', 'js', 'sound.js'));
    return G.sound;
  };

  const cfg = config.sound;
  let S = freshSound();
  ok(near(S.levelFor(1), cfg.master) && S.levelFor(0) === 0 && S.levelFor(0.25) < S.levelFor(0.5) && S.levelFor(0.5) < S.levelFor(0.75), 'curva de volumen creciente y acotada');

  // Sin WebAudio no pasa nada
  delete window.AudioContext; delete window.webkitAudioContext;
  S = freshSound(); fresh();
  let threw = false; try { S.unlock(); S.play('click'); S.play('buy'); S.refresh(); } catch (e) { threw = true; }
  ok(!threw, 'sin AudioContext no lanza errores');

  window.AudioContext = FakeAudioContext;
  S = freshSound(); fresh();
  S.play('click'); ok(!FakeAudioContext.last, 'sin un gesto previo play() no crea el contexto');
  S = freshSound(); fresh(); S.unlock();
  ok(FakeAudioContext.last !== null, 'el primer gesto crea el contexto');
  S.play('click');
  ok(count('osc') === 1 && count('src') === 1, 'clic: un golpe de ruido y un tono (osc ' + count('osc') + ', src ' + count('src') + ')');
  S.play('click'); ok(count('osc') === 1, 'dos clics seguidos: el segundo se descarta (separación mínima)');
  const gains = FakeAudioContext.last.created.filter((k) => k === 'gain').length;
  ok(gains >= 3, 'cada sonido pasa por su propia envolvente');

  S = freshSound(); fresh(); S.unlock();
  S.play('buy'); ok(count('osc') === 2, 'compra: dos notas');
  S.play('unlock'); ok(count('osc') === 2 + 8, 'mineral: cuatro notas con su octava');
  S.play('achievement'); ok(count('osc') === 2 + 8 + 3, 'logro: tres parciales');
  S.play('no-existe'); ok(count('osc') === 13, 'un sonido desconocido no hace nada');

  S = freshSound(); const s = fresh(); S.unlock();
  for (let i = 0; i < cfg.maxVoices + 5; i++) S.play('buy');
  ok(count('osc') === cfg.maxVoices * 2, 'tope de ' + cfg.maxVoices + ' sonidos a la vez (' + count('osc') / 2 + ')');

  S = freshSound(); const t = fresh(); t.settings.sound = false; S.unlock(); S.play('buy');
  ok(FakeAudioContext.last === null, 'con el sonido apagado no se crea ni el contexto');
  S = freshSound(); const u = fresh(); u.settings.volume = 0; S.unlock(); S.play('buy');
  ok(FakeAudioContext.last === null, 'con volumen 0 tampoco');

  S = freshSound(); fresh(); S.unlock(); const before = FakeAudioContext.last.created.length;
  FakeAudioContext.last.state = 'suspended'; S.play('buy');
  ok(FakeAudioContext.last.created.length === before, 'con el audio suspendido no se programa nada');
  S.unlock(); ok(FakeAudioContext.last.state === 'running', 'el siguiente gesto lo reanuda');

  S = freshSound(); const v = fresh(); v.settings.volume = 0.5; S.unlock();
  const master = FakeAudioContext.last.created.indexOf('gain'); // el primer nodo creado es el volumen general
  ok(master === 0, 'el primer nodo es el volumen general');
  v.settings.volume = 1; S.refresh(); ok(true, 'refresh no falla al cambiar el volumen');

  // Ajustes: guardado y saneado
  const key = config.saveKey;
  const put = (settings) => { store[key] = JSON.stringify({ version: 3, savedAt: 1, state: { settings } }); return G.storage.load().state.settings; };
  let st = put({ sound: false, volume: 0.2 }); ok(st.sound === false && st.volume === 0.2, 'sonido y volumen guardados');
  st = put({ sound: 'sí', volume: 5 }); ok(st.sound === true && st.volume === cfg.defaultVolume, 'valores no válidos → por defecto');
  st = put({ volume: -0.1 }); ok(st.volume === cfg.defaultVolume, 'volumen negativo → por defecto');
  st = put({ volume: 'alto' }); ok(st.volume === cfg.defaultVolume, 'volumen no numérico → por defecto');
  st = put({}); ok(st.sound === true && st.volume === cfg.defaultVolume, 'partida antigua: sonido activado a volumen bajo');
  ok(fresh().settings.sound === true && fresh().settings.volume === cfg.defaultVolume, 'partida nueva con sonido activado');
  freshSound(); delete window.AudioContext;
}

// ── Gemas (SVG) y rarezas ───────────────────────────────────
{
  const geometry = (m, i) => JSON.stringify(G.gem.build(m, i));
  const lastIndex = G.minerals.length - 1;

  ok(config.minerals.every((m) => config.rarities.includes(m.rarity)), 'cada rareza de mineral está en config.rarities');
  ok(config.minerals.every((m) => G.gem.shapeNames.includes(m.shape)), 'cada mineral tiene una forma de gema que existe');
  ok(G.minerals.every((m, i, a) => i === 0 || G.rarityLevel(m) >= G.rarityLevel(a[i - 1])), 'la rareza no baja al avanzar en la escalera');
  ok(G.rarityLevel(G.minerals[0]) === 0 && G.rarityLevel(G.minerals[lastIndex]) === config.rarities.length - 1, 'de común a divino');

  let bad = [];
  G.minerals.forEach((m, i) => {
    const gem = G.gem.build(m, i);
    const points = gem.polys.flatMap((p) => p.pts);
    if (gem.polys.length < 6) bad.push(m.id + ': pocas facetas');
    if (!points.every(([x, y]) => x >= 0 && x <= 200 && y >= 0 && y <= 200)) bad.push(m.id + ': puntos fuera del lienzo');
    if (!gem.polys.every((p) => p.pts.length >= 3 && p.tone >= -1 && p.tone <= 1)) bad.push(m.id + ': cara no válida');
    if (geometry(m, i) !== geometry(m, i)) bad.push(m.id + ': no es determinista');
    if (gem.spin !== (gem.shape === 'star')) bad.push(m.id + ': solo la estrella gira');
  });
  ok(bad.length === 0, 'gemas válidas: ' + bad.slice(0, 4).join('; '));
  ok(geometry(G.minerals[0], 0) !== geometry(G.minerals[1], 1), 'cada mineral tiene su propia gema (misma forma, distinto detalle)');
  const usedShapes = new Set(G.minerals.map((m) => m.shape));
  ok(G.gem.shapeNames.every((s) => usedShapes.has(s)), 'todas las formas definidas se usan: sobran ' + G.gem.shapeNames.filter((s) => !usedShapes.has(s)).join(','));
  ok(usedShapes.size >= 15, 'variedad de formas: ' + usedShapes.size);
  // Dos minerales con la misma forma no dibujan lo mismo (semilla y color propios)
  const byShape = {};
  G.minerals.forEach((m, i) => { (byShape[m.shape] = byShape[m.shape] || []).push(i); });
  const twins = Object.values(byShape).filter((list) => list.length > 1);
  ok(twins.every((list) => geometry(G.minerals[list[0]], list[0]) !== geometry(G.minerals[list[1]], list[1]) || G.minerals[list[0]].accent !== G.minerals[list[1]].accent), 'minerales con la misma forma se distinguen');
  ok(G.minerals.every((m, i) => !JSON.stringify(G.gem.build(m, i)).includes('null') && !JSON.stringify(G.gem.build(m, i)).includes('NaN')), 'sin NaN en la geometría');

  const hex = /^#[0-9a-f]{6}$/;
  ok(G.minerals.every((m) => [-1, -0.3, 0, 0.4, 1].every((t) => hex.test(G.gem.shade(m.accent, t)))), 'shade devuelve colores #rrggbb');
  const channel = (c, k) => parseInt(c.slice(1 + 2 * k, 3 + 2 * k), 16);
  const lum = (c) => channel(c, 0) + channel(c, 1) + channel(c, 2);
  ok(G.minerals.every((m) => lum(G.gem.shade(m.accent, 0.5)) >= lum(G.gem.shade(m.accent, 0)) && lum(G.gem.shade(m.accent, -0.5)) <= lum(G.gem.shade(m.accent, 0))), 'shade aclara y oscurece');
  ok(G.minerals.every((m) => [0, 1, 2].every((k) => Math.abs(channel(G.gem.shade(m.accent, 0), k) - channel(m.accent, k)) <= 3)), 'shade(0) conserva el color');
  const rand = G.gem.seeded(7), rand2 = G.gem.seeded(7);
  ok(rand() === rand2() && rand() === rand2() && G.gem.seeded(8)() !== G.gem.seeded(7)(), 'generador con semilla');
}

// ── Textos (ES/EN) ──────────────────────────────────────────
{
  const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');
  const langs = config.languages;
  ok(langs.every((l) => G.lang[l]), 'hay tabla para cada idioma de config.languages');
  const reference = Object.keys(G.lang.es);
  for (const l of langs) {
    const table = G.lang[l];
    const missing = reference.filter((k) => !(k in table));
    const extra = Object.keys(table).filter((k) => !(k in G.lang.es));
    ok(missing.length === 0, l + ': faltan claves → ' + missing.slice(0, 5).join(', '));
    ok(extra.length === 0, l + ': claves que no están en es → ' + extra.slice(0, 5).join(', '));
    const badParams = reference.filter((k) => k in table && placeholders(table[k]) !== placeholders(G.lang.es[k]));
    ok(badParams.length === 0, l + ': distintos {valores} que en es → ' + badParams.slice(0, 5).join(', '));
    ok(Object.values(table).every((v) => typeof v === 'string' && v.length > 0), l + ': textos vacíos o no texto');
  }

  // Todo lo que sale del config tiene nombre en cada idioma
  const needed = [
    ...config.producers.map((p) => 'producer.' + p.id),
    ...config.minerals.map((m) => 'mineral.' + m.id),
    ...config.minerals.map((m) => 'rarity.' + m.rarity),
    ...config.clickUpgrades.concat(config.globalUpgrades).map((u) => 'upgrade.' + u.id),
    ...langs.map((l) => 'lang.' + l),
    'options.sound', 'options.soundOn', 'options.soundOff', 'options.volume', 'sound.mute', 'sound.unmute',
    ...G.achievements.map((a) => 'ach.' + a.id),
    ...config.prestige.skills.flatMap((k) => ['skill.' + k.id, 'skill.effect.' + k.type]),
    ...config.prestige.unlocks.filter((u) => u.feature).map((u) => 'prestige.milestone.' + u.feature),
    ...config.milestones.flatMap((m) => ['milestone.' + m.id, 'milestone.' + m.id + '.desc']),
    ...config.missions.intro.map((m) => 'intro.' + m.id),
    ...config.biomes.map((b) => 'biome.' + b.id), 'biome.enter',
    'shop.buyAll', 'shop.buyAllNone', 'shop.buyAllHint', 'shop.boughtAll',
    'upgrade.synergyName', 'upgrade.synergy',
    ...config.minerals.map((m) => 'fact.' + m.id),
    ...config.producers.map((p) => 'machine.' + p.id), ...config.catalog.eras.map((e) => 'era.' + e.id),
    ...config.challenges.map((c) => 'challenge.' + c.id),
    'hud.locked', 'dex.gated', 'prestige.milestone.biome', 'biome.beyond',
    ...['title', 'first', 'faster', 'deeper', 'same', 'shallower', 'ready', 'time', 'mineral', 'earned', 'pps', 'clicks', 'bought', 'crits', 'goldens', 'before', 'cores', 'spend', 'share', 'continue'].map((k) => 'summary.' + k),
    ...config.challenges.map((c) => 'challenge.reward.' + c.reward.type),
    ...['challenges.open', 'challenges.title', 'challenges.hint', 'challenges.start', 'challenges.retry', 'challenges.startConfirm', 'challenges.todo', 'challenges.done', 'challenges.abandon', 'challenges.abandonConfirm',
      'challenge.banner', 'challenge.timeLeft', 'challenge.rewardLine', 'challenge.rule.none', 'challenge.rule.noProducers', 'challenge.rule.noUpgrades', 'challenge.rule.maxProducers', 'challenge.rule.costGrowth', 'challenge.rule.limit',
      'challenge.goalMineral', 'challenge.goalEarned', 'challenge.won', 'challenge.wonSub', 'challenge.record', 'challenge.failed', 'challenge.failedSub', 'challenge.abandoned', 'prestige.inChallenge', 'report.challenge'],
    ...['dex.tabMinerals', 'dex.tabMachines', 'catalog.title', 'catalog.progress', 'catalog.bonus', 'catalog.bonusHint', 'catalog.eraDone', 'catalog.unlockAt', 'catalog.undiscovered', 'catalog.meta', 'catalog.owned', 'catalog.eraCount', 'catalog.eraComplete', 'report.catalog'],
    ...['share.open', 'share.title', 'share.hint', 'share.share', 'share.download', 'share.copy', 'share.working', 'share.ready', 'share.shared', 'share.downloaded', 'share.copied', 'share.copyFailed', 'share.shareFailed', 'share.failed', 'share.headline', 'share.headline0', 'share.total', 'share.pps', 'share.dex', 'share.time', 'share.cta', 'share.text', 'share.textPrestige'],
    ...['dex.open', 'dex.title', 'dex.progress', 'dex.bonus', 'dex.bonusHint', 'dex.biomeDone', 'dex.locked', 'dex.unlockAt', 'dex.undiscovered', 'dex.meta', 'dex.biomeCount', 'dex.biomeComplete', 'report.dex'],
    ...[...new Set(config.missions.daily.pool.map((g) => g.counter))].map((c) => 'goal.' + c),
    ...['golden.title', 'golden.frenzy', 'golden.lump', 'golden.aria', 'boost.label', 'report.boost'],
    ...['playTime', 'clicks', 'earned', 'pps', 'perClick', 'mineral', 'mineralValue', 'producers', 'upgrades', 'achievements', 'offline'].map((k) => 'stats.' + k),
  ];
  for (const l of langs) {
    const missing = needed.filter((k) => !(k in G.lang[l]));
    ok(missing.length === 0, l + ': faltan nombres → ' + missing.slice(0, 5).join(', '));
  }

  // Las claves que usa el HTML existen
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) used.push(...m[1].split(';').map((p) => p.split(':')[1].trim()));
  ok(used.length > 20, 'el HTML usa claves de texto (' + used.length + ')');
  ok(used.every((k) => k in G.lang.es), 'claves del HTML sin traducir: ' + used.filter((k) => !(k in G.lang.es)).join(', '));

  // Cada clave que usa el código existe (se buscan tr('...') en los scripts)
  const fs = require('fs');
  const sources = fs.readdirSync(path.join(__dirname, '..', 'js')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
  const literal = [...sources.matchAll(/\btr\('([a-zA-Z.]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.'));
  ok(literal.every((k) => k in G.lang.es), 'claves de código sin traducir: ' + literal.filter((k) => !(k in G.lang.es)).join(', '));

  // tr(): idioma de la partida, sustitución, respaldo en español y clave visible si no existe
  fresh();
  G.state.settings.language = 'es'; ok(G.tr('shop.each', { n: 5 }) === '+5/s cada uno', 'tr en español');
  G.state.settings.language = 'en'; ok(G.tr('shop.each', { n: 5 }) === '+5/s each', 'tr en inglés');
  ok(G.tr('no.existe') === 'no.existe', 'clave inexistente → la propia clave');
  ok(G.tr('shop.each') === '+{n}/s each', 'sin valores deja el marcador');
  ok(G.producerName('novice') === 'Novice Miner' && G.mineralName(G.minerals[1]) === 'Sand' && G.upgradeName(G.upgradeById['novice-10']) === 'Novice Miner I', 'nombres en inglés');
  G.state.settings.language = 'es';
  ok(G.upgradeName(G.upgradeById['novice-10']) === 'Minero novato I' && G.upgradeName(G.upgradeById.pick) === 'Pico reforzado', 'nombres en español');
  ok(G.detectLanguage() === 'es', 'un navegador en español da español');
  globalThis.navigator = { language: 'en-US' };
  ok(G.detectLanguage() === 'en', 'un navegador en inglés da inglés');
  globalThis.navigator = { language: 'fr-FR' };
  ok(G.detectLanguage() === 'es', 'un idioma que no tenemos cae en español');
  delete globalThis.navigator;
  ok(G.detectLanguage() === 'es', 'sin navegador el idioma por defecto es español');
  globalThis.navigator = { language: 'es-ES' };
}

// ── Formato de números ──────────────────────────────────────
{
  const f = G.formatNumber;
  fresh();
  const abbreviated = [[0, '0'], [0.1, '0.1'], [999, '999'], [999.96, '1.00K'], [1234, '1.23K'], [12345, '12.3K'], [999949, '1.00M'],
    [1e33, '1.00Dc'], [1e36, '1.00Ud'], [1e63, '1.00Vg'], [1e66, '1.00e66'], [-1500, '-1.50K'], [NaN, '0'], [Infinity, '∞']];
  for (const [n, e] of abbreviated) ok(f(n) === e, 'abreviado ' + n + ' → ' + f(n) + ' (esperado ' + e + ')');
  G.state.settings.notation = 'scientific';
  const scientific = [[0, '0'], [999, '999'], [999.96, '1.00e3'], [1234, '1.23e3'], [2.4e36, '2.40e36'], [-1500, '-1.50e3']];
  for (const [n, e] of scientific) ok(f(n) === e, 'científico ' + n + ' → ' + f(n) + ' (esperado ' + e + ')');
}

console.log(failures ? failures + ' de ' + checks + ' comprobaciones FALLAN' : 'Todo OK (' + checks + ' comprobaciones)');
process.exit(failures ? 1 : 0);

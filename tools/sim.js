// Simulador de progresión para balancear el juego. Uso (desde la raíz del proyecto):
//
//   node tools/sim.js [--cps=2] [--hours=500] [--valueGrowth=3]
//       Simula con el config actual y muestra cuándo se desbloquea cada mineral.
//
//   node tools/sim.js --achievements
//       Cuenta también el bonus de los logros (el bot los consigue según avanza; el clic y el tiempo
//       jugado se simulan, pero las vueltas offline no).
//
//   node tools/sim.js --timeline=30
//       Además de la tabla, lista las compras de los primeros 30 minutos (cada cuánto compra el bot).
//
//   node tools/sim.js --calibrate --d1=5 --g=1.25 [--valueGrowth=3] [--cps=2] [--ungate]
//       Calcula los umbrales de desbloqueo para que el mineral nº i dure d1 × g^i minutos
//       (d1 en minutos) y los imprime listos para pegar en `mineralCurve.unlocks`.
//
// Un jugador "bot" pica `cps` veces por segundo y compra siempre lo que antes se amortiza
// (coste / mejora de ingresos, más el tiempo de espera hasta poder pagarlo). Usa la lógica real del
// juego (js/), así que los resultados reflejan el config actual. Los parámetros de curva sobrescriben
// `config.mineralCurve` solo para la prueba.
'use strict';

const path = require('path');

const args = {};
const overrides = []; // --set:ruta=valor (valor en JSON): prueba un cambio del config sin tocarlo, p. ej. --set:synergy.perUnit=0.01
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--set:')) { const [path, ...rest] = a.slice(6).split('='); overrides.push([path, JSON.parse(rest.join('='))]); continue; }
  const [key, value] = a.replace(/^--/, '').split('=');
  args[key] = value === undefined ? true : Number(value);
}

global.window = global;
const load = (file) => require(path.join(__dirname, '..', 'js', file));

load('config.js');
for (const [path, value] of overrides) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], window.Game.config)[last] = value;
}
if (args.ungate) for (const m of window.Game.config.minerals) m.unlockPrestiges = 0; // simula también el tramo final (que en el juego pide renaceres)
const G = window.Game;
for (const key of ['firstUnlock', 'unlockGrowth', 'valueGrowth']) {
  if (args[key] !== undefined) G.config.mineralCurve[key] = args[key];
}
for (const f of ['lang/es.js', 'lang/en.js', 'i18n.js', 'format.js', 'state.js', 'upgrades.js', 'minerals.js', 'game.js', 'biomes.js', 'events.js', 'prestige.js', 'milestones.js', 'dex.js', 'catalog.js', 'challenges.js', 'ads.js', 'missions.js', 'achievements.js']) load(f);

const cps = args.cps !== undefined ? args.cps : 2;
const maxSeconds = (args.hours !== undefined ? args.hours : 500) * 3600;
const maxIterations = 600_000;
const calibrating = !!args.calibrate;
const withAchievements = !!args.achievements;
const state = G.state;
// Hasta dónde llega el bot: el último mineral abierto sin renaceres (o todos, con --ungate). Los rangos sin fin no se simulan.
const last = args.ungate ? G.realMineralCount - 1 : G.getLastAvailableMineral();

// Duración objetivo (s) del mineral con índice i, solo para calibrar.
const targetSeconds = (i) => (args.d1 !== undefined ? args.d1 : 5) * Math.pow(args.g !== undefined ? args.g : 1.25, i) * 60;
// Dos cifras significativas, redondeando hacia arriba: para que los umbrales sean legibles.
const ceil2 = (x) => {
  const exp = Math.floor(Math.log10(x)) - 1;
  return Math.ceil(x / Math.pow(10, exp)) * Math.pow(10, exp);
};

if (calibrating) for (let i = 1; i <= last; i++) G.minerals[i].unlockAt = Infinity;

const income = () => G.getPps() + cps * G.getClickValue();

function advance(seconds) {
  const gained = income() * seconds;
  state.currency += gained;
  state.totalEarned += gained;
  state.playTime += seconds;
  if (withAchievements) {
    // El bot pica `cps` veces por segundo: se cuentan esos clics para los logros de clics.
    state.totalClicks += cps * seconds;
    G.checkAchievements();
  }
}

// Cada opción sabe aplicarse y deshacerse, para medir cuánto sube el ingreso sin comprarla.
function options() {
  const list = [];
  for (const p of G.config.producers) {
    if (G.getProducerVisibility(p.id) !== 'open') continue;
    list.push({
      name: G.producerName(p.id) + ' #' + (state.producers[p.id] + 1),
      cost: G.getProducerCost(p.id),
      apply: () => { state.producers[p.id] += 1; },
      undo: () => { state.producers[p.id] -= 1; },
    });
  }
  for (const u of G.upgrades) {
    if (!G.isUpgradeAvailable(u)) continue;
    list.push({
      name: G.upgradeName(u),
      cost: u.cost,
      apply: () => { state.upgrades[u.id] = true; },
      undo: () => { delete state.upgrades[u.id]; },
    });
  }
  return list;
}

function pickBest() {
  const now = income();
  let best = null;
  for (const o of options()) {
    const before = income();
    o.apply();
    const gain = income() - before;
    o.undo();
    if (!(gain > 0)) continue;
    const wait = Math.max(0, o.cost - state.currency) / now;
    o.score = wait + o.cost / gain;
    if (!best || o.score < best.score) best = o;
  }
  return best;
}

const fmtTime = (s) => {
  if (s < 90) return Math.round(s) + 's';
  if (s < 5400) return (s / 60).toFixed(1) + 'min';
  if (s < 172800) return (s / 3600).toFixed(1) + 'h';
  return (s / 86400).toFixed(1) + 'd';
};

const purchases = []; // { t, name, cost, mineral }
let t = 0;
let tUnlock = 0;
let lastIndex = 0;
const rows = [];
let iterations = 0;

while (t < maxSeconds && iterations++ < maxIterations) {
  if (withAchievements) G.checkAchievements();
  const index = G.getMineralIndex();
  if (index !== lastIndex) {
    rows.push({ index, t, earned: state.totalEarned, income: income() });
    lastIndex = index;
    tUnlock = t;
  }
  const next = index < last ? G.minerals[index + 1] : null;

  // Calibrando: al cumplirse la duración objetivo, el umbral del siguiente es lo ganado hasta ahora.
  const deadline = calibrating && next && next.unlockAt === Infinity ? tUnlock + targetSeconds(index) : Infinity;
  if (t >= deadline - 1e-6) {
    next.unlockAt = ceil2(state.totalEarned);
    continue;
  }
  if (!next) break; // último mineral alcanzado

  const best = pickBest();
  if (!best) break;

  const rate = income();
  const wait = Math.max(0, best.cost - state.currency) / rate;

  // Si antes de poder pagar se cruza un umbral (el del mineral o el fin de la duración objetivo),
  // el ingreso o el plan cambian: se avanza hasta ahí y se vuelve a decidir.
  const untilNext = next ? (next.unlockAt - state.totalEarned) / rate : Infinity;
  const stop = Math.min(untilNext, deadline - t);
  if (stop < wait) {
    const step = Math.max(stop, 0) + 1e-6;
    advance(step);
    t += step;
    continue;
  }

  advance(wait);
  t += wait;
  state.currency -= best.cost;
  best.apply();
  purchases.push({ t, name: best.name, cost: best.cost, mineral: index });
}

const c = G.config.mineralCurve;
console.log(calibrating
  ? `\nCalibración: mineral nº i dura ${args.d1 !== undefined ? args.d1 : 5}min × ${args.g !== undefined ? args.g : 1.25}^i | valueGrowth=${c.valueGrowth} | ${cps} clics/s | ${iterations} compras`
  : `\nCurva: firstUnlock=${c.firstUnlock} unlockGrowth=${c.unlockGrowth} valueGrowth=${c.valueGrowth} | ${cps} clics/s | ${iterations} compras`);
// Por mineral: nº de compras y la espera más larga entre dos compras seguidas (huecos sin nada que hacer).
const perMineral = G.minerals.map(() => ({ count: 0, maxGap: 0 }));
purchases.forEach((p, i) => {
  const stat = perMineral[p.mineral];
  stat.count++;
  if (i > 0) stat.maxGap = Math.max(stat.maxGap, p.t - purchases[i - 1].t);
});
console.log('mineral'.padEnd(18), 'desbloqueo'.padEnd(11), 'tarda'.padEnd(9), 'umbral'.padEnd(10), 'ingreso/s'.padEnd(10), 'mult.'.padEnd(8), 'compras'.padEnd(8), 'espera máx.');
let prev = 0;
for (const r of rows) {
  const m = G.minerals[r.index];
  console.log(
    (r.index + 1 + '. ' + G.mineralName(m)).padEnd(18),
    fmtTime(r.t).padEnd(11),
    fmtTime(r.t - prev).padEnd(9),
    G.formatNumber(m.unlockAt).padEnd(10),
    G.formatNumber(r.income).padEnd(10),
    ('×' + G.formatNumber(m.value)).padEnd(8),
    String(perMineral[r.index - 1].count).padEnd(8),
    fmtTime(perMineral[r.index - 1].maxGap));
  prev = r.t;
}
const left = last - G.getMineralIndex();
console.log(left > 0
  ? `Simulado ${fmtTime(t)}; faltan ${left} minerales (se paró por tiempo o por no haber compras útiles).`
  : `Escalera completa en ${fmtTime(t)}.`);
// Cuándo se compra por primera vez cada productor (ritmo de descubrimiento a lo largo de la escalera).
if (!calibrating) {
  const first = G.config.producers.map((p) => {
    const hit = purchases.find((x) => x.name === G.producerName(p.id) + ' #1');
    return hit ? G.producerName(p.id) + ' ' + fmtTime(hit.t) : null;
  }).filter(Boolean);
  console.log('Descubrimiento de productores:', first.join(' · '));
}
const owned = Object.entries(state.producers).filter(([, n]) => n > 0).map(([id, n]) => id + ':' + n).join(' ');
console.log('Productores:', owned || '—');
if (withAchievements) console.log('Logros:', G.getAchievementCount() + '/' + G.achievements.length, '| bonus ×' + G.getAchievementMultiplier().toFixed(2));

if (args.timeline) {
  console.log('\nCompras de los primeros ' + args.timeline + ' min:');
  let prevT = 0;
  for (const p of purchases) {
    if (p.t > args.timeline * 60) break;
    console.log('  ' + fmtTime(p.t).padStart(7), ('+' + fmtTime(p.t - prevT)).padStart(8), p.name.padEnd(28), G.formatNumber(p.cost));
    prevT = p.t;
  }
}

if (calibrating) {
  const list = G.minerals.slice(1).map((m) => (Number.isFinite(m.unlockAt) ? Number(m.unlockAt.toPrecision(2)) : null));
  console.log('\nunlocks: [' + list.join(', ') + '],');
}

// Mejoras que ya estaban disponibles y el bot no llegó a comprar (señal de que quizá cuestan de más).
const pending = G.upgrades.filter((u) => G.isUpgradeAvailable(u));
const synBought = Object.keys(state.upgrades).filter((id) => id.startsWith('syn-')).length;
console.log('Sinergias compradas: ' + synBought + '/' + (G.config.producers.length - 1));
console.log('Mejoras compradas:', Object.keys(state.upgrades).length + '/' + G.upgrades.length
  + (pending.length ? ' | disponibles sin comprar: ' + pending.map((u) => G.upgradeName(u)).join(', ') : ''));

// Simulador de vueltas de prestigio. Uso (desde la raíz del proyecto):
//
//   node tools/sim-prestige.js [--runs=25] [--cps=2] [--wait=0]
//
// Un bot juega como en tools/sim.js (pica `cps` veces por segundo y compra lo que antes se amortiza),
// renace en cuanto puede (o espera `wait` minerales más allá del exigido, para ganar más Núcleos) y gasta
// los Núcleos en la habilidad más barata que pueda pagar. Imprime cuánto tarda cada vuelta, para comprobar
// que renacer se nota: las vueltas deben ser claramente más rápidas que la primera.
//
// Para probar un cambio del config sin tocarlo: --set:ruta=valor (valor en JSON), p. ej.
//   node tools/sim-prestige.js --runs=40 --wait=3 --set:prestige.targetHeadroom=5
//   node tools/sim-prestige.js --runs=40 "--set:prestige.coreCaps=[{\"from\":1,\"max\":3}]"
// Las vueltas de final de partida tardan mucho en simularse (cientos de compras por paso): para medirlas, mejor una sola
// vuelta suelta con `node tools/balance.js laterun --count=90 --wait=3`.
// Referencia (40 renaceres, bot de 2 clics/s): con `wait=0` (renacer en cuanto se puede) tarda ~46 h;
// con `wait=2…4` ~21–27 h, porque esperar un poco da más Núcleos. Ver también tools/balance.js.
'use strict';

const path = require('path');

const args = {};
const overrides = []; // --set:prestige.mineralsPerCore=1  (valor en JSON): prueba un cambio del config sin tocarlo
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--set:')) { const [path, ...rest] = a.slice(6).split('='); overrides.push([path, JSON.parse(rest.join('='))]); continue; }
  const [key, value] = a.replace(/^--/, '').split('=');
  args[key] = value === undefined ? true : Number(value);
}
const cps = args.cps !== undefined ? args.cps : 2;
const runs = args.runs !== undefined ? args.runs : 25;
const wait = args.wait !== undefined ? args.wait : 0;

global.window = global;
const load = (file) => require(path.join(__dirname, '..', 'js', file));
load('config.js');
for (const [path, value] of overrides) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], window.Game.config)[last] = value;
}
for (const f of ['lang/es.js', 'lang/en.js', 'i18n.js', 'format.js', 'state.js', 'upgrades.js', 'minerals.js', 'game.js', 'biomes.js', 'events.js', 'prestige.js', 'milestones.js', 'dex.js', 'catalog.js', 'challenges.js', 'ads.js', 'missions.js', 'achievements.js']) load(f);
const G = window.Game;

const fmtTime = (s) => {
  if (s < 90) return Math.round(s) + 's';
  if (s < 5400) return (s / 60).toFixed(1) + 'min';
  if (s < 172800) return (s / 3600).toFixed(1) + 'h';
  return (s / 86400).toFixed(1) + 'd';
};

const income = () => G.getIncomePerSecond() + cps * G.getClickValue();

function advance(seconds) {
  const gained = income() * seconds;
  G.state.currency += gained;
  G.state.totalEarned += gained;
}

function options() {
  const s = G.state;
  const list = [];
  // Solo se miran las compras que se pagarían en un par de horas: lo demás nunca es la mejor opción y, con cientos de
  // mejoras, mirarlo todo en cada paso haría las vueltas largas eternas.
  const reach = s.currency + 7200 * income();
  for (const p of G.config.producers) {
    if (G.getProducerVisibility(p.id) !== 'open') continue;
    if (G.getProducerCost(p.id) > reach) continue;
    list.push({ cost: G.getProducerCost(p.id), apply: () => { s.producers[p.id] += 1; }, undo: () => { s.producers[p.id] -= 1; } });
  }
  for (const u of G.upgrades) {
    if (u.cost > reach || !G.isUpgradeAvailable(u)) continue;
    list.push({ cost: u.cost, apply: () => { s.upgrades[u.id] = true; }, undo: () => { delete s.upgrades[u.id]; } });
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
    o.score = Math.max(0, o.cost - G.state.currency) / now + o.cost / gain;
    if (!best || o.score < best.score) best = o;
  }
  return best;
}

// Juega la vuelta hasta llegar al mineral `goal`; devuelve los segundos que tardó.
function playRun(goal) {
  const s = G.state;
  let t = 0;
  let guard = 0;
  while (G.getMineralIndex() < goal && guard++ < 400_000) {
    const best = pickBest();
    if (!best) break;
    const rate = income();
    const buyIn = Math.max(0, best.cost - s.currency) / rate;
    const untilGoal = (G.minerals[goal].unlockAt - s.totalEarned) / rate;
    const untilNext = (G.minerals[G.getMineralIndex() + 1].unlockAt - s.totalEarned) / rate;
    const stop = Math.min(untilGoal, untilNext);
    if (stop < buyIn) {
      const step = Math.max(stop, 0) + 1e-6;
      advance(step);
      t += step;
      continue;
    }
    advance(buyIn);
    t += buyIn;
    s.currency -= best.cost;
    best.apply();
  }
  return t;
}

// Gasta los Núcleos: siempre el siguiente nivel más barato que se pueda pagar.
function spendCores() {
  const bought = [];
  for (;;) {
    let pick = null;
    for (const sk of G.skills) {
      if (!G.canBuySkill(sk.id)) continue;
      if (!pick || G.getSkillCost(sk.id) < G.getSkillCost(pick.id)) pick = sk;
    }
    if (!pick) return bought;
    G.buySkill(pick.id);
    bought.push(pick.id + G.getSkillLevel(pick.id));
  }
}

console.log(`Bot: ${cps} clics/s, espera ${wait} minerales extra antes de renacer.\n`);
console.log('vuelta'.padEnd(7), 'objetivo'.padEnd(14), 'tarda'.padEnd(9), 'Núcleos'.padEnd(8), 'tope'.padEnd(5), 'total'.padEnd(6), 'compra');
let total = 0;
for (let run = 1; run <= runs; run++) {
  const target = G.getPrestigeTarget();
  const goal = Math.min(target + wait, G.minerals.length - 1);
  const seconds = playRun(goal);
  total += seconds;
  const cap = G.getCoreCap();
  const result = G.prestigeNow();
  if (!result) { console.log('No se pudo renacer (objetivo no alcanzado).'); break; }
  const bought = spendCores();
  console.log(
    String(run).padEnd(7),
    (G.minerals[target].icon + ' ' + G.mineralName(G.minerals[target])).padEnd(14),
    fmtTime(seconds).padEnd(9),
    ('+' + result.gain).padEnd(8),
    String(cap).padEnd(5),
    fmtTime(total).padEnd(6),
    bought.join(' '));
}
console.log(`\nNúcleos sin gastar: ${G.state.prestige.cores} | ganados: ${G.state.prestige.coresEarned} | multiplicador de prestigio ×${G.formatNumber(G.getPrestigeMultiplier())}`);

// Herramientas de balanceo (con el bot de siempre: pica `cps` veces por segundo y compra lo que antes se amortiza).
// Uso, desde la raíz del proyecto:
//
//   node tools/balance.js skills [--cps=2] [--goal=8]
//       Valor de cada nivel de habilidad: cuánto acorta una vuelta (hasta el mineral nº goal+1) con solo ese
//       nivel, y el ahorro por Núcleo gastado. Sirve para ver si alguna habilidad sobra o falta.
//
//   node tools/balance.js firstrun [--cps=2]
//       Cronología de la primera vuelta hasta el primer renacer: cuándo sale cada productor, mineral, mejora,
//       estrella y hito, y los huecos más largos sin ninguna novedad.
//
//   node tools/balance.js autominer [--cps=2] [--goal=8] [--rate=3]
//       Cuánto acorta una vuelta el Autominero (renaceres 10 frente a 9) con `rate` clics/s.
//
//   node tools/balance.js laterun --count=40 [--eternal=10 | --wait=3] [--cps=2]
//       Una sola vuelta de final de partida: con `count` renaceres y el árbol de habilidades casi completo (el Núcleo
//       eterno al nivel `eternal`) o el que tendría quien espera `wait` minerales de más en cada renacer, cuánto tarda
//       hasta el objetivo de renacer. Sirve para ver si el final sigue teniendo reto.
//
//   node tools/balance.js challenges [--cps=2]
//       Cuánto tarda el bot en completar cada reto (y si le da el tiempo): sirve para fijar objetivos y límites.
//
// Para probar un cambio del config sin tocarlo, añade --set:ruta=valor (valor en JSON), p. ej.
//   node tools/balance.js skills --set:click.base=2
// (el bucle de renaceres completo está en tools/sim-prestige.js).
'use strict';

const path = require('path');

const args = {};
const overrides = [];
let mode = null;
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--set:')) { const [p, ...rest] = a.slice(6).split('='); overrides.push([p, JSON.parse(rest.join('='))]); continue; }
  if (!a.startsWith('--')) { mode = a; continue; }
  const [key, value] = a.slice(2).split('=');
  args[key] = value === undefined ? true : Number(value);
}
if (!['skills', 'firstrun', 'autominer', 'challenges', 'laterun'].includes(mode)) {
  console.log('Uso: node tools/balance.js skills | firstrun | autominer | challenges | laterun  (ver la cabecera del archivo)');
  process.exit(1);
}

global.window = global;
const load = (f) => require(path.join(__dirname, '..', 'js', f));
load('config.js');
for (const [p, value] of overrides) {
  const keys = p.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], window.Game.config)[last] = value;
}
for (const f of ['lang/es.js', 'lang/en.js', 'i18n.js', 'format.js', 'state.js', 'upgrades.js', 'minerals.js', 'game.js', 'biomes.js', 'events.js', 'prestige.js', 'milestones.js', 'dex.js', 'catalog.js', 'challenges.js', 'ads.js', 'achievements.js']) load(f);
const G = window.Game;

const cps = args.cps !== undefined ? args.cps : 2;
const goal = args.goal !== undefined ? args.goal : 8;
if (args.rate !== undefined) G.config.prestige.autoMiner.clicksPerSecond = args.rate;

const income = () => G.getIncomePerSecond() + cps * G.getClickValue();
const advance = (seconds) => { const g = income() * seconds; G.state.currency += g; G.state.totalEarned += g; G.state.playTime += seconds; };

function options() {
  const s = G.state;
  const list = [];
  const reach = s.currency + 7200 * income(); // solo se miran las compras que se pagarían en un par de horas
  for (const p of G.config.producers) {
    if (G.getProducerVisibility(p.id) !== 'open' || G.getProducerCost(p.id) > reach) continue;
    list.push({ kind: 'prod', id: p.id, cost: G.getProducerCost(p.id), apply: () => { s.producers[p.id] += 1; }, undo: () => { s.producers[p.id] -= 1; } });
  }
  for (const u of G.upgrades) {
    if (u.cost > reach || !G.isUpgradeAvailable(u)) continue;
    list.push({ kind: 'up', id: u.id, cost: u.cost, apply: () => { s.upgrades[u.id] = true; }, undo: () => { delete s.upgrades[u.id]; } });
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

const fmt = (s) => (s < 90 ? s.toFixed(0) + 's' : s < 5400 ? (s / 60).toFixed(1) + 'min' : (s / 3600).toFixed(2) + 'h');

// Juega desde el estado actual hasta el mineral `target`; `onBuy(best, t)` se llama tras cada compra.
function play(target, onStep) {
  const s = G.state;
  let t = 0;
  let guard = 0;
  while (G.getMineralIndex() < target && guard++ < 400_000) {
    if (onStep) onStep(t);
    const best = pickBest();
    if (!best) break;
    const rate = income();
    const buyIn = Math.max(0, best.cost - s.currency) / rate;
    const stop = Math.min((G.minerals[target].unlockAt - s.totalEarned) / rate, (G.minerals[G.getMineralIndex() + 1].unlockAt - s.totalEarned) / rate);
    if (stop < buyIn) { const step = Math.max(stop, 0) + 1e-6; advance(step); t += step; continue; }
    advance(buyIn);
    t += buyIn;
    s.currency -= best.cost;
    best.apply();
    if (onStep) onStep(t, best);
  }
  if (onStep) onStep(t); // el último paso (p. ej. el mineral con el que termina)
  return t;
}

// ── skills ───────────────────────────────────────────────────
function runWith(setup) {
  G.state = G.createState();
  setup(G.state);
  const cash = G.getSkillValue('startCash', 0);
  G.state.currency += cash;
  G.state.totalEarned += cash;
  for (const sk of G.skills) {
    if (sk.type !== 'startProducers' || G.getSkillLevel(sk.id) < 1) continue;
    const crew = sk.levels[G.getSkillLevel(sk.id) - 1].value;
    for (const id of Object.keys(crew)) G.state.producers[id] = Math.max(G.state.producers[id], crew[id]);
  }
  return play(goal);
}

if (mode === 'skills') {
  const base = runWith(() => {});
  console.log(`Vuelta base (sin habilidades, ${cps} clics/s) hasta ${G.minerals[goal].icon} ${G.mineralName(G.minerals[goal])}: ${fmt(base)}\n`);
  console.log('habilidad'.padEnd(10), 'nivel'.padEnd(6), 'coste acum.'.padEnd(12), 'tarda'.padEnd(10), 'ahorro'.padEnd(8), 'ahorro por Núcleo');
  for (const sk of G.skills) {
    if (sk.type === 'offlineRate' || sk.type.startsWith('golden')) continue; // el bot no juega offline ni eventos
    let spent = 0;
    sk.levels.forEach((lv, i) => {
      spent += lv.cost;
      const t = runWith((s) => { s.prestige.skills[sk.id] = i + 1; s.prestige.count = 40; }); // 40 renaceres: así 'legacy' se nota
      const saved = (base - t) / base * 100;
      console.log(sk.id.padEnd(10), String(i + 1).padEnd(6), String(spent).padEnd(12), fmt(t).padEnd(10), (saved.toFixed(0) + '%').padEnd(8), (saved / spent).toFixed(1) + ' %/núcleo');
    });
  }
}

// ── firstrun ─────────────────────────────────────────────────
if (mode === 'firstrun') {
  G.state = G.createState();
  const target = G.minerals.findIndex((m) => m.id === G.config.prestige.firstMineral);
  const events = [];
  const seenProducers = new Set();
  const seenUpgrades = new Set();
  let lastMineral = 0;
  play(target, (t, bought) => {
    for (const u of G.upgrades) {
      if (!G.isUpgradeAvailable(u) || seenUpgrades.has(u.id)) continue;
      seenUpgrades.add(u.id);
      events.push([t, u.effect.type === 'producerMult' ? 'estrella' : 'mejora', G.upgradeName(u)]);
    }
    if (bought && bought.kind === 'prod' && !seenProducers.has(bought.id)) { seenProducers.add(bought.id); events.push([t, 'productor', G.producerName(bought.id)]); }
    if (G.getMineralIndex() !== lastMineral) { lastMineral = G.getMineralIndex(); events.push([t, 'MINERAL', G.mineralName(G.minerals[lastMineral])]); }
    for (const m of G.checkMilestones()) events.push([t, 'HITO', m.id]);
  });
  events.sort((a, b) => a[0] - b[0]);
  let prev = 0;
  for (const [time, kind, name] of events) {
    if (kind !== 'estrella') console.log(fmt(time).padStart(8), ('+' + fmt(time - prev)).padStart(9), kind.padEnd(10), name);
    prev = time;
  }
  const gaps = events.map((e, i) => [e[0] - (i ? events[i - 1][0] : 0), e]).sort((a, b) => b[0] - a[0]).slice(0, 5);
  console.log('\nHuecos más largos sin ninguna novedad (estrellas incluidas):', gaps.map(([g, e]) => fmt(g) + ' antes de ' + e[2]).join(' | '));
}

// ── autominer ────────────────────────────────────────────────
if (mode === 'autominer') {
  const run = (count) => {
    G.state = G.createState();
    G.state.prestige.count = count;
    G.state.prestige.skills.power = 2;
    G.state.currency = G.state.totalEarned = 2000;
    return play(goal);
  };
  const at = G.config.prestige.unlocks.find((u) => u.feature === 'autoMiner').at;
  const without = run(at - 1);
  const withMiner = run(at);
  console.log(`${cps} clics/s, Autominero a ${G.config.prestige.autoMiner.clicksPerSecond} clic/s: sin él ${fmt(without)} → con él ${fmt(withMiner)} (${((without - withMiner) / without * 100).toFixed(1)}% menos)`);
}

// ── challenges ───────────────────────────────────────────────
if (mode === 'challenges') {
  const results = [];
  for (const c of G.challenges) {
    G.state = G.createState();
    G.state.prestige.unlocked = true;
    G.startChallenge(c.id);
    const s = G.state;
    let t = 0;
    let guard = 0;
    while (!G.isChallengeGoalReached(c) && guard++ < 400_000) {
      if (c.limit && t >= c.limit) break;
      const best = pickBest();
      const rate = income();
      if (!(rate > 0)) break;
      const goalAt = c.earned !== undefined ? c.earned : G.minerals[c.goalIndex].unlockAt;
      const stop = Math.min((goalAt - s.totalEarned) / rate, (G.minerals[G.getMineralIndex() + 1].unlockAt - s.totalEarned) / rate);
      const buyIn = best ? Math.max(0, best.cost - s.currency) / rate : Infinity;
      if (stop < buyIn) { const step = Math.max(stop, 0) + 1e-6; advance(step); t += step; continue; }
      advance(buyIn);
      t += buyIn;
      s.currency -= best.cost;
      best.apply();
    }
    const won = G.isChallengeGoalReached(c) && (!c.limit || t <= c.limit);
    results.push([c.id, c.earned !== undefined ? G.formatNumber(c.earned) : G.mineralName(G.minerals[c.goalIndex]), won ? fmt(t) : (c.limit && t >= c.limit ? 'no llega a tiempo' : 'no llega'), c.limit ? 'límite ' + fmt(c.limit) : '']);
    G.abandonChallenge();
  }
  console.log(`Bot de ${cps} clics/s:`);
  for (const [id, goal, time, limit] of results) console.log('  ' + id.padEnd(10), ('→ ' + goal).padEnd(14), time.padEnd(20), limit);
}

// ── laterun ──────────────────────────────────────────────────
if (mode === 'laterun') {
  const count = args.count !== undefined ? args.count : 40;
  G.state = G.createState();
  const st = G.state;
  st.prestige.count = count;
  st.prestige.unlocked = true;
  if (args.wait !== undefined) {
    // Árbol "realista": los Núcleos que habría ganado un jugador que espera `wait` minerales de más en cada renacer,
    // gastados siempre en el siguiente nivel más barato que se pueda comprar.
    let cores = 0;
    for (let n = 1; n <= count; n++) {
      const tier = G.getCoreTier(n);
      cores += Math.min(1 + Math.floor(args.wait / (tier.mineralsPerCore || G.config.prestige.mineralsPerCore)), tier.max);
    }
    st.prestige.cores = cores;
    for (;;) {
      let pick = null;
      for (const sk of G.skills) if (G.canBuySkill(sk.id) && (!pick || G.getSkillCost(sk.id) < G.getSkillCost(pick.id))) pick = sk;
      if (!pick) break;
      G.buySkill(pick.id);
    }
    console.log(`  (con ${cores} Núcleos ganados: ${G.skills.filter((k) => G.getSkillLevel(k.id)).map((k) => k.id + G.getSkillLevel(k.id)).join(' ')}; sin gastar ${st.prestige.cores})`);
  } else {
    // El árbol "casi completo": los niveles máximos de todo salvo el Núcleo eterno (y lo que aún no se ha abierto).
    for (const sk of G.skills) {
      if (sk.id === 'eternal') st.prestige.skills.eternal = Math.min(args.eternal || 0, sk.levels.length);
      else if (G.isSkillUnlocked(sk.id)) st.prestige.skills[sk.id] = sk.levels.length;
    }
  }
  const cash = G.getSkillValue('startCash', 0);
  st.currency += cash; st.totalEarned += cash;
  for (const sk of G.skills) {
    if (sk.type !== 'startProducers' || G.getSkillLevel(sk.id) < 1) continue;
    const crew = sk.levels[G.getSkillLevel(sk.id) - 1].value;
    for (const id of Object.keys(crew)) st.producers[id] = Math.max(st.producers[id], crew[id]);
  }
  const target = G.getPrestigeTarget();
  const t = play(target);
  console.log(`${count} renaceres (Núcleo eterno nivel ${st.prestige.skills.eternal || 0}), ${cps} clics/s: objetivo ${G.minerals[target].icon} ${G.mineralName(G.minerals[target])} en ${fmt(t)}`);
}

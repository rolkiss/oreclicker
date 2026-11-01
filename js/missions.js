// Misiones: las de inicio (un recorrido guiado de 4 pasos para el primer rato) y los objetivos diarios con
// regalo de entrada y racha. Solo lógica, sin DOM; el panel está en missions-panel.js. Números en config.missions.
(function (Game) {
  const { config } = Game;
  const cfg = config.missions;
  const daily = cfg.daily;

  const mineralIndex = {};
  config.minerals.forEach((m, i) => { mineralIndex[m.id] = i; });

  const missions = () => Game.state.missions;

  // Cuánto ha avanzado cada contador de toda la vida de la partida (los objetivos diarios miden la diferencia
  // con lo que había al empezar el día).
  const counters = {
    clicks: () => Game.state.totalClicks,
    play: () => Game.state.playTime,
    bought: () => Game.state.stats.bought,
    crit: () => Game.state.stats.crits,
    golden: () => Game.state.stats.goldens,
    prestige: () => Game.state.prestige.count,
  };

  const poolById = {};
  for (const g of daily.pool) poolById[g.id] = g;
  Game.dailyPool = daily.pool;
  Game.dailyGoalDef = (id) => poolById[id] || null;

  // Lo que se da en minerales es proporcional a tu ritmo actual (sin contar el frenesí) y nunca menos
  // que unos cuantos clics, para que siga valiendo la pena al principio y más adelante.
  Game.getRewardAmount = function (seconds, minClicks) {
    const pps = Game.getPps() / Game.getBoostMultiplier();
    return Math.max(pps * seconds, Game.getClickValue() * minClicks);
  };

  // ── Misiones de inicio ────────────────────────────────────
  Game.introMissions = cfg.intro;
  Game.isIntroDone = () => missions().intro >= cfg.intro.length;
  Game.getIntroMission = () => (Game.isIntroDone() ? null : cfg.intro[missions().intro]);

  // { have, need, fraction } de una misión de inicio.
  Game.getIntroProgress = function (mission) {
    const s = Game.state;
    let have;
    let need;
    if (mission.clicks !== undefined) { have = s.totalClicks; need = mission.clicks; }
    else if (mission.producer !== undefined) { have = s.producers[mission.producer]; need = mission.count; }
    else if (mission.upgrades !== undefined) { have = Object.keys(s.upgrades).length; need = mission.upgrades; }
    else { have = s.totalEarned; need = Game.minerals[mineralIndex[mission.mineral]].unlockAt; } // mineral: llegar a su umbral
    have = Math.min(have, need);
    return { have, need, fraction: need > 0 ? have / need : 1 };
  };

  // Cumple las misiones de inicio que ya estén hechas (puede ser más de una de golpe), da su recompensa y
  // devuelve las completadas para avisar.
  Game.checkIntro = function () {
    const done = [];
    for (let mission = Game.getIntroMission(); mission; mission = Game.getIntroMission()) {
      if (Game.getIntroProgress(mission).fraction < 1) break;
      missions().intro += 1;
      Game.earn(mission.cash);
      done.push(mission);
    }
    return done;
  };

  // ── Días ──────────────────────────────────────────────────
  // El día es la fecha local del dispositivo (Game.obtenerHora, ver offline.js).
  const pad = (n) => String(n).padStart(2, '0');
  Game.dayKey = function (ms = Game.obtenerHora()) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  const dayNumber = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
  };

  // Generador con semilla (mulberry32) a partir de un texto: los mismos objetivos para el mismo día.
  function seededRandom(text) {
    let h = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const isAvailable = (g) => !g.requires || Game.hasFeature(g.requires);

  // Elige los objetivos del día: `count` contadores distintos (al azar con semilla entre los disponibles) y,
  // de cada uno, una de sus variantes. Devuelve [{ id, base, claimed }].
  Game.pickDailyGoals = function (key) {
    const random = seededRandom(key);
    const kinds = [];
    for (const g of daily.pool) if (isAvailable(g) && !kinds.includes(g.counter)) kinds.push(g.counter);
    for (let i = kinds.length - 1; i > 0; i--) { // Fisher-Yates
      const j = Math.floor(random() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    return kinds.slice(0, daily.count).map((kind) => {
      const options = daily.pool.filter((g) => g.counter === kind && isAvailable(g));
      const pick = options[Math.floor(random() * options.length)];
      return { id: pick.id, base: counters[kind](), claimed: false };
    });
  };

  // Empieza el día si cambió la fecha: racha, regalo de entrada y objetivos nuevos. Devuelve true si empezó
  // uno. Una fecha anterior a la última guardada (reloj atrasado) no cuenta, para no repetir regalos.
  Game.checkDay = function () {
    const m = missions();
    const key = Game.dayKey();
    if (key === m.day) return false;
    if (m.day && dayNumber(key) < dayNumber(m.day)) return false;
    m.streak = m.day && dayNumber(key) - dayNumber(m.day) === 1 ? m.streak + 1 : 1;
    m.day = key;
    m.giftClaimed = false;
    m.allClaimed = false;
    m.goals = Game.pickDailyGoals(key);
    return true;
  };

  // ── Objetivos diarios ─────────────────────────────────────
  Game.getGoalProgress = function (goal) {
    const def = poolById[goal.id];
    const have = Math.min(Math.max(counters[def.counter]() - goal.base, 0), def.target);
    return { have, need: def.target, fraction: have / def.target, done: have >= def.target, def };
  };

  Game.canClaimGoal = function (index) {
    const goal = missions().goals[index];
    return !!goal && !goal.claimed && Game.getGoalProgress(goal).done;
  };

  // Reclama un objetivo cumplido. Con el último reclamado llega el bonus por completar todos.
  // Devuelve { amount, bonus } (bonus 0 si no tocaba) o null si no se puede.
  Game.claimGoal = function (index) {
    if (!Game.canClaimGoal(index)) return null;
    const m = missions();
    const def = poolById[m.goals[index].id];
    const amount = Game.getRewardAmount(def.seconds, def.minClicks);
    m.goals[index].claimed = true;
    // Se calcula todo antes de cobrar: cobrar puede subir de mineral y cambiar la producción.
    let bonus = 0;
    if (!m.allClaimed && m.goals.every((g) => g.claimed)) {
      m.allClaimed = true;
      bonus = Game.getRewardAmount(daily.allBonus.seconds, daily.allBonus.minClicks);
    }
    Game.earn(amount + bonus);
    return { amount, bonus };
  };

  // Regalo por entrar hoy: crece con la racha hasta `maxStreak` días.
  Game.getGiftMultiplier = () => Math.min(Math.max(missions().streak, 1), daily.gift.maxStreak);
  Game.getGiftAmount = function () {
    const days = Game.getGiftMultiplier();
    return Game.getRewardAmount(daily.gift.seconds * days, daily.gift.minClicks * days);
  };
  Game.canClaimGift = () => !!missions().day && !missions().giftClaimed;
  // `multiplier` 2 = el regalo duplicado tras ver un anuncio.
  Game.claimGift = function (multiplier = 1) {
    if (!Game.canClaimGift()) return null;
    const amount = Game.getGiftAmount() * multiplier;
    missions().giftClaimed = true;
    Game.earn(amount);
    return { amount };
  };

  // Cuántas cosas esperan para reclamar (regalo y objetivos cumplidos): es el numerito del botón.
  Game.countClaimable = function () {
    const m = missions();
    let n = Game.canClaimGift() ? 1 : 0;
    m.goals.forEach((g, i) => { if (Game.canClaimGoal(i)) n++; });
    return n;
  };
})(window.Game);

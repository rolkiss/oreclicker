// Prestigio (renacer): Núcleos, habilidades permanentes y desbloqueos por número de renaceres.
// Solo lógica, sin DOM; el panel está en prestige-panel.js. Los números viven en config.prestige.
(function (Game) {
  const { config } = Game;
  const cfg = config.prestige;

  const mineralIndex = {};
  config.minerals.forEach((m, i) => { mineralIndex[m.id] = i; });
  const firstIndex = mineralIndex[cfg.firstMineral];

  const skillById = {};
  for (const s of cfg.skills) skillById[s.id] = s;
  Game.skills = cfg.skills;
  Game.skillById = skillById;

  const prestige = () => Game.state.prestige;

  // ── Desbloqueos por número de renaceres ───────────────────
  // Una habilidad con entrada en `unlocks` no se puede comprar hasta tener esos renaceres.
  const skillUnlockAt = {};
  for (const u of cfg.unlocks) if (u.skill) skillUnlockAt[u.skill] = u.at;

  Game.getSkillUnlockAt = (id) => skillUnlockAt[id] || 0;
  Game.isSkillUnlocked = (id) => prestige().count >= (skillUnlockAt[id] || 0);
  Game.hasPrestigeFeature = (id) => !Game.isClean() && cfg.unlocks.some((u) => u.feature === id && prestige().count >= u.at);

  // ── Habilidades ───────────────────────────────────────────
  Game.getSkillLevel = (id) => prestige().skills[id] || 0;

  // Valor combinado de todas las habilidades de un tipo. `neutral` 1 → se multiplican (globalMult,
  // clickMult, costMult); `neutral` 0 → se suman (offlineRate, prestigeMult, startCash).
  Game.getSkillValue = function (type, neutral) {
    let total = neutral;
    if (Game.isClean()) return total; // en un reto no cuentan las habilidades
    for (const s of cfg.skills) {
      if (s.type !== type) continue;
      const level = Game.getSkillLevel(s.id);
      if (level < 1) continue;
      const value = s.levels[level - 1].value;
      total = neutral === 1 ? total * value : total + value;
    }
    return total;
  };

  // Coste del siguiente nivel, o null si ya está al máximo.
  Game.getSkillCost = function (id) {
    const s = skillById[id];
    const next = s.levels[Game.getSkillLevel(id)];
    return next ? next.cost : null;
  };

  Game.canBuySkill = function (id) {
    const cost = Game.getSkillCost(id);
    return cost !== null && Game.isSkillUnlocked(id) && prestige().cores >= cost;
  };

  Game.buySkill = function (id) {
    if (!skillById[id] || !Game.canBuySkill(id)) return false;
    prestige().cores -= Game.getSkillCost(id);
    prestige().skills[id] = Game.getSkillLevel(id) + 1;
    return true;
  };

  // ── Efectos que usa el resto del juego ────────────────────
  // ×N a clic y producción: habilidades globales × bonus por cada renacer hecho.
  Game.getPrestigeMultiplier = function () {
    return Game.getSkillValue('globalMult', 1)
      * (1 + Game.getSkillValue('prestigeMult', 0) * prestige().count);
  };

  Game.getOfflineRate = () => config.offline.rate + Game.getSkillValue('offlineRate', 0) + Game.getChallengeValue('offlineRate', 0);

  // El Autominero (a los 10 renaceres) pica solo; sus ganancias entran con la producción pasiva.
  Game.getAutoMinerIncome = function () {
    return Game.hasFeature('autoMiner') ? Game.getClickValue() * cfg.autoMiner.clicksPerSecond : 0;
  };
  Game.getIncomePerSecond = () => Game.getPps() + Game.getAutoMinerIncome();

  // ── Condición y recompensa de renacer ─────────────────────
  // Mineral que hay que alcanzar en esta vuelta: sube con cada renacer.
  // El último mineral al que se puede llegar ahora (los del tramo final solo cuentan con los renaceres necesarios).
  const lastAvailable = () => Game.getLastAvailableMineral();

  // Se queda `targetHeadroom` minerales por debajo del último, para que siempre quepa ir más lejos y ganar más Núcleos.
  Game.getPrestigeTarget = function () {
    const extra = Math.floor(prestige().count * cfg.mineralsPerPrestige + 1e-9);
    return Math.min(firstIndex + extra, lastAvailable() - (cfg.targetHeadroom || 0));
  };

  Game.canPrestige = () => !Game.isClean() && Game.getMineralIndex() >= Game.getPrestigeTarget();

  // Tramo de Núcleos del renacer nº `number` (por defecto, el próximo): su tope y cada cuántos minerales de
  // más se gana un Núcleo (`mineralsPerCore` del tramo, o el general si no lo trae).
  Game.getCoreTier = function (number = prestige().count + 1) {
    let tier = cfg.coreCaps[0];
    for (const t of cfg.coreCaps) if (number >= t.from) tier = t;
    return tier;
  };
  const perCore = (tier) => tier.mineralsPerCore || cfg.mineralsPerCore;

  // Tope de Núcleos del renacer nº `number` (por defecto, el próximo).
  Game.getCoreCap = (number) => Game.getCoreTier(number).max;

  // Núcleos que daría renacer ahora: 1 por llegar y 1 más por cada `mineralsPerCore` minerales de más.
  Game.getPrestigeGain = function () {
    const over = Game.getMineralIndex() - Game.getPrestigeTarget();
    if (over < 0) return 0;
    const tier = Game.getCoreTier();
    return Math.min(1 + Math.floor(over / perCore(tier)), tier.max);
  };

  // Mineral en el que llegaría el siguiente Núcleo, o null si ya se está en el tope.
  Game.getNextCoreMineral = function () {
    const tier = Game.getCoreTier();
    const gain = Math.max(Game.getPrestigeGain(), 1);
    if (gain >= tier.max) return null;
    const index = Game.getPrestigeTarget() + Math.ceil(gain * perCore(tier));
    return index > lastAvailable() ? null : index;
  };

  // ── Avance de la vuelta ───────────────────────────────────
  Game.tickPrestige = function (seconds) {
    if (Game.isClean()) return; // la vuelta de verdad está guardada: no avanza durante un reto
    const p = prestige();
    p.runTime += seconds;
    if (Game.canPrestige()) {
      p.unlocked = true;
      if (p.readyTime < 0) p.readyTime = p.runTime;
    }
  };

  // Moneda y productores con los que empieza cada vuelta (habilidades 'startCash' y 'startProducers').
  function applyStart(state) {
    const cash = Game.getSkillValue('startCash', 0);
    state.currency += cash;
    state.totalEarned += cash; // el total nunca baja de la moneda (ver save.js)
    for (const s of cfg.skills) {
      if (s.type !== 'startProducers' || Game.getSkillLevel(s.id) < 1) continue;
      const crew = s.levels[Game.getSkillLevel(s.id) - 1].value;
      for (const id of Object.keys(crew)) state.producers[id] = Math.max(state.producers[id], crew[id]);
    }
  }

  // Compara el resumen de una vuelta con el de la anterior: { first } si no hay anterior; si no, el cambio relativo de
  // cada cifra (0.5 = +50%, null si no se puede comparar), si llegaron al mismo mineral, cuántos más lejos y, con el mismo
  // objetivo, cuánto más rápida fue hasta poder renacer (fracción: 0.4 = 40% menos de tiempo).
  Game.getRunComparison = function (summary, previous) {
    if (!previous) return { first: true };
    const change = (a, b) => (b > 0 ? a / b - 1 : null);
    const changes = {};
    for (const key of ['time', 'earned', 'pps', 'clicks', 'bought', 'crits', 'goldens']) changes[key] = change(summary[key], previous[key]);
    changes.ready = summary.ready >= 0 && previous.ready >= 0 ? change(summary.ready, previous.ready) : null;
    const sameMineral = summary.mineral === previous.mineral;
    return {
      first: false,
      changes,
      sameMineral,
      deeper: summary.mineral - previous.mineral,
      faster: sameMineral && changes.ready !== null && changes.ready < 0 ? -changes.ready : null,
    };
  };

  // Renace: devuelve { gain, mineral, summary, previous } (el resumen de la vuelta que acaba y el de la anterior, para
  // enseñarlos), o null si todavía no se puede.
  Game.prestigeNow = function () {
    if (!Game.canPrestige()) return null;
    const old = Game.state;
    const p = old.prestige;
    const gain = Game.getPrestigeGain();
    const mineral = Game.getMineralIndex();
    const summary = {
      count: p.count + 1,
      gain,
      mineral,
      time: p.runTime,
      ready: p.readyTime,
      earned: old.totalEarned,
      pps: Game.getPps() / Game.getBoostMultiplier(),
      clicks: old.totalClicks - p.runStart.clicks,
      bought: old.stats.bought - p.runStart.bought,
      crits: old.stats.crits - p.runStart.crits,
      goldens: old.stats.goldens - p.runStart.goldens,
    };

    const next = Game.createState();
    next.settings = old.settings;
    next.achievements = old.achievements;
    next.totalClicks = old.totalClicks;
    next.playTime = old.playTime;
    next.offlineReturns = old.offlineReturns;
    next.milestones = old.milestones;
    next.stats = old.stats;
    next.dex = old.dex;
    next.catalog = old.catalog;
    next.challenges = old.challenges;
    next.missions = old.missions;
    next.prestige = {
      ...p,
      count: p.count + 1,
      cores: p.cores + gain,
      coresEarned: p.coresEarned + gain,
      unlocked: true,
      runTime: 0,
      readyTime: -1,
      lastRunTime: p.readyTime,
      lastRunMineral: mineral,
      runStart: { clicks: old.totalClicks, bought: old.stats.bought, crits: old.stats.crits, goldens: old.stats.goldens },
      last: summary,
    };
    Game.state = next;
    applyStart(next);
    return { gain, mineral, summary, previous: p.last };
  };
})(window.Game);

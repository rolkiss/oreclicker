// Retos especiales: vueltas con reglas distintas ("llega a Arena solo a clic", "sin mejoras"…) que dan una
// mejora permanente al completarlas. Al empezar uno, la vuelta actual se guarda aparte y se juega una nueva
// "limpia" (sin habilidades, bonus de álbumes, logros ni eventos); al ganar, fallar o abandonar, se recupera
// la vuelta guardada tal cual. Solo lógica, sin DOM; el panel está en challenges-panel.js.
(function (Game) {
  const { config } = Game;

  const mineralIndex = {};
  config.minerals.forEach((m, i) => { mineralIndex[m.id] = i; });

  Game.challenges = config.challenges.map((c) => ({ ...c, goalIndex: c.goal !== undefined ? mineralIndex[c.goal] : -1 }));
  const byId = {};
  for (const c of Game.challenges) byId[c.id] = c;
  Game.challengeById = byId;

  const NO_RULES = Object.freeze({});
  const challenges = () => Game.state.challenges;

  // ── Estado ────────────────────────────────────────────────
  Game.getActiveChallenge = () => {
    const active = challenges().active;
    return active ? byId[active.id] : null;
  };
  // Dentro de un reto no cuenta nada permanente: ni habilidades, ni álbumes, ni logros, ni recompensas de otros retos.
  Game.isClean = () => !!challenges().active;
  Game.getChallengeRules = () => {
    const c = Game.getActiveChallenge();
    return c ? c.rules : NO_RULES;
  };
  // Los retos se abren con el primer renacer posible (es contenido de la fase de renacer).
  Game.isChallengesUnlocked = () => Game.state.prestige.unlocked || Game.state.prestige.count > 0;
  Game.isChallengeDone = (id) => challenges().done[id] !== undefined;
  Game.getChallengeBest = (id) => challenges().done[id];

  // ¿Se ha cumplido el objetivo? Llegar a un mineral (`goal`) o ganar una cantidad (`earned`) en la vuelta del reto.
  Game.isChallengeGoalReached = function (c = Game.getActiveChallenge()) {
    if (!c) return false;
    return c.earned !== undefined ? Game.state.totalEarned >= c.earned : Game.getMineralIndex() >= c.goalIndex;
  };

  // Segundos jugados y, si tiene límite de tiempo, los que quedan (null = sin límite).
  Game.getChallengeProgress = function () {
    const active = challenges().active;
    const c = Game.getActiveChallenge();
    if (!c) return null;
    return { elapsed: active.elapsed, remaining: c.limit ? Math.max(0, c.limit - active.elapsed) : null };
  };

  // ── Recompensas ───────────────────────────────────────────
  // Valor combinado de las recompensas de los retos completados de un tipo. `neutral` 1 → se multiplican
  // (globalMult, clickMult, costMult, goldenRate); `neutral` 0 → se suman (offlineRate). En un reto no cuentan.
  Game.getChallengeValue = function (type, neutral) {
    if (Game.isClean()) return neutral;
    let total = neutral;
    for (const c of Game.challenges) {
      if (c.reward.type !== type || !Game.isChallengeDone(c.id)) continue;
      total = neutral === 1 ? total * c.reward.value : total + c.reward.value;
    }
    return total;
  };

  // ── Empezar, terminar y abandonar ─────────────────────────
  Game.challengeEvents = []; // { type: 'won' | 'failed' | 'abandoned', id, seconds, best } para que la UI avise

  Game.startChallenge = function (id) {
    const c = byId[id];
    const s = Game.state;
    if (!c || challenges().active || !Game.isChallengesUnlocked()) return false;
    challenges().active = {
      id,
      elapsed: 0,
      snapshot: { currency: s.currency, totalEarned: s.totalEarned, producers: { ...s.producers }, upgrades: { ...s.upgrades } },
    };
    s.currency = 0;
    s.totalEarned = 0;
    for (const key of Object.keys(s.producers)) s.producers[key] = 0;
    s.upgrades = {};
    Game.resetEvents();
    return true;
  };

  // Recupera la vuelta guardada y cierra el reto.
  function finish(type) {
    const s = Game.state;
    const active = challenges().active;
    const seconds = active.elapsed;
    const snap = active.snapshot;
    s.currency = snap.currency;
    s.totalEarned = snap.totalEarned;
    s.producers = snap.producers;
    s.upgrades = snap.upgrades;
    challenges().active = null;
    Game.resetEvents();
    const best = challenges().done[active.id];
    if (type === 'won' && (best === undefined || seconds < best)) challenges().done[active.id] = seconds;
    const event = { type, id: active.id, seconds, best: challenges().done[active.id], first: type === 'won' && best === undefined };
    Game.challengeEvents.push(event);
    return event;
  }

  Game.abandonChallenge = () => (challenges().active ? finish('abandoned') : null);

  // Avanza el reto: gana al llegar al mineral objetivo y pierde al agotar el tiempo.
  Game.tickChallenge = function (seconds) {
    const active = challenges().active;
    if (!active) return;
    active.elapsed += seconds;
    const c = byId[active.id];
    if (Game.isChallengeGoalReached(c)) finish('won');
    else if (c.limit && active.elapsed >= c.limit) finish('failed');
  };

  Game.takeChallengeEvents = function () {
    return Game.challengeEvents.splice(0);
  };
})(window.Game);

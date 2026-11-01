// Eventos: frenesí temporal y mineral dorado. Solo lógica, sin DOM (la parte visual
// está en events-ui.js). Todo es temporal: vive en `Game.live` y no se guarda, así que al recargar o
// importar una partida empieza limpio. Los números están en config.events.
(function (Game) {
  const { config } = Game;
  const cfg = config.events;

  const makeLive = () => ({
    boostTime: 0,    // segundos que le quedan al frenesí
    boostMult: 1,    // ×N que da mientras dura
    golden: null,    // { id, left } si hay un mineral dorado a la vista
    goldenTimer: cfg.golden.firstDelay, // segundos hasta el próximo
    goldenCount: 0,  // los que han salido (para darles un id)
  });

  Game.live = makeLive();
  Game.resetEvents = function () { Game.live = makeLive(); };

  // ── Frenesí ───────────────────────────────────────────────
  // Multiplica clic y producción (entra en getGlobalMultiplier).
  Game.getBoostMultiplier = () => (Game.live.boostTime > 0 ? Game.live.boostMult : 1);

  // ── Mineral dorado ────────────────────────────────────────
  function scheduleGolden() {
    const { minInterval, maxInterval } = cfg.golden;
    Game.live.goldenTimer = (minInterval + Math.random() * (maxInterval - minInterval)) * Game.getSkillValue('goldenRate', 1) * Game.getChallengeValue('goldenRate', 1);
  }

  // Recompensa al azar según los pesos; `random` se puede inyectar en pruebas.
  function pickReward(random) {
    const rewards = cfg.golden.rewards;
    let roll = random() * rewards.reduce((sum, r) => sum + r.weight, 0);
    for (const r of rewards) {
      roll -= r.weight;
      if (roll < 0) return r;
    }
    return rewards[rewards.length - 1];
  }

  // El jugador toca el mineral dorado: aplica la recompensa y devuelve { kind, ... } para la UI,
  // o null si no había ninguno a la vista.
  Game.collectGolden = function (random = Math.random) {
    const live = Game.live;
    if (!live.golden) return null;
    const reward = pickReward(random);
    const power = Game.getSkillValue('goldenPower', 1);
    live.golden = null;
    scheduleGolden();
    Game.state.stats.goldens += 1;

    if (reward.id === 'frenzy') {
      const seconds = reward.seconds * power;
      live.boostMult = Math.max(reward.mult, Game.getBoostMultiplier());
      live.boostTime = Math.max(seconds, live.boostTime);
      return { kind: 'frenzy', mult: live.boostMult, seconds };
    }
    const amount = Math.max(Game.getPps() * reward.seconds, Game.getClickValue() * reward.minClicks) * power;
    Game.earn(amount);
    return { kind: 'lump', amount };
  };

  // ── Avance ────────────────────────────────────────────────
  Game.tickEvents = function (seconds) {
    const dt = Math.min(seconds, cfg.maxTickSeconds);
    const live = Game.live;

    if (live.boostTime > 0) {
      live.boostTime = Math.max(0, live.boostTime - dt);
      if (live.boostTime === 0) live.boostMult = 1;
    }

    if (Game.isClean() || !Game.hasFeature('golden')) return; // sin mineral dorado en los retos
    if (live.golden) {
      live.golden.left -= dt;
      if (live.golden.left <= 0) { // se fue sin tocarlo
        live.golden = null;
        scheduleGolden();
      }
    } else {
      live.goldenTimer -= dt;
      if (live.goldenTimer <= 0) live.golden = { id: ++live.goldenCount, left: cfg.golden.lifetime };
    }
  };
})(window.Game);

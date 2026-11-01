// Lógica del juego: cálculos derivados y acciones. No toca el DOM.
(function (Game) {
  const { config } = Game;

  const producerById = {};
  const producerIndex = {};
  config.producers.forEach((p, i) => {
    producerById[p.id] = p;
    producerIndex[p.id] = i;
  });

  // En un reto con `costGrowth` todos los productores encarecen a ese ritmo.
  const growthOf = (p) => Game.getChallengeRules().costGrowth || p.costGrowth || config.defaultCostGrowth;

  Game.producerName = (id) => Game.tr('producer.' + id);
  const hasUpgrade = (u) => !!Game.state.upgrades[u.id];

  function sumOwned(list) {
    let total = 0;
    for (const u of list) if (hasUpgrade(u)) total += u.effect.value;
    return total;
  }

  function productOwned(list) {
    let total = 1;
    for (const u of list) if (hasUpgrade(u)) total *= u.effect.value;
    return total;
  }

  // Todo lo que se gana (clic, producción, offline) pasa por aquí: suma a la moneda y al total.
  function earn(amount) {
    Game.state.currency += amount;
    Game.state.totalEarned += amount;
    Game.state.stats.lifetime += amount; // el total histórico no se reinicia al renacer
  }
  Game.earn = earn;

  // ── Partida ───────────────────────────────────────────────
  // Empieza de cero conservando los ajustes (formato de números, cantidad de compra).
  Game.resetGame = function () {
    const settings = Game.state.settings;
    Game.state = Game.createState();
    Game.state.settings = settings;
  };

  // ── Minerales ─────────────────────────────────────────────
  // El mineral actual sale de lo ganado en total (que nunca baja), así que nunca retrocede.
  // Los minerales del tramo final solo se abren al hacer `unlockPrestiges` renaceres.
  Game.isMineralAvailable = function (i) {
    const need = Game.minerals[i].unlockPrestiges;
    return !need || Game.state.prestige.count >= need;
  };

  // El último mineral al que se puede llegar con los renaceres de ahora (se recuerda por nº de renaceres).
  let lastAvailableCache = { count: -1, value: 0 };
  Game.getLastAvailableMineral = function () {
    const count = Game.state.prestige.count;
    if (lastAvailableCache.count !== count) {
      let last = 0;
      for (let i = 1; i < Game.minerals.length && Game.isMineralAvailable(i); i++) last = i;
      lastAvailableCache = { count, value: last };
    }
    return lastAvailableCache.value;
  };

  // El mineral actual sale de lo ganado en total (que nunca baja), así que nunca retrocede. Los umbrales van en
  // orden creciente, así que se busca por mitades.
  Game.getMineralIndex = function () {
    const earned = Game.state.totalEarned;
    const minerals = Game.minerals;
    let lo = 0;
    let hi = Game.getLastAvailableMineral();
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (minerals[mid].unlockAt <= earned) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  // Progreso hacia el siguiente mineral (0..1) en escala logarítmica, porque los umbrales
  // crecen por factores: así la barra avanza a un ritmo parecido en todos los tramos.
  Game.getMineralProgress = function () {
    const index = Game.getMineralIndex();
    const next = Game.minerals[index + 1];
    if (!next) return { index, next: null, fraction: 1 };
    if (!Game.isMineralAvailable(index + 1)) return { index, next: null, locked: next, fraction: 1 }; // aún cerrado por renaceres
    const from = Math.max(Game.minerals[index].unlockAt, 1);
    const earned = Math.max(Game.state.totalEarned, 1);
    const fraction = Math.log(earned / from) / Math.log(next.unlockAt / from);
    return { index, next, fraction: Math.min(Math.max(fraction, 0), 1) };
  };

  // ── Producción ────────────────────────────────────────────
  // Multiplicador de todo lo que se gana: mejoras globales × valor del mineral actual × bonus de logros.
  Game.getGlobalMultiplier = function () {
    return productOwned(Game.upgradesByType.globalMult)
      * Game.minerals[Game.getMineralIndex()].value
      * Game.getAchievementMultiplier()
      * Game.getChallengeValue('globalMult', 1)
      * Game.getPrestigeMultiplier()
      * Game.getDexMultiplier()
      * Game.getCatalogMultiplier()
      * Game.getBoostMultiplier();
  };

  // Los factores de getGlobalMultiplier por separado (para el informe de producción).
  Game.getMultiplierParts = function () {
    return {
      upgrades: productOwned(Game.upgradesByType.globalMult),
      mineral: Game.minerals[Game.getMineralIndex()].value,
      achievements: Game.getAchievementMultiplier(),
      challenge: Game.getChallengeValue('globalMult', 1),
      prestige: Game.getPrestigeMultiplier(),
      dex: Game.getDexMultiplier(),
      catalog: Game.getCatalogMultiplier(),
      boost: Game.getBoostMultiplier(),
    };
  };

  // Lo que suman las sinergias compradas a un productor: cada una da (1 + valor × unidades del que ayuda).
  Game.getSynergyMultiplier = function (id) {
    let total = 1;
    for (const u of Game.synergyUpgrades[id]) {
      if (hasUpgrade(u)) total *= 1 + u.effect.value * Game.getSkillValue('synergyMult', 1) * Game.state.producers[u.effect.source];
    }
    return total;
  };

  // Producción por segundo de UNA unidad del productor, con sus mejoras, sinergias y las globales.
  Game.getProducerUnitOutput = function (id) {
    return producerById[id].baseProduction
      * productOwned(Game.producerUpgrades[id])
      * Game.getSynergyMultiplier(id)
      * Game.getGlobalMultiplier();
  };

  // Producción por segundo de un tipo de productor (todas sus unidades).
  Game.getProducerOutput = function (id) {
    return Game.state.producers[id] * Game.getProducerUnitOutput(id);
  };

  // Producción total por segundo (PPS).
  Game.getPps = function () {
    let total = 0;
    for (const p of config.producers) total += Game.getProducerOutput(p.id);
    return total;
  };

  // Avanza la producción pasiva `seconds` segundos.
  Game.tick = function (seconds) {
    earn(Game.getIncomePerSecond() * seconds);
    Game.state.playTime += seconds;
    Game.tickPrestige(seconds);
    Game.tickChallenge(seconds);
    Game.tickEvents(seconds);
  };

  // ── Clic ──────────────────────────────────────────────────
  // [(base + Σ clickAdd) × Π clickMult × Π globalMult + PPS × Σ clickPps] × habilidad 'clickMult'
  // La PPS ya lleva las mejoras globales, por eso el término del medio no se multiplica otra vez. La habilidad
  // de renacer multiplica el clic entero (también la parte que sale de la producción): si no, apenas se notaba.
  Game.getClickValue = function () {
    const by = Game.upgradesByType;
    const direct = (config.click.base + sumOwned(by.clickAdd))
      * productOwned(by.clickMult)
      * Game.getGlobalMultiplier();
    const fraction = sumOwned(by.clickPps);
    return (fraction > 0 ? direct + Game.getPps() * fraction : direct)
      * Game.getSkillValue('clickMult', 1) * Game.getChallengeValue('clickMult', 1);
  };

  // Un clic/toque en la roca. Devuelve { gain, crit } para que la UI lo muestre. Con el hito 'crit'
  // abierto, cada clic tiene una probabilidad de golpe crítico (`random` se puede inyectar en pruebas).
  Game.mine = function (random = Math.random) {
    let gain = Game.getClickValue();
    const crit = Game.hasFeature('crit') && !Game.isClean() && random() < config.crit.chance + Game.getSkillValue('critChance', 0);
    if (crit) {
      gain *= config.crit.mult;
      Game.state.stats.crits += 1;
    }
    earn(gain);
    Game.state.totalClicks += 1;
    return { gain, crit };
  };

  // ── Productores: costes y compra ──────────────────────────
  // Coste de comprar `amount` unidades de golpe, teniendo `owned` ya.
  // Una unidad cuesta baseCost × g^n; varias, la suma geométrica de esas.
  // Se redondea hacia arriba para que los costes sean siempre enteros.
  Game.getProducerCost = function (id, amount = 1, owned = Game.state.producers[id]) {
    const p = producerById[id];
    const g = growthOf(p);
    const first = p.baseCost * Game.getSkillValue('costMult', 1) * Game.getChallengeValue('costMult', 1) * Math.pow(g, owned);
    if (amount === 1) return Math.ceil(first);
    return Math.ceil(first * (Math.pow(g, amount) - 1) / (g - 1));
  };

  // Máximo de unidades que se pueden pagar con `budget` (despeja k de la suma geométrica).
  Game.getMaxAffordable = function (id, budget = Game.state.currency) {
    const p = producerById[id];
    const g = growthOf(p);
    const first = p.baseCost * Game.getSkillValue('costMult', 1) * Game.getChallengeValue('costMult', 1) * Math.pow(g, Game.state.producers[id]);
    if (!(budget >= Math.ceil(first))) return 0;
    let k = Math.floor(Math.log(budget * (g - 1) / first + 1) / Math.log(g));
    // El logaritmo puede errar por una unidad en coma flotante: se corrige contra el coste real.
    while (k > 0 && Game.getProducerCost(id, k) > budget) k--;
    while (Game.getProducerCost(id, k + 1) <= budget) k++;
    return k;
  };

  // Los productores se descubren de uno en uno: están "abiertos" (comprables) hasta el
  // siguiente al más alto que tengas, el que viene después es un "teaser" (???) y el resto
  // no se ven. Se deduce solo del estado, así que sobrevive a recargar la partida.
  Game.getProducerVisibility = function (id) {
    let highest = -1;
    config.producers.forEach((p, i) => {
      if (Game.state.producers[p.id] > 0) highest = i;
    });
    const index = producerIndex[id];
    const rules = Game.getChallengeRules();
    if (rules.noProducers || (rules.maxProducers !== undefined && index >= rules.maxProducers)) return 'hidden';
    if (index <= highest + 1) return 'open';
    return index === highest + 2 ? 'teaser' : 'hidden';
  };

  // Compra `amount` unidades (un número, o 'max'). Todo o nada: si no alcanza para la
  // cantidad pedida no se compra nada. Devuelve true si se compró.
  Game.buyProducer = function (id, amount = 1) {
    if (Game.getProducerVisibility(id) !== 'open') return false;
    const count = amount === 'max' ? Game.getMaxAffordable(id) : amount;
    if (count < 1) return false;
    const cost = Game.getProducerCost(id, count);
    if (Game.state.currency < cost) return false;
    Game.state.currency -= cost;
    Game.state.producers[id] += count;
    Game.state.stats.bought += count;
    return true;
  };

  // ── Mejoras ───────────────────────────────────────────────
  // Una mejora se desbloquea por haber ganado cierta cantidad en total ({ earned })
  // o por tener cierto número de un productor ({ producer, count }, y de otro si trae `with`).
  Game.isUpgradeUnlocked = function (u) {
    const need = u.unlock;
    if (need.producer) {
      if (Game.state.producers[need.producer] < need.count) return false;
      return !need.with || Game.state.producers[need.with.producer] >= need.with.count; // sinergias: piden los dos
    }
    return Game.state.totalEarned >= need.earned;
  };

  // Disponible = desbloqueada y todavía sin comprar (es lo que muestra la tienda).
  Game.isUpgradeAvailable = function (u) {
    if (Game.getChallengeRules().noUpgrades) return false;
    return !hasUpgrade(u) && Game.isUpgradeUnlocked(u);
  };

  // Qué compraría "comprar todas": de la más barata a la más cara, mientras alcance el dinero.
  // Devuelve { available, count, cost }: mejoras disponibles, cuántas se pagarían y lo que costarían en total.
  Game.getBuyAllPlan = function () {
    let available = 0;
    let count = 0;
    let cost = 0;
    let open = true; // sigue habiendo dinero para la siguiente
    for (const u of Game.upgrades) { // la lista ya va de menor a mayor coste
      if (!Game.isUpgradeAvailable(u)) continue;
      available++;
      if (open && cost + u.cost <= Game.state.currency) {
        count++;
        cost += u.cost;
      } else {
        open = false;
      }
    }
    return { available, count, cost };
  };

  // Compra todas las mejoras disponibles que se puedan pagar, de la más barata a la más cara.
  // Devuelve { count, spent }. Nunca deja la moneda en negativo.
  Game.buyAllUpgrades = function () {
    let count = 0;
    let spent = 0;
    for (const u of Game.upgrades) {
      if (u.cost > Game.state.currency) break; // las siguientes cuestan aún más
      if (!Game.isUpgradeAvailable(u)) continue;
      Game.state.currency -= u.cost;
      Game.state.upgrades[u.id] = true;
      Game.state.stats.bought += 1;
      count++;
      spent += u.cost;
    }
    return { count, spent };
  };

  // Compra única. Devuelve true si se compró ahora.
  Game.buyUpgrade = function (id) {
    const u = Game.upgradeById[id];
    if (!u || !Game.isUpgradeAvailable(u) || Game.state.currency < u.cost) return false;
    Game.state.currency -= u.cost;
    Game.state.upgrades[id] = true;
    Game.state.stats.bought += 1;
    return true;
  };
})(window.Game);

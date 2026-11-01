// Catálogo de mejoras: junta las del config y genera las de productor. Solo datos derivados.
(function (Game) {
  const { config } = Game;

  const withUnlock = (u) => ({
    ...u,
    unlock: u.unlock || { earned: u.cost * config.upgradeRevealRatio },
  });

  const list = [
    ...config.clickUpgrades.map(withUnlock),
    ...config.globalUpgrades.map(withUnlock),
  ];

  for (const p of config.producers) {
    for (const tier of config.producerUpgradeTiers) {
      list.push({
        id: p.id + '-' + tier.at,
        label: tier.label,
        icon: p.icon,
        cost: p.baseCost * tier.costFactor,
        effect: { type: 'producerMult', target: p.id, value: tier.mult },
        unlock: { producer: p.id, count: tier.at },
      });
    }
  }

  // Sinergias: el productor `i` ayuda al `i - 1`.
  const synergy = config.synergy;
  config.producers.forEach((p, i) => {
    if (i === 0) return;
    list.push({
      id: 'syn-' + p.id,
      icon: p.icon,
      cost: p.baseCost * synergy.costFactor,
      effect: { type: 'synergy', source: p.id, target: config.producers[i - 1].id, value: synergy.perUnit },
      unlock: { producer: p.id, count: synergy.needSource, with: { producer: config.producers[i - 1].id, count: synergy.needTarget } },
    });
  });

  // De la más barata a la más cara: es el orden en que se muestran.
  list.sort((a, b) => a.cost - b.cost);

  const byId = {};
  const byType = { clickAdd: [], clickMult: [], clickPps: [], globalMult: [] };
  const producerMult = {}; // id de productor → mejoras ×N de ese productor
  const synergyBy = {}; // id de productor → sinergias que lo mejoran
  for (const p of config.producers) { producerMult[p.id] = []; synergyBy[p.id] = []; }

  for (const u of list) {
    byId[u.id] = u;
    if (u.effect.type === 'producerMult') producerMult[u.effect.target].push(u);
    else if (u.effect.type === 'synergy') synergyBy[u.effect.target].push(u);
    else byType[u.effect.type].push(u);
  }

  // Nombre en el idioma actual: las de productor y las sinergias se componen con el nombre de los productores.
  Game.upgradeName = function (u) {
    if (u.effect.type === 'synergy') {
      return Game.tr('upgrade.synergyName', { source: Game.producerName(u.effect.source), target: Game.producerName(u.effect.target) });
    }
    if (u.effect.type === 'producerMult') {
      return Game.tr('upgrade.tierName', { name: Game.producerName(u.effect.target), label: u.label });
    }
    return Game.tr('upgrade.' + u.id);
  };

  Game.upgrades = list;
  Game.upgradeById = byId;
  Game.upgradesByType = byType;
  Game.producerUpgrades = producerMult;
  Game.synergyUpgrades = synergyBy;
})(window.Game);

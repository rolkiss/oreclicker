// Logros: condiciones, comprobación y bonus. Solo lógica; el panel está en achievements-panel.js.
(function (Game) {
  const { config } = Game;
  const { per, bonus } = config.achievementBonus;

  const mineralIndex = {};
  config.minerals.forEach((m, i) => { mineralIndex[m.id] = i; });
  const producerIcon = {};
  for (const p of config.producers) producerIcon[p.id] = p.icon;

  // Catálogo con el icono ya resuelto y el tipo de condición para los textos.
  Game.achievements = config.achievements.map((a) => {
    let type;
    if (a.clicks !== undefined) type = 'clicks';
    else if (a.earned !== undefined) type = 'earned';
    else if (a.mineral !== undefined) type = 'mineral';
    else if (a.producer !== undefined) type = 'producer';
    else if (a.allProducers !== undefined) type = 'allProducers';
    else if (a.upgrades !== undefined) type = 'upgrades';
    else if (a.playTime !== undefined) type = 'playTime';
    else if (a.offline) type = 'offline';
    else if (a.pps !== undefined) type = 'pps';
    const icon = a.icon || (type === 'mineral' ? config.minerals[mineralIndex[a.mineral]].icon : producerIcon[a.producer]);
    return { ...a, type, icon };
  });

  function isMet(a) {
    const s = Game.state;
    switch (a.type) {
      case 'clicks': return s.totalClicks >= a.clicks;
      case 'earned': return s.totalEarned >= a.earned;
      case 'mineral': return Game.getMineralIndex() >= mineralIndex[a.mineral];
      case 'producer': return s.producers[a.producer] >= a.count;
      case 'allProducers': return config.producers.every((p) => s.producers[p.id] >= a.allProducers);
      case 'upgrades': return Object.keys(s.upgrades).length >= a.upgrades;
      case 'playTime': return s.playTime >= a.playTime;
      case 'offline': return s.offlineReturns >= 1;
      case 'pps': return Game.getPps() >= a.pps;
      default: return false;
    }
  }

  // Descripción de la meta en el idioma actual, compuesta desde la condición.
  Game.describeAchievement = function (a) {
    const n = Game.formatNumber;
    switch (a.type) {
      case 'clicks': return Game.tr('ach.desc.clicks', { n: n(a.clicks) });
      case 'earned': return Game.tr('ach.desc.earned', { n: n(a.earned) });
      case 'mineral': return Game.tr('ach.desc.mineral', { name: Game.mineralName(Game.minerals[mineralIndex[a.mineral]]) });
      case 'producer': return Game.tr('ach.desc.producer', { n: n(a.count), name: Game.producerName(a.producer) });
      case 'allProducers': return Game.tr('ach.desc.allProducers', { n: n(a.allProducers) });
      case 'upgrades': return Game.tr('ach.desc.upgrades', { n: n(a.upgrades) });
      case 'playTime': return Game.tr('ach.desc.playTime', { time: Game.formatDuration(a.playTime) });
      case 'offline': return Game.tr('ach.desc.offline');
      case 'pps': return Game.tr('ach.desc.pps', { n: n(a.pps) });
      default: return '';
    }
  };

  Game.getAchievementCount = function () {
    return Object.keys(Game.state.achievements).length;
  };

  // +bonus de producción global por cada `per` logros.
  Game.getAchievementMultiplier = function () {
    if (Game.isClean()) return 1; // en un reto no cuentan los bonus permanentes
    return 1 + Math.floor(Game.getAchievementCount() / per) * bonus;
  };

  // Desbloquea los logros cuya condición se cumple y devuelve los nuevos (para avisar).
  Game.checkAchievements = function () {
    const unlocked = [];
    for (const a of Game.achievements) {
      if (Game.state.achievements[a.id] || !isMet(a)) continue;
      Game.state.achievements[a.id] = true;
      unlocked.push(a);
    }
    return unlocked;
  };
})(window.Game);

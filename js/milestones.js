// Hitos: al llegar a ciertos minerales se abre algo nuevo (un golpe crítico, un informe…), no solo cifras.
// Solo lógica, sin DOM. Los hitos cumplidos se guardan y sobreviven a renacer.
(function (Game) {
  const { config } = Game;

  const mineralIndex = {};
  config.minerals.forEach((m, i) => { mineralIndex[m.id] = i; });

  // Por orden de aparición en la escalera.
  Game.milestones = config.milestones
    .map((m) => ({ ...m, index: mineralIndex[m.mineral] }))
    .sort((a, b) => a.index - b.index);

  Game.hasMilestone = (id) => !!Game.state.milestones[id];

  // ¿Está abierta la novedad `id`? Viene de un hito cumplido o de los desbloqueos por renaceres.
  Game.hasFeature = function (id) {
    return Game.milestones.some((m) => m.feature === id && Game.hasMilestone(m.id)) || Game.hasPrestigeFeature(id);
  };

  // Marca los hitos cuya condición ya se cumple y devuelve los nuevos (para avisar).
  Game.checkMilestones = function () {
    const reached = [];
    const index = Game.getMineralIndex();
    for (const m of Game.milestones) {
      if (Game.hasMilestone(m.id) || index < m.index) continue;
      Game.state.milestones[m.id] = true;
      reached.push(m);
    }
    return reached;
  };

  // El siguiente hito por cumplir (null si ya están todos).
  Game.getNextMilestone = () => Game.milestones.find((m) => !Game.hasMilestone(m.id)) || null;
})(window.Game);

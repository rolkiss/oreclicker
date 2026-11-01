// Biomas: agrupan los minerales de la escalera (tierra, cueva, filón…) y marcan el aspecto de la pantalla.
// Solo lógica, sin DOM; el pintado (paleta y partículas) está en ui.js.
(function (Game) {
  const { config } = Game;

  const mineralIndex = {};
  config.minerals.forEach((m, i) => { mineralIndex[m.id] = i; });

  // Cada bioma empieza en su mineral `from` y llega hasta el anterior al `from` del siguiente.
  Game.biomes = config.biomes.map((b, index) => ({ ...b, index, first: mineralIndex[b.from] }));

  const biomeOf = []; // índice de mineral → índice de bioma
  Game.biomes.forEach((b, i) => {
    const end = i + 1 < Game.biomes.length ? Game.biomes[i + 1].first : config.minerals.length;
    b.last = end - 1; // su último mineral
    for (let m = b.first; m < end; m++) biomeOf[m] = i;
  });

  Game.getBiomeIndexOf = (mineral) => biomeOf[Math.min(mineral, config.minerals.length - 1)]; // los rangos sin fin, en el último bioma
  Game.getBiomeIndex = () => Game.getBiomeIndexOf(Game.getMineralIndex());
  Game.biomeName = (biome) => Game.tr('biome.' + biome.id);
})(window.Game);

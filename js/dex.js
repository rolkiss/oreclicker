// Mineralpedia: el álbum de minerales descubiertos. Se descubre un mineral al llegar a él (en cualquier vuelta)
// y no se pierde al renacer. Completar un bioma entero da un pequeño bonus de producción permanente.
// Solo lógica, sin DOM; el panel está en dex-panel.js. Números en config.dex.
(function (Game) {
  const { config } = Game;
  const cfg = config.dex;

  const dex = () => Game.state.dex;

  // El mineral más lejano al que se ha llegado, y cuántos hay descubiertos.
  Game.isDiscovered = (index) => index <= dex().best;
  // (`best` puede pasar del último mineral de verdad con los rangos sin fin; el álbum solo cuenta los de verdad)
  Game.getDexCount = () => Math.min(dex().best, Game.realMineralCount - 1) + 1;

  // Un bioma está completo cuando se ha descubierto su último mineral.
  Game.isBiomeComplete = (biome) => dex().best >= biome.last;
  Game.getCompletedBiomes = () => Game.biomes.filter((b) => dex().best >= b.last);

  // +biomeBonus de producción por cada bioma completo (va en getGlobalMultiplier).
  Game.getDexMultiplier = function () {
    if (Game.isClean()) return 1; // en un reto no cuentan los bonus permanentes
    let done = 0;
    for (const b of Game.biomes) if (dex().best >= b.last) done++;
    return 1 + done * cfg.biomeBonus;
  };

  // Anota lo descubierto hasta ahora y devuelve los biomas que se acaban de completar (para avisar).
  Game.checkDex = function () {
    const d = dex();
    const index = Game.getMineralIndex();
    if (index <= d.best) return [];
    const before = Game.getCompletedBiomes();
    d.best = index;
    return Game.getCompletedBiomes().filter((b) => !before.includes(b));
  };

  // Entradas nuevas desde la última vez que se abrió el álbum (es el numerito del botón).
  Game.getDexUnseen = () => Math.max(0, Game.getDexCount() - dex().seen);
  Game.markDexSeen = function () { dex().seen = Game.getDexCount(); };
})(window.Game);

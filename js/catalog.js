// Catálogo de maquinaria: el álbum de productores descubiertos. Un productor se descubre al tener uno por
// primera vez (en cualquier vuelta) y no se pierde al renacer. Completar una era entera (un grupo de
// productores seguidos) da un pequeño bonus de producción permanente.
// Solo lógica, sin DOM; el panel está en dex-panel.js. Números en config.catalog.
(function (Game) {
  const { config } = Game;
  const cfg = config.catalog;

  const producerIndex = {};
  config.producers.forEach((p, i) => { producerIndex[p.id] = i; });

  // Cada era empieza en su productor `from` y llega hasta el anterior al `from` de la siguiente.
  Game.eras = cfg.eras.map((e, index) => ({ ...e, index, first: producerIndex[e.from] }));
  Game.eras.forEach((e, i) => {
    e.last = (i + 1 < Game.eras.length ? Game.eras[i + 1].first : config.producers.length) - 1;
  });

  const catalog = () => Game.state.catalog;

  // El productor más lejano que se ha llegado a tener, y cuántos hay descubiertos. Como se abren de uno en
  // uno, tener el nº k implica haber tenido todos los anteriores.
  Game.isMachineFound = (index) => index <= catalog().best;
  Game.getCatalogCount = () => catalog().best + 1;
  Game.isEraComplete = (era) => catalog().best >= era.last;
  Game.getCompletedEras = () => Game.eras.filter((e) => catalog().best >= e.last);

  // +eraBonus de producción por cada era completa (va en getGlobalMultiplier).
  Game.getCatalogMultiplier = function () {
    if (Game.isClean()) return 1; // en un reto no cuentan los bonus permanentes
    let done = 0;
    for (const e of Game.eras) if (catalog().best >= e.last) done++;
    return 1 + done * cfg.eraBonus;
  };

  // Anota lo descubierto hasta ahora y devuelve las eras que se acaban de completar (para avisar).
  Game.checkCatalog = function () {
    const c = catalog();
    let highest = -1;
    config.producers.forEach((p, i) => { if (Game.state.producers[p.id] > 0) highest = i; });
    if (highest <= c.best) return [];
    const before = Game.getCompletedEras();
    c.best = highest;
    return Game.getCompletedEras().filter((e) => !before.includes(e));
  };

  // Entradas nuevas desde la última vez que se abrió la pestaña (suma al numerito del botón).
  Game.getCatalogUnseen = () => Math.max(0, catalog().best + 1 - catalog().seen);
  Game.markCatalogSeen = function () { catalog().seen = catalog().best + 1; };
})(window.Game);

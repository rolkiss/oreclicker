// Tarjeta compartible: los datos y el texto de la imagen con tus estadísticas ("Prestigio 12 · Diamante ·
// 4.2e18 extraídos · ¿me superas?"). Solo lógica, sin DOM; el dibujo y los botones están en share-ui.js.
(function (Game) {
  const { config } = Game;

  // Lo que sale en la tarjeta. El mineral y el bioma son los más lejanos a los que se ha llegado (no se
  // pierden al renacer) y la producción no cuenta el frenesí.
  Game.getShareStats = function () {
    const s = Game.state;
    const index = s.dex.best;
    return {
      title: config.share.title,
      url: config.share.url,
      prestiges: s.prestige.count,
      mineralIndex: index,
      mineral: Game.minerals[index],
      biome: Game.biomes[Game.getBiomeIndexOf(index)],
      lifetime: s.stats.lifetime,
      pps: Game.getPps() / Game.getBoostMultiplier(),
      dexCount: Game.getDexCount(),
      dexTotal: Game.realMineralCount,
      playTime: s.playTime,
    };
  };

  // Frase para acompañar la imagen al compartirla.
  Game.getShareText = function (stats = Game.getShareStats()) {
    const params = {
      n: stats.prestiges,
      mineral: Game.mineralName(stats.mineral),
      total: Game.formatNumber(stats.lifetime),
      title: stats.title,
    };
    const text = Game.tr(stats.prestiges > 0 ? 'share.textPrestige' : 'share.text', params);
    return stats.url ? text + ' ' + stats.url : text;
  };
})(window.Game);

// Escalera de minerales: completa cada uno con su umbral de desbloqueo y su valor.
(function (Game) {
  const { config } = Game;
  const { firstUnlock, unlockGrowth, valueGrowth, unlocks } = config.mineralCurve;

  // Umbral de desbloqueo: el del propio mineral, o la lista `unlocks` (calibrada con
  // tools/sim.js), o la fórmula geométrica como último recurso.
  function unlockAt(m, i) {
    if (m.unlockAt !== undefined) return m.unlockAt;
    if (i === 0) return 0;
    if (unlocks && unlocks[i - 1] !== undefined) return unlocks[i - 1];
    return firstUnlock * Math.pow(unlockGrowth, i - 1);
  }

  Game.mineralName = (m) => (m.virtual ? Game.tr('mineral.endless', { name: Game.tr('mineral.' + m.baseId), n: m.level }) : Game.tr('mineral.' + m.id));
  // Nivel de rareza (0 = común … 7 = divino): marca el brillo y las chispas de la roca.
  Game.rarityLevel = (m) => config.rarities.indexOf(m.rarity);
  Game.rarityName = (m) => Game.tr('rarity.' + m.rarity);

  Game.minerals = config.minerals.map((m, i) => ({
    ...m,
    unlockAt: unlockAt(m, i),
    value: m.value !== undefined ? m.value : Math.pow(valueGrowth, i),
  }));

  // Rangos sin fin tras el último mineral: mismo aspecto con el color girado, umbral y valor siempre mayores.
  const hueRotate = (hex, degrees) => {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d === 0) return hex;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = ((h / 6) * 360 + degrees) % 360 / 360;
    const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const hex2 = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + hex2(f(p, q, h + 1 / 3)) + hex2(f(p, q, h)) + hex2(f(p, q, h - 1 / 3));
  };
  const lastReal = Game.minerals[Game.minerals.length - 1];
  const endless = config.endless;
  for (let k = 1; k <= endless.count; k++) {
    const prev = Game.minerals[Game.minerals.length - 1];
    Game.minerals.push({
      ...lastReal,
      id: lastReal.id + '+' + k,
      accent: hueRotate(lastReal.accent, endless.hue * k),
      unlockAt: prev.unlockAt * endless.growth,
      value: Math.pow(valueGrowth, Game.minerals.length),
      virtual: true,
      level: k + 1,
      baseId: lastReal.id,
    });
  }
  Game.realMineralCount = config.minerals.length; // los de verdad (los rangos sin fin no entran en la Mineralpedia)
})(window.Game);

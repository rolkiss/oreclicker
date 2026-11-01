// Formato de números. Abreviado (por defecto): 1.23K, 45.6M, 789B… y científico al agotar los
// sufijos. Si el jugador elige notación científica en las opciones: 1.23e3, 4.56e7…
(function (Game) {
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
                    'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg']; // hasta 1e63

  function scientific(n) {
    return n.toExponential(Game.config.numberFormat.significantDigits - 1).replace('e+', 'e');
  }

  const prefersScientific = () =>
    !!(Game.state && Game.state.settings && Game.state.settings.notation === 'scientific');

  function formatNumber(value) {
    const { significantDigits, smallDecimals } = Game.config.numberFormat;

    if (Number.isNaN(value)) return '0';
    if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
    if (value < 0) return '-' + formatNumber(-value);

    if (value < 1000) {
      // Enteros tal cual; con fracción, hasta `smallDecimals` decimales sin ceros sobrantes.
      const rounded = parseFloat(value.toFixed(smallDecimals));
      if (rounded < 1000) return String(rounded);
      value = rounded; // 999.96 redondea a 1000 → pasa a "1.00K"
    }
    if (prefersScientific()) return scientific(value);

    let tier = Math.floor(Math.log10(value) / 3);
    if (tier >= SUFFIXES.length) return scientific(value);

    const scaled = (v, t) => v / Math.pow(1000, t);
    const digits = (s) => Math.max(0, significantDigits - String(Math.floor(s)).length);

    let text = scaled(value, tier).toFixed(digits(scaled(value, tier)));
    // Redondeo que sube de tramo: 999.99K → "1000K" debe ser "1.00M".
    if (parseFloat(text) >= 1000) {
      tier += 1;
      if (tier >= SUFFIXES.length) return scientific(value);
      text = scaled(value, tier).toFixed(digits(scaled(value, tier)));
    }
    return text + SUFFIXES[tier];
  }

  // Duración legible: "40 s", "12 min", "2 h 15 min", "3 d 4 h".
  function formatDuration(seconds) {
    const s = Math.floor(seconds);
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
    const d = Math.floor(h / 24);
    return d + ' d' + (h % 24 ? ' ' + (h % 24) + ' h' : '');
  }

  Game.formatNumber = formatNumber;
  Game.formatDuration = formatDuration;
})(window.Game);

// Tarjeta compartible: dibuja la imagen con tus estadísticas en un canvas (sin assets: fondo del bioma,
// la gema del mineral y texto) y ofrece compartirla, descargarla o copiarla. Los datos vienen de share.js.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);

  const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

  const els = {};
  let stats = null; // los datos con los que se dibujó la imagen que se ve

  // ── Dibujo ────────────────────────────────────────────────
  function rgba(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Texto que se encoge hasta caber en `maxWidth` (los números grandes pueden ser largos).
  function fitText(g, text, x, y, size, weight, maxWidth) {
    let px = size;
    g.font = weight + ' ' + px + 'px ' + FONT;
    while (g.measureText(text).width > maxWidth && px > 14) {
      px -= 2;
      g.font = weight + ' ' + px + 'px ' + FONT;
    }
    g.fillText(text, x, y);
  }

  // La gema del mineral como imagen (el SVG del juego, serializado).
  function gemImage(mineral, index, size) {
    const svg = Game.gem.toSvg(mineral, index);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    const xml = new XMLSerializer().serializeToString(svg);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
  }

  async function draw(canvas, s) {
    const [W, H] = config.share.size;
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    const p = s.biome.palette;
    const m = s.mineral;
    const accent = m.accent;
    const light = Game.gem.shade(accent, 0.35);
    const img = await gemImage(m, s.mineralIndex, 440);

    // Fondo: degradado del bioma, brillo del mineral y partículas del bioma (siempre las mismas para los mismos datos).
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, p.bg);
    bg.addColorStop(1, p.bgDeep);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const top = g.createRadialGradient(W / 2, 0, 20, W / 2, 0, W * 0.8);
    top.addColorStop(0, p.glow);
    top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, H);
    const aura = g.createRadialGradient(W / 2, 560, 20, W / 2, 560, 420);
    aura.addColorStop(0, rgba(accent, 0.4));
    aura.addColorStop(1, rgba(accent, 0));
    g.fillStyle = aura;
    g.fillRect(0, 0, W, H);

    const rand = Game.gem.seeded(s.mineralIndex * 977 + s.prestiges + 7);
    const colors = s.biome.fx.colors || ['#ffffff'];
    for (let i = 0; i < 80; i++) {
      g.globalAlpha = 0.15 + rand() * 0.45;
      g.fillStyle = colors[Math.floor(rand() * colors.length)];
      g.beginPath();
      g.arc(rand() * W, rand() * H, 1 + rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Cabecera: título del juego y bioma.
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    try { g.letterSpacing = '8px'; } catch (err) { /* sin espaciado en navegadores antiguos */ }
    fitText(g, s.title.toUpperCase(), W / 2, 96, 40, 800, W - 140);
    try { g.letterSpacing = '0px'; } catch (err) { /* idem */ }
    const chip = Game.biomeName(s.biome);
    g.font = '700 38px ' + FONT;
    const chipW = g.measureText(s.biome.icon + '  ' + chip).width + 64;
    roundRect(g, W / 2 - chipW / 2, 128, chipW, 64, 32);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fill();
    g.strokeStyle = rgba(accent, 0.7);
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#fff';
    g.fillText(s.biome.icon + '  ' + chip, W / 2, 173);

    // Titular: el prestigio.
    g.save();
    g.shadowColor = accent;
    g.shadowBlur = 40;
    g.fillStyle = '#fff';
    fitText(g, s.prestiges > 0 ? tr('share.headline', { n: formatNumber(s.prestiges) }) : tr('share.headline0'), W / 2, 320, 120, 900, W - 120);
    g.restore();

    // La gema del mineral más lejano.
    g.drawImage(img, W / 2 - 220, 340, 440, 440);
    g.fillStyle = '#fff';
    fitText(g, m.icon + ' ' + Game.mineralName(m), W / 2, 850, 72, 900, W - 120);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    fitText(g, Game.rarityName(m) + ' · ×' + formatNumber(m.value), W / 2, 900, 36, 600, W - 120);

    // Cuatro cifras en una cuadrícula.
    const cells = [
      [tr('share.total'), formatNumber(s.lifetime)],
      [tr('share.pps'), formatNumber(s.pps) + '/s'],
      [tr('share.dex'), s.dexCount + ' / ' + s.dexTotal],
      [tr('share.time'), Game.formatDuration(s.playTime)],
    ];
    const gap = 24;
    const cw = (W - 2 * 70 - gap) / 2;
    cells.forEach(([label, value], i) => {
      const x = 70 + (i % 2) * (cw + gap);
      const y = 940 + Math.floor(i / 2) * (120 + gap);
      roundRect(g, x, y, cw, 120, 24);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fill();
      g.strokeStyle = rgba(accent, 0.5);
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      fitText(g, label.toUpperCase(), x + cw / 2, y + 40, 26, 700, cw - 40);
      g.fillStyle = '#fff';
      fitText(g, value, x + cw / 2, y + 96, 56, 900, cw - 40);
    });

    // Llamada a la acción y, si hay, la dirección del juego.
    g.save();
    g.shadowColor = accent;
    g.shadowBlur = 30;
    g.fillStyle = light;
    fitText(g, tr('share.cta'), W / 2, 1272, 68, 900, W - 120);
    g.restore();
    if (s.url) {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      fitText(g, s.url.replace(/^https?:\/\//, ''), W / 2, 1322, 30, 600, W - 120);
    }
  }

  // ── Acciones ──────────────────────────────────────────────
  const toBlob = () => new Promise((resolve, reject) => {
    els.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob'))), 'image/png');
  });

  function fileName() {
    const slug = config.share.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug + (stats && stats.prestiges > 0 ? '-prestigio-' + stats.prestiges : '') + '.png';
  }

  function status(key, kind) {
    els.status.textContent = key ? tr(key) : '';
    els.status.className = 'opt-hint' + (kind ? ' ' + kind : '');
  }

  async function download() {
    try {
      const url = URL.createObjectURL(await toBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      status('share.downloaded', 'ok');
    } catch (err) {
      status('share.failed', 'error');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob() })]);
      status('share.copied', 'ok');
    } catch (err) {
      status('share.copyFailed', 'error');
    }
  }

  async function send() {
    try {
      const file = new File([await toBlob()], fileName(), { type: 'image/png' });
      const data = { files: [file], text: Game.getShareText(stats), title: stats.title };
      if (navigator.canShare && !navigator.canShare(data)) throw new Error('files');
      await navigator.share(data);
      status('share.shared', 'ok');
    } catch (err) {
      if (err && err.name === 'AbortError') return; // el jugador cerró el menú de compartir
      status('share.shareFailed', 'error');
    }
  }

  // ── Ventana ───────────────────────────────────────────────
  async function open() {
    stats = Game.getShareStats();
    status('share.working');
    Game.ui.openModal(els.share, els['share-close']);
    try {
      await draw(els.canvas, stats);
      status('share.ready', 'ok');
    } catch (err) {
      status('share.failed', 'error');
    }
  }

  function init() {
    for (const id of ['share', 'share-open', 'share-close', 'share-send', 'share-download', 'share-copy']) els[id] = $(id);
    els.canvas = $('share-canvas');
    els.status = $('share-status');
    // Compartir con archivos y copiar al portapapeles solo donde el navegador lo permite.
    els['share-send'].hidden = !(navigator.share && navigator.canShare);
    els['share-copy'].hidden = !(navigator.clipboard && typeof ClipboardItem !== 'undefined');
    els['share-open'].addEventListener('click', open);
    els['share-close'].addEventListener('click', () => Game.ui.closeModal(els.share));
    els['share-send'].addEventListener('click', send);
    els['share-download'].addEventListener('click', download);
    els['share-copy'].addEventListener('click', copy);
  }

  Game.shareUi = { init, open };
})(window.Game);

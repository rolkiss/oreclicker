// Gema SVG generada en código: la roca central tiene una forma propia para cada mineral (guijarros,
// pepita de oro, lingotes, cubos de pirita, gema tallada…) y se colorea con su acento. La geometría
// y el color son datos puros (se prueban sin navegador); solo toSvg() toca el DOM.
(function (Game) {
  const TAU = Math.PI * 2;
  const LIGHT = Math.atan2(-1, -1); // la luz viene de arriba a la izquierda

  // ── Color ─────────────────────────────────────────────────
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
  }

  function hslToHex(h, s, l) {
    const hue = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    let r;
    let g;
    let b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue(p, q, h + 1 / 3);
      g = hue(p, q, h);
      b = hue(p, q, h - 1 / 3);
    }
    const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return '#' + to(r) + to(g) + to(b);
  }

  // Aclara (t > 0) u oscurece (t < 0) el color base; t va de -1 a 1.
  function shade(hex, t) {
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h, s, Math.min(0.97, Math.max(0.04, l + t * 0.34)));
  }

  // Mezcla de dos colores (0 = a, 1 = b), para tintar piedras neutras con el acento del mineral.
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
    return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
  }

  // ── Utilidades de geometría ───────────────────────────────
  // Generador pseudoaleatorio con semilla: el mismo mineral siempre da la misma gema.
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const STONE = '#6f675f'; // piedra neutra sobre la que se pintan vetas y cristales

  // Cada cara: { pts: [[x, y]…], tone (-1..1, brillo relativo), base? (color propio en vez del acento) }.
  // El lienzo es de 200×200.
  const face = (pts, tone, base) => (base ? { pts, tone, base } : { pts, tone });

  // Bulto irregular: un abanico de triángulos desde un centro, sombreados según la luz.
  function blob(rand, o = {}) {
    const { cx = 100, cy = 104, rx = 80, ry = 70, n = 11, jitter = 0.35, spread = 0.2, contrast = 0.55, base } = o;
    const edge = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + (rand() - 0.5) * jitter * (TAU / n);
      const r = 1 - spread * rand();
      edge.push({ ang, pt: [cx + Math.cos(ang) * rx * r, cy + Math.sin(ang) * ry * r] });
    }
    const center = [cx - rx * 0.06 + rand() * rx * 0.1, cy - ry * 0.08 + rand() * ry * 0.1];
    return edge.map((e, i) => {
      const next = edge[(i + 1) % n];
      const mid = e.ang + (((next.ang - e.ang) + TAU) % TAU) / 2;
      return face([center, e.pt, next.pt], Math.cos(mid - LIGHT) * contrast + (rand() - 0.5) * 0.2, base);
    });
  }

  // Un punto de luz sobre una pieza.
  const shine = (x, y, r = 7) => face([[x, y - r], [x + r * 0.7, y], [x, y + r * 0.6], [x - r * 0.7, y]], 0.9);

  // Prisma visto en oblicuo: arriba, frente y lado.
  function box(x, y, w, h, d, base) {
    return [
      face([[x, y + d], [x + w, y + d], [x + w + d, y], [x + d, y]], 0.5, base),
      face([[x, y + d], [x + w, y + d], [x + w, y + d + h], [x, y + d + h]], -0.05, base),
      face([[x + w, y + d], [x + w + d, y], [x + w + d, y + h], [x + w, y + d + h]], -0.4, base),
    ];
  }

  // Cubo isométrico.
  function cube(cx, cy, s) {
    const dx = s * 0.87;
    return [
      face([[cx, cy - s], [cx + dx, cy - s / 2], [cx, cy], [cx - dx, cy - s / 2]], 0.5),
      face([[cx - dx, cy - s / 2], [cx, cy], [cx, cy + s], [cx - dx, cy + s / 2]], -0.1),
      face([[cx, cy], [cx + dx, cy - s / 2], [cx + dx, cy + s / 2], [cx, cy + s]], -0.4),
    ];
  }

  // Talla "de brillante" vista desde arriba: un contorno (círculo, cojín…) dividido en facetas.
  function cut(outline, rand) {
    const n = 16;
    const outer = Array.from({ length: n }, (_, j) => outline((j * TAU) / n - Math.PI / 2, 1));
    const inner = Array.from({ length: n / 2 }, (_, k) => outline(((2 * k + 1) * TAU) / n - Math.PI / 2, 0.5));
    const polys = [];
    for (let k = 0; k < n / 2; k++) {
      const next = (k + 1) % (n / 2);
      const a = outer[2 * k];
      const b = outer[2 * k + 1];
      const c = outer[(2 * k + 2) % n];
      const ang = ((2 * k + 1) * TAU) / n - Math.PI / 2;
      const t = Math.cos(ang - LIGHT) * 0.5;
      polys.push(face([inner[k], a, b], t + 0.1 + (rand() - 0.5) * 0.1));
      polys.push(face([inner[k], b, c], t - 0.1 + (rand() - 0.5) * 0.1));
      polys.push(face([inner[k], c, inner[next]], t * 0.8 + 0.2));
    }
    polys.push(face(inner, 0.62)); // la mesa
    return polys;
  }

  // Cada forma devuelve { polys, spin, glint }: spin = gira despacio, glint = destello de luz.
  const shapes = {
    // Cuatro guijarros apiñados (grava).
    pebbles(rand) {
      const stones = [[62, 128, 42], [132, 122, 46], [96, 84, 40], [100, 148, 36]];
      const polys = [];
      for (const [cx, cy, r] of stones) polys.push(...blob(rand, { cx, cy, rx: r, ry: r * 0.82, n: 9, jitter: 0.5, spread: 0.12 }));
      return { polys, spin: false, glint: false };
    },

    // Montículo de arena con granos sueltos.
    pile(rand) {
      const polys = [
        // dos dunas: la grande detrás y la pequeña delante
        face([[60, 176], [122, 70], [122, 176]], 0.22),
        face([[122, 70], [194, 176], [122, 176]], -0.35),
        face([[6, 176], [62, 104], [62, 176]], 0.32),
        face([[62, 104], [118, 176], [62, 176]], -0.28),
      ];
      for (let i = 0; i < 14; i++) {
        const x = 30 + rand() * 140;
        const y = 130 + rand() * 44;
        const s = 3 + rand() * 3;
        polys.push(face([[x, y - s], [x + s, y + s * 0.6], [x - s, y + s * 0.6]], rand() > 0.5 ? 0.6 : -0.5));
      }
      return { polys, spin: false, glint: false };
    },

    // Terrón liso (arcilla).
    lump(rand) {
      const polys = [
        ...blob(rand, { cx: 96, cy: 108, rx: 72, ry: 54, n: 10, jitter: 0.4, spread: 0.14, contrast: 0.45 }),
        ...blob(rand, { cx: 150, cy: 138, rx: 36, ry: 28, n: 8, jitter: 0.4, spread: 0.14, contrast: 0.45 }),
      ];
      polys.push(shine(66, 88, 9));
      return { polys, spin: false, glint: false };
    },

    // Bloques de caliza apilados.
    blocks(rand) {
      const polys = [
        ...box(24, 104, 84, 56, 20),
        ...box(96, 92, 66, 70, 18),
        ...box(52, 40, 62, 54, 18),
      ];
      polys.forEach((p) => { p.tone += (rand() - 0.5) * 0.12; });
      return { polys, spin: false, glint: false };
    },

    // Carbón: trozos angulosos casi negros con brillos.
    coal(rand) {
      const body = '#34363c';
      const polys = blob(rand, { cx: 100, cy: 108, rx: 78, ry: 66, n: 8, jitter: 0.7, spread: 0.3, contrast: 0.7, base: body });
      for (let i = 0; i < 3; i++) polys.push(face([[60 + rand() * 60, 70 + rand() * 40], [80 + rand() * 50, 76 + rand() * 40], [70 + rand() * 50, 96 + rand() * 30]], 0.75));
      return { polys, spin: false, glint: false };
    },

    // Racimo de cristales de cuarzo.
    crystal(rand) {
      const tip = [100 + (rand() - 0.5) * 10, 24];
      return {
        polys: [
          face([[22, 174], [30, 130], [46, 110], [58, 132], [58, 172]], -0.45),
          face([[142, 172], [142, 130], [156, 108], [176, 132], [182, 174]], -0.2),
          face([[60, 172], [60, 96], [100, 84], [100, 178]], -0.3),
          face([[100, 84], [140, 96], [140, 172], [100, 178]], 0.05),
          face([[60, 96], tip, [100, 84]], 0.45),
          face([tip, [140, 96], [100, 84]], 0.18),
        ],
        spin: false,
        glint: false,
      };
    },

    // Cubos de pirita (tres, como en un racimo).
    cubes(rand) {
      const polys = [
        ...cube(62, 112, 40),
        ...cube(138, 118, 44),
        ...cube(100 + (rand() - 0.5) * 8, 70, 38),
      ];
      return { polys, spin: false, glint: false };
    },

    // Mena: roca oscura con vetas del color del metal.
    ore(rand, accent) {
      const polys = blob(rand, { cx: 100, cy: 106, rx: 80, ry: 68, n: 11, jitter: 0.4, spread: 0.22, base: mix(STONE, accent, 0.18) });
      for (let i = 0; i < 4; i++) {
        const x = 52 + rand() * 80;
        const y = 66 + rand() * 60;
        const w = 12 + rand() * 14;
        polys.push(face([[x, y], [x + w, y - 4], [x + w + 6, y + 8], [x + 2, y + 14]], 0.55 + rand() * 0.2));
      }
      return { polys, spin: false, glint: false };
    },

    // Pepita: bulto redondeado y brillante.
    nugget(rand) {
      // tres bultos que se solapan: un grande detrás y dos pequeños delante
      const polys = [
        ...blob(rand, { cx: 108, cy: 98, rx: 56, ry: 48, n: 9, jitter: 0.5, spread: 0.2, contrast: 0.6 }),
        ...blob(rand, { cx: 64, cy: 126, rx: 44, ry: 36, n: 8, jitter: 0.5, spread: 0.2, contrast: 0.6 }),
        ...blob(rand, { cx: 138, cy: 138, rx: 38, ry: 28, n: 7, jitter: 0.5, spread: 0.2, contrast: 0.6 }),
      ];
      polys.push(shine(100, 72, 9), shine(52, 112, 6));
      return { polys, spin: false, glint: true };
    },

    // Lingotes apilados en pirámide.
    ingots(rand) {
      const polys = [];
      const rows = [[3, 150], [2, 112], [1, 74]];
      for (const [count, y] of rows) {
        const w = 56;
        const total = count * w + (count - 1) * 6;
        for (let i = 0; i < count; i++) polys.push(...box(100 - total / 2 + i * (w + 6) - 8, y, w, 24, 14));
      }
      polys.forEach((p) => { p.tone += (rand() - 0.5) * 0.1; });
      return { polys, spin: false, glint: true };
    },

    // Esquirlas largas y afiladas (uranio, mithrilio…).
    spikes(rand) {
      const spikes = [[34, 120], [166, 130], [58, 86], [144, 92], [100, 36]];
      const polys = [];
      for (const [x, tipY] of spikes) {
        const w = 18 + rand() * 6;
        polys.push(face([[x - w, 178], [x + (rand() - 0.5) * 6, tipY], [x, 178]], -0.3));
        polys.push(face([[x, 178], [x + (rand() - 0.5) * 6, tipY], [x + w, 178]], 0.32));
      }
      return { polys, spin: false, glint: true };
    },

    // Talla esmeralda: octógono escalonado.
    emerald() {
      const outer = [[60, 34], [140, 34], [168, 62], [168, 138], [140, 166], [60, 166], [32, 138], [32, 62]];
      const mid = outer.map(([x, y]) => [lerp(100, x, 0.72), lerp(100, y, 0.72)]);
      const inner = outer.map(([x, y]) => [lerp(100, x, 0.46), lerp(100, y, 0.46)]);
      const polys = [];
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        const ang = Math.atan2(((outer[i][1] + outer[j][1]) / 2) - 100, ((outer[i][0] + outer[j][0]) / 2) - 100);
        const t = Math.cos(ang - LIGHT) * 0.5;
        polys.push(face([outer[i], outer[j], mid[j], mid[i]], t));
        polys.push(face([mid[i], mid[j], inner[j], inner[i]], t * 0.7 + 0.15));
      }
      polys.push(face(inner, 0.6));
      return { polys, spin: false, glint: true };
    },

    // Talla redonda (rubí).
    round(rand) {
      return { polys: cut((a, k) => [100 + Math.cos(a) * 84 * k, 100 + Math.sin(a) * 84 * k], rand), spin: false, glint: true };
    },

    // Talla cojín (zafiro): cuadrado de esquinas redondeadas.
    cushion(rand) {
      const sq = (a, k) => {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const r = 84 / Math.pow(Math.pow(Math.abs(c), 3.2) + Math.pow(Math.abs(s), 3.2), 1 / 3.2);
        return [100 + c * r * k * 0.98, 100 + s * r * k * 0.98];
      };
      return { polys: cut(sq, rand), spin: false, glint: true };
    },

    // Gema tallada vista de lado, con n facetas en la corona (diamante).
    brilliant(rand, accent, n = 6) {
      const table = (i) => [lerp(55, 145, i / n), 62];
      const girdle = (i) => [lerp(22, 178, i / n), 98];
      const culet = [100, 182];
      const polys = [face([table(0), table(n), [table(n)[0] - 10, 51], [table(0)[0] + 10, 51]], 0.55)];
      for (let i = 0; i < n; i++) {
        const center = 1 - Math.abs((i + 0.5) / n - 0.5) * 2; // 1 en el centro, 0 en los bordes
        const wobble = (i % 2 ? 0.1 : -0.1) + (rand() - 0.5) * 0.08;
        polys.push(face([table(i), table(i + 1), girdle(i + 1), girdle(i)], -0.1 + 0.5 * center + wobble));
        polys.push(face([girdle(i), girdle(i + 1), culet], -0.4 + 0.35 * center + (i % 2 ? 0.14 : -0.04)));
      }
      return { polys, spin: false, glint: true };
    },

    // Esfera brillante (rodio, iridio, plasmita): círculos que se desplazan hacia la luz.
    orb() {
      const ring = (cx, cy, r) => Array.from({ length: 28 }, (_, i) => [cx + Math.cos((i / 28) * TAU) * r, cy + Math.sin((i / 28) * TAU) * r]);
      const polys = [];
      for (let k = 0; k < 6; k++) polys.push(face(ring(100 - k * 3.4, 100 - k * 3.4, 82 * (1 - k * 0.15)), -0.5 + k * 0.18));
      polys.push(shine(70, 66, 9));
      return { polys, spin: false, glint: true };
    },

    // Meteorito: roca oscura con cráteres y una estela de fuego.
    meteor(rand, accent) {
      // la estela se dibuja primero y la roca la tapa por donde nace
      const polys = [
        face([[104, 76], [168, 2], [138, 102]], 0.2, '#ff5a1f'),
        face([[120, 88], [196, 6], [152, 120]], 0.55, '#ff9a3c'),
        face([[138, 104], [198, 50], [164, 136]], 0.35, '#ffd27a'),
        ...blob(rand, { cx: 82, cy: 122, rx: 66, ry: 58, n: 10, jitter: 0.4, spread: 0.2, base: mix('#4a3f3a', accent, 0.12) }),
      ];
      for (const [x, y, r] of [[60, 108, 11], [96, 140, 9], [88, 100, 7]]) {
        polys.push(face([[x - r, y], [x, y - r * 0.6], [x + r, y], [x, y + r * 0.5]], -0.6, '#2a2320'));
      }
      return { polys, spin: false, glint: false };
    },

    // Estrella de ocho puntas con un núcleo brillante; gira despacio.
    star(rand) {
      const k = 8;
      const outer = (i) => [100 + Math.cos((i / k) * TAU - Math.PI / 2) * 90, 100 + Math.sin((i / k) * TAU - Math.PI / 2) * 90];
      const inner = (i) => [100 + Math.cos(((i + 0.5) / k) * TAU - Math.PI / 2) * 42, 100 + Math.sin(((i + 0.5) / k) * TAU - Math.PI / 2) * 42];
      const polys = [];
      for (let i = 0; i < k; i++) {
        const ang = (i / k) * TAU - Math.PI / 2;
        const tone = Math.cos(ang - LIGHT) * 0.5 + (i % 2 ? 0.08 : -0.08) + (rand() - 0.5) * 0.06;
        polys.push(face([[100, 100], inner(i - 1 < 0 ? k - 1 : i - 1), outer(i), inner(i)], tone));
      }
      polys.push(face(Array.from({ length: k }, (_, i) => [100 + Math.cos((i / k) * TAU) * 22, 100 + Math.sin((i / k) * TAU) * 22]), 0.65));
      return { polys, spin: true, glint: true };
    },

    // Octaedro flotante (unobtanio).
    octa() {
      return {
        polys: [
          face([[100, 18], [28, 100], [100, 76]], 0.7),
          face([[100, 18], [100, 76], [172, 100]], 0.4),
          face([[100, 18], [28, 100], [100, 128]], 0.25),
          face([[100, 18], [100, 128], [172, 100]], 0.5),
          face([[28, 100], [100, 182], [100, 128]], -0.3),
          face([[100, 128], [100, 182], [172, 100]], -0.65),
        ],
        spin: false,
        glint: true,
      };
    },
  };

  const shapeNames = Object.keys(shapes);

  // Gema de un mineral: su forma (campo `shape` en el config) y una semilla propia según su posición.
  function build(mineral, index) {
    const rand = seeded(0x9e3779b1 * (index + 1));
    return { shape: mineral.shape, ...shapes[mineral.shape](rand, mineral.accent) };
  }

  // ── SVG ───────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    for (const key of Object.keys(attrs)) node.setAttribute(key, attrs[key]);
    return node;
  }

  function toSvg(mineral, index) {
    const gem = build(mineral, index);
    const svg = svgEl('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true', focusable: 'false' });
    svg.append(svgEl('ellipse', { cx: 100, cy: 190, rx: 62, ry: 7, fill: '#000', opacity: 0.35 }));

    const body = svgEl('g', gem.spin ? { class: 'gem-spin' } : {});
    for (const poly of gem.polys) {
      const base = poly.base || mineral.accent;
      body.append(svgEl('polygon', {
        points: poly.pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '),
        fill: shade(base, poly.tone),
        stroke: shade(base, poly.tone - 0.3),
        'stroke-width': 0.9,
        'stroke-linejoin': 'round',
      }));
    }
    svg.append(body);

    // Destello: un puntito de luz que parpadea en las piezas brillantes.
    if (gem.glint) {
      svg.append(svgEl('polygon', {
        class: 'gem-glint',
        points: '74,58 77,66 85,69 77,72 74,80 71,72 63,69 71,66',
        fill: '#fff',
        opacity: 0.85,
      }));
    }
    return svg;
  }

  Game.gem = { build, toSvg, shade, mix, seeded, hexToHsl, shapeNames };
})(window.Game);

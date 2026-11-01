// Configuración central: todos los números ajustables del juego viven aquí.
// Primer script que se carga; crea el namespace global `Game`.
window.Game = window.Game || {};

Game.config = {
  languages: ['es', 'en'], // idiomas disponibles; los textos están en js/lang/

  // Bucle y guardado
  tickMs: 100,
  maxTickSeconds: 120, // tope de tiempo que cuenta un único tick (ver main.js)
  autosaveMs: 5000,
  saveKey: 'mineralClicker.save',
  saveVersion: 12, // 4: prestigio (state.prestige); 5: hitos (state.milestones); 6: misiones y contadores (state.missions, state.stats); 7: Mineralpedia (state.dex); 8: total extraído histórico (state.stats.lifetime); 9: catálogo de maquinaria (state.catalog); 10: retos (state.challenges); 11: resumen de la vuelta (state.prestige.runStart y last); 12: anuncios (settings.adsConsent y state.ads). Las partidas anteriores se completan en save.js

  // Ganancias offline: al volver rinden `rate` de la producción pasiva (el clic no cuenta),
  // con un tope de `maxHours` de ausencia. Ausencias de menos de `minSeconds` se ignoran.
  offline: { rate: 0.1, maxHours: 8, minSeconds: 60 },

  // Sonido (js/sound.js): volumen máximo del conjunto, volumen inicial (0–1), tope de sonidos
  // simultáneos y separación mínima entre dos sonidos de clic (ms).
  sound: { master: 0.6, defaultVolume: 0.5, maxVoices: 10, clickGapMs: 35 },

  // Formato de números (ver format.js)
  numberFormat: {
    significantDigits: 3, // 1.23K, 12.3K, 123K
    smallDecimals: 1,     // decimales máximos por debajo de 1.000 (p. ej. 0,1)
  },

  // ── Minerales ────────────────────────────────────────────
  // Orden de las rarezas (de menos a más); el nivel marca el brillo y las chispas de la roca.
  // Cada mineral lleva su `shape` (la forma de su gema, ver js/gem.js).
  rarities: ['common', 'frequent', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'divine', 'transcendent'],
  mineralCurve: {
    firstUnlock: 1_000,
    unlockGrowth: 10,
    valueGrowth: 3,
    unlocks: [
      26_000, 8.2e6, 3.1e9, 2.1e12, 2.4e15, 1.7e18, 5.5e20, 5.1e22, 1.4e25, 1.9e27,
      1.5e29, 4.9e31, 5.4e33, 4.7e35, 1.6e38, 1.6e40, 2.6e42, 5.2e44, 4.5e46, 1.2e49,
      1.7e51, 1.3e53, 4.2e55, 2.5e57, 5.1e58, 5.9e59, 4.3e60, 2.8e61, 1.6e62, 7.1e62,
      3.2e63, 1.8e64, 9.6e64, 4.3e65, 1.9e66, 9.8e66, 4.9e67, 2.3e68, 9.7e68,
    ],
  },
  minerals: [
    { id: 'gravel', icon: '🪨', rarity: 'common', shape: 'pebbles', accent: '#9aa0a6' },
    { id: 'sand', icon: '⏳', rarity: 'common', shape: 'pile', accent: '#d9b56b' },
    { id: 'clay', icon: '🥣', rarity: 'common', shape: 'lump', accent: '#c0714a' },
    { id: 'limestone', icon: '🦴', rarity: 'common', shape: 'blocks', accent: '#d8d2c0' },
    { id: 'coal', icon: '🪨', rarity: 'common', shape: 'coal', accent: '#7d848c' },
    { id: 'quartz', icon: '⚪', rarity: 'frequent', shape: 'crystal', accent: '#e8eef5' },
    { id: 'pyrite', icon: '🟡', rarity: 'frequent', shape: 'cubes', accent: '#e3c13a' },
    { id: 'iron', icon: '⚙️', rarity: 'frequent', shape: 'ore', accent: '#8fa3b5' },
    { id: 'copper', icon: '🟠', rarity: 'frequent', shape: 'nugget', accent: '#e08a4f' },
    { id: 'tin', icon: '🥫', rarity: 'frequent', shape: 'ingots', accent: '#b9c4c9' },
    { id: 'zinc', icon: '⚪', rarity: 'uncommon', shape: 'ore', accent: '#9fb8c8' },
    { id: 'nickel', icon: '🪙', rarity: 'uncommon', shape: 'nugget', accent: '#b4c0b0' },
    { id: 'lead', icon: '⚫', rarity: 'uncommon', shape: 'ingots', accent: '#7f8db0' },
    { id: 'silver', icon: '🥈', rarity: 'uncommon', shape: 'nugget', accent: '#d5dae0' },
    { id: 'gold', icon: '🥇', rarity: 'rare', shape: 'nugget', accent: '#f2c230' },
    { id: 'platinum', icon: '⚪', rarity: 'rare', shape: 'ingots', accent: '#cfe3ee' },
    { id: 'titanium', icon: '🔩', rarity: 'rare', shape: 'ore', accent: '#8ea2b8' },
    { id: 'cobalt', icon: '🔵', rarity: 'rare', shape: 'ore', accent: '#3b6fe0' },
    { id: 'tungsten', icon: '⚙️', rarity: 'epic', shape: 'ingots', accent: '#a597c9' },
    { id: 'uranium', icon: '☢️', rarity: 'epic', shape: 'spikes', accent: '#7ddb3a' },
    { id: 'emerald', icon: '💚', rarity: 'epic', shape: 'emerald', accent: '#2ecf80' },
    { id: 'ruby', icon: '❤️', rarity: 'epic', shape: 'round', accent: '#e0314b' },
    { id: 'sapphire', icon: '💙', rarity: 'epic', shape: 'cushion', accent: '#4a90ff' },
    { id: 'diamond', icon: '💎', rarity: 'legendary', shape: 'brilliant', accent: '#8be6ff' },
    { id: 'rhodium', icon: '⚪', rarity: 'legendary', shape: 'orb', accent: '#e6d8c8' },
    { id: 'iridium', icon: '🌑', rarity: 'legendary', shape: 'orb', accent: '#8a7cf0' },
    { id: 'meteorite', icon: '☄️', rarity: 'legendary', shape: 'meteor', accent: '#ff7a3d' },
    { id: 'stellar', icon: '🌠', rarity: 'mythic', shape: 'star', accent: '#ffe27a' },
    { id: 'mithril', icon: '✨', rarity: 'mythic', shape: 'spikes', accent: '#7fe0d0' },
    { id: 'vibranite', icon: '🟣', rarity: 'mythic', shape: 'crystal', accent: '#b05cff' },
    { id: 'plasmite', icon: '🔮', rarity: 'mythic', shape: 'orb', accent: '#ff4fd8' },
    { id: 'unobtainium', icon: '🟦', rarity: 'divine', shape: 'octa', accent: '#5ad0ff' },
    // Un tramo más allá del final: se abre al hacer `unlockPrestiges` renaceres (ver Game.isMineralAvailable).
    { id: 'aether', icon: '🌫️', rarity: 'transcendent', shape: 'orb', accent: '#b8f0ff', unlockPrestiges: 25 },
    { id: 'chronite', icon: '🕰️', rarity: 'transcendent', shape: 'octa', accent: '#ffd6a0', unlockPrestiges: 25 },
    { id: 'darkstar', icon: '🪐', rarity: 'transcendent', shape: 'star', accent: '#7a6bff', unlockPrestiges: 25 },
    { id: 'quasar', icon: '💫', rarity: 'transcendent', shape: 'spikes', accent: '#ff8be0', unlockPrestiges: 25 },
    { id: 'nebulite', icon: '🌌', rarity: 'transcendent', shape: 'crystal', accent: '#6be0ff', unlockPrestiges: 25 },
    { id: 'anima', icon: '🌟', rarity: 'transcendent', shape: 'brilliant', accent: '#fff1a8', unlockPrestiges: 25 },
    { id: 'genesium', icon: '🧬', rarity: 'transcendent', shape: 'emerald', accent: '#8dff9a', unlockPrestiges: 25 },
    { id: 'omega', icon: '🔷', rarity: 'transcendent', shape: 'cushion', accent: '#c9d4ff', unlockPrestiges: 25 },
  ],

  // Clic
  click: { base: 1 },

  // Golpe crítico (se abre con el hito 'crit'): cada clic tiene `chance` de valer ×`mult`.
  // Solo cuenta el clic manual: ni el Autominero ni lo que se gana offline.
  crit: { chance: 0.08, mult: 5 },

  // ── Eventos (js/events.js) ───────────────────────────────
  // Todo es temporal y opcional: no se guarda y nunca bloquea. Se abre con el hito 'golden'.
  events: {
    maxTickSeconds: 5, // un tick más largo (pestaña oculta, equipo suspendido) apenas adelanta los eventos
    // Mineral dorado: cruza la pantalla cada cierto tiempo; si lo tocas, una recompensa al azar (por `weight`).
    golden: {
      firstDelay: 40,       // segundos hasta el primero tras abrirse el hito (o tras cargar la partida)
      minInterval: 90,      // luego, entre `minInterval` y `maxInterval` segundos (× habilidad 'goldenRate')
      maxInterval: 180,
      lifetime: 10,         // segundos que tarda en cruzar la pantalla (si no lo tocas, se va)
      rewards: [
        // Frenesí: la producción y el clic valen ×`mult` durante `seconds` (× habilidad 'goldenPower')
        { id: 'frenzy', weight: 6, mult: 5, seconds: 15 },
        // Botín: de golpe, `seconds` segundos de tu producción (o `minClicks` clics si aún produces poco)
        { id: 'lump', weight: 4, seconds: 60, minClicks: 30 },
      ],
    },
  },

  // ── Misiones (js/missions.js) ────────────────────────────
  missions: {
    // Misiones de inicio: un recorrido guiado, una detrás de otra; al cumplir cada una se cobra `cash` (minerales
    // fijos y pequeños) y sale la siguiente. Condición: clicks | producer + count | upgrades | mineral.
    // Las partidas que ya llevan un rato jugadas no las ven. Textos en js/lang/ ('intro.<id>').
    intro: [
      { id: 'click', clicks: 10, cash: 25 },
      { id: 'novice', producer: 'novice', count: 1, cash: 60 },
      { id: 'upgrade', upgrades: 1, cash: 120 },
      { id: 'sand', mineral: 'sand', cash: 2_000 },
    ],
    // Objetivos diarios: cada día salen `count` de contadores distintos (elegidos con una semilla del día entre
    // los que el jugador ya tiene abiertos) y de cada uno una variante. Se miden desde que empieza el día.
    // La recompensa son `seconds` segundos de tu producción de ahora (o `minClicks` clics si produces poco).
    // counter: clicks | play (segundos) | bought (unidades compradas) | crit | golden | prestige.
    // `requires`: novedad (feature) que debe estar abierta. Nombres en js/lang/ ('goal.<counter>').
    daily: {
      count: 3,
      allBonus: { seconds: 300, minClicks: 100 }, // extra al reclamar los tres
      gift: { seconds: 120, minClicks: 50, maxStreak: 7 }, // regalo de entrada × días de racha (hasta `maxStreak`)
      pool: [
        { id: 'clicks-a', counter: 'clicks', target: 200, seconds: 90, minClicks: 30 },
        { id: 'clicks-b', counter: 'clicks', target: 600, seconds: 180, minClicks: 60 },
        { id: 'play-a', counter: 'play', target: 600, seconds: 90, minClicks: 30 },
        { id: 'play-b', counter: 'play', target: 1500, seconds: 180, minClicks: 60 },
        { id: 'bought-a', counter: 'bought', target: 40, seconds: 90, minClicks: 30 },
        { id: 'bought-b', counter: 'bought', target: 150, seconds: 180, minClicks: 60 },
        { id: 'crit-a', counter: 'crit', target: 10, seconds: 120, minClicks: 40, requires: 'crit' },
        { id: 'crit-b', counter: 'crit', target: 30, seconds: 240, minClicks: 80, requires: 'crit' },
        { id: 'golden-a', counter: 'golden', target: 1, seconds: 120, minClicks: 40, requires: 'golden' },
        { id: 'golden-b', counter: 'golden', target: 3, seconds: 240, minClicks: 80, requires: 'golden' },
        { id: 'prestige-a', counter: 'prestige', target: 1, seconds: 300, minClicks: 100, requires: 'rebirth' },
      ],
    },
  },

  // ── Hitos ────────────────────────────────────────────────
  // Cada hito se cumple al llegar a un mineral y abre algo nuevo (`feature`), no solo números.
  // Una vez cumplido no se pierde al renacer. Nombre y descripción en js/lang/ ('milestone.<id>').
  // `toast: false` = sin aviso propio (renacer ya tiene el suyo).
  milestones: [
    { id: 'golden', icon: '✨', mineral: 'sand', feature: 'golden' },
    { id: 'crit', icon: '🎯', mineral: 'clay', feature: 'crit' },
    { id: 'report', icon: '📊', mineral: 'coal', feature: 'report' },
    { id: 'rebirth', icon: '🔄', mineral: 'iron', feature: 'rebirth', toast: false },
  ],

  // Efectos visuales del clic
  ui: {
    floaterMs: 900,  // duración del "+N" flotante
    sparkMs: 450,    // duración de las chispas
    sparks: 3,       // chispas por clic (base)
    sparksPerLevel: 0.5, // chispas extra por nivel de rareza
    maxEffects: 60,  // tope de nodos de efecto a la vez (protege con clics muy rápidos)
    toastMs: 3200,   // cuánto se ve el aviso de mineral desbloqueado
    achToastMs: 2800, // cuánto se ve cada aviso de logro (si hay varios, van en cola)
    burstSparks: 12, // chispas de la celebración al desbloquear un mineral
    burstReach: 1.8, // lo lejos que llegan, respecto a las del clic
    dust: 1,         // partículas de fondo: 0 = ninguna, 1 = las del bioma (config.biomes), 0.5 = la mitad…
  },

  // ── Tarjeta compartible (js/share.js, js/share-ui.js) ────
  // `title` sale en la imagen y en el texto; `url` se añade si hay (ponla al publicar el juego); `size` en px.
  share: { title: 'Ore Clicker', url: 'https://oreclicker.com', size: [1080, 1350] },

  // ── Mineralpedia (js/dex.js) ─────────────────────────────
  // El álbum de minerales descubiertos (datos curiosos en js/lang/, 'fact.<id>'). Cada bioma completo
  // (todos sus minerales descubiertos, en cualquier vuelta) da `biomeBonus` de producción global para siempre.
  dex: { biomeBonus: 0.02 },

  // ── Anuncios (js/ads.js, js/ads-ui.js) ───────────────────
  // provider: 'none' (sin anuncios: no se carga nada, no se enseña nada) | 'adsterra' (solo banner) | 'adsense'
  // (Google AdSense, sin probar; ver README.md) | 'test' (anuncios simulados para probar el flujo; NO publiques
  // con esto: da recompensas gratis).
  // En el equipo local, ?ads=test en la dirección activa el de prueba sin tocar esto.
  // Los anuncios solo se cargan si el jugador los acepta. Los recompensados nunca salen dentro de un reto.
  ads: {
    provider: 'adsterra',
    adsterra: { key: '330411031c68ccc27bd53664868d6d7c', src: 'https://bauval.org/22/330411031c68ccc27bd53664868d6d7c', width: 320, height: 50 }, // el código de «Banner» de tu panel de Adsterra
    adsense: { client: '', bannerSlot: '' }, // ca-pub-… de tu cuenta y el id del bloque de anuncio del banner
    banner: true, // banner discreto abajo (solo con proveedor y consentimiento)
    startDelaySeconds: 1, // el aviso de consentimiento y el banner aparecen a 1 s de entrar en la web
    testSeconds: 3, // lo que dura el anuncio de prueba
    rewards: {
      offline: { enabled: true }, // duplicar las ganancias de estar fuera
      gift: { enabled: true }, // duplicar el regalo de entrada diario
      boost: { enabled: true, mult: 2, seconds: 120, cooldown: 600 }, // ×2 a todo durante 2 min, uno cada 10 min
    },
  },

  // ── Retos especiales (js/challenges.js) ──────────────────
  // Una vuelta aparte y "limpia" (sin habilidades, álbumes, logros ni eventos) con reglas propias; al llegar al mineral
  // `goal` (o gana `earned` minerales) se completa y da una mejora permanente (`reward`). La vuelta de verdad se guarda y se recupera al salir.
  // rules: noProducers | noUpgrades | maxProducers: N (solo los N primeros) | costGrowth: factor de coste por unidad.
  // `limit`: segundos para completarlo (0 = sin límite). reward.type: globalMult | clickMult | costMult | goldenRate (×valor)
  // u offlineRate (+valor). Nombres y descripciones en js/lang/ ('challenge.<id>').
  challenges: [
    { id: 'clicks', icon: '👆', earned: 2_500, limit: 0, rules: { noProducers: true }, reward: { type: 'clickMult', value: 2 } },
    { id: 'rush', icon: '⏱️', goal: 'clay', limit: 780, rules: {}, reward: { type: 'goldenRate', value: 0.8 } },
    { id: 'bare', icon: '🪨', goal: 'clay', limit: 0, rules: { noUpgrades: true }, reward: { type: 'globalMult', value: 1.1 } },
    { id: 'few', icon: '🧱', goal: 'clay', limit: 0, rules: { maxProducers: 2 }, reward: { type: 'costMult', value: 0.9 } },
    { id: 'inflation', icon: '📈', goal: 'limestone', limit: 0, rules: { costGrowth: 1.3 }, reward: { type: 'globalMult', value: 1.15 } },
    { id: 'purist', icon: '🧘', goal: 'clay', limit: 0, rules: { noUpgrades: true, maxProducers: 4 }, reward: { type: 'globalMult', value: 1.25 } },
  ],

  // ── Catálogo de maquinaria (js/catalog.js) ───────────────
  // Segundo álbum, con un dato curioso por productor (js/lang/, 'machine.<id>'). Un productor se descubre al
  // tener uno. Las eras agrupan productores seguidos (desde `from` hasta el `from` de la siguiente) y cada era
  // completa da `eraBonus` de producción global para siempre. Nombres en js/lang/ ('era.<id>').
  catalog: {
    eraBonus: 0.02,
    eras: [
      { id: 'manual', icon: '⛏️', from: 'novice' },
      { id: 'industrial', icon: '🏭', from: 'excavator' },
      { id: 'tech', icon: '🛸', from: 'laser' },
      { id: 'space', icon: '🚀', from: 'robot' },
      { id: 'cosmic', icon: '🌌', from: 'fleet' },
      { id: 'fantasy', icon: '🐉', from: 'oracle' },
      { id: 'beyond', icon: '♾️', from: 'timeloop' },
    ],
  },

  // ── Biomas ───────────────────────────────────────────────
  // La escalera de minerales se ve como un descenso: cada bioma agrupa los minerales desde `from` hasta el
  // `from` del siguiente, y cambia el fondo (paleta) y las partículas. Nombres en js/lang/ ('biome.<id>').
  // palette: colores de fondo y paneles (la interfaz los anima al cambiar de bioma).
  // fx: partículas de fondo. kind: dust | drip | glint | snow | sparkle | ember | stars (ver css/style.css);
  //     `count` partículas, de `size` px y `seconds` de ciclo (mín, máx), con un color de `colors` al azar.
  biomes: [
    { id: 'earth', icon: '🌱', from: 'gravel',
      palette: { bg: '#14110f', bgDeep: '#0c0a09', glow: '#2d2420', panel: '#221d19', panelRaised: '#2b2520', line: '#3a322b' },
      fx: { kind: 'dust', count: 8, size: [2, 5], seconds: [16, 34] } },
    { id: 'cave', icon: '🕳️', from: 'quartz',
      palette: { bg: '#10131a', bgDeep: '#080a0f', glow: '#1f2a3d', panel: '#181c25', panelRaised: '#212631', line: '#2d3442' },
      fx: { kind: 'drip', count: 10, size: [2, 3], seconds: [6, 12], colors: ['#9ec9ff'] } },
    { id: 'vein', icon: '⛏️', from: 'zinc',
      palette: { bg: '#17120a', bgDeep: '#0d0a05', glow: '#3a2c10', panel: '#231c10', panelRaised: '#2d2414', line: '#4a3a1c' },
      fx: { kind: 'glint', count: 14, size: [3, 5], seconds: [3, 6], colors: ['#ffd76a', '#fff1b0'] } },
    { id: 'glacier', icon: '❄️', from: 'platinum',
      palette: { bg: '#0d1620', bgDeep: '#060b11', glow: '#1d3a52', panel: '#15212d', panelRaised: '#1c2b3a', line: '#2b4155' },
      fx: { kind: 'snow', count: 24, size: [3, 6], seconds: [9, 17], colors: ['#ffffff'] } },
    { id: 'crystal', icon: '💎', from: 'emerald',
      palette: { bg: '#150f20', bgDeep: '#0a0710', glow: '#3a1f5c', panel: '#1f1730', panelRaised: '#291f3d', line: '#3d2f58' },
      fx: { kind: 'sparkle', count: 16, size: [4, 8], seconds: [2.5, 5], colors: ['#ff7ad9', '#7affd9', '#9a8cff', '#ffe27a'] } },
    { id: 'magma', icon: '🌋', from: 'rhodium',
      palette: { bg: '#1a0d0a', bgDeep: '#0d0605', glow: '#5a1e0c', panel: '#271512', panelRaised: '#321b16', line: '#55261c' },
      fx: { kind: 'ember', count: 18, size: [2, 4], seconds: [5, 10], colors: ['#ff7a2e', '#ffb347', '#ff4a1c'] } },
    { id: 'space', icon: '🌌', from: 'stellar',
      palette: { bg: '#080a16', bgDeep: '#03040a', glow: '#1a1f4a', panel: '#10142a', panelRaised: '#171c38', line: '#272e58' },
      fx: { kind: 'stars', count: 44, size: [1.5, 3], seconds: [2, 5], colors: ['#ffffff', '#cfe3ff', '#fff2c2'] } },
    { id: 'beyond', icon: '🪐', from: 'aether',
      palette: { bg: '#0d0816', bgDeep: '#05030a', glow: '#4a1a6e', panel: '#1a1026', panelRaised: '#24163a', line: '#43275f' },
      fx: { kind: 'glint', count: 30, size: [3, 7], seconds: [2.5, 6], colors: ['#ff9bf5', '#9bf3ff', '#ffffff'] } },
  ],

  // La escalera sigue más allá del último mineral: `count` rangos más ("Omega 2", "Omega 3"…), cada uno con un
  // umbral ×`growth` y el valor ×valueGrowth del anterior, y el color girado `hue` grados. Se abren con los mismos
  // renaceres que el tramo final. Así el objetivo de renacer puede seguir creciendo mientras haya Núcleos que gastar.
  endless: { count: 60, growth: 4.7, hue: 17 },

  // Cantidades del selector de compra de productores ('max' = todo lo que puedas pagar).
  buyAmounts: [1, 10, 100, 'max'],

  // Productores: coste(n) = baseCost × costGrowth^n, n = unidades ya compradas.
  // `costGrowth` por productor es opcional; si falta se usa `defaultCostGrowth`.
  // Referencia de balanceo: el coste por cada 1/s del primer ejemplar sube ~×2,2 por escalón.
  // Se descubren de uno en uno: ver Game.getProducerVisibility.
  defaultCostGrowth: 1.15,
  producers: [
    { id: 'novice', icon: '⛏️', baseCost: 15,                  baseProduction: 1 },
    { id: 'barrow', icon: '🛴', baseCost: 100,                 baseProduction: 3 },
    { id: 'cart', icon: '🚃', baseCost: 1_100,               baseProduction: 15 },
    { id: 'drill', icon: '🔩', baseCost: 12_000,              baseProduction: 80 },
    { id: 'mine', icon: '🕳️', baseCost: 130_000,             baseProduction: 390 },
    { id: 'excavator', icon: '🚧', baseCost: 1_400_000,           baseProduction: 1_900 },
    { id: 'industrial', icon: '🏭', baseCost: 20_000_000,          baseProduction: 13_000 },
    { id: 'conveyor', icon: '📦', baseCost: 330_000_000,         baseProduction: 94_000 },
    { id: 'plant', icon: '🏗️', baseCost: 5_100_000_000,       baseProduction: 660_000 },
    { id: 'openpit', icon: '🌄', baseCost: 75_000_000_000,      baseProduction: 4_400_000 },
    { id: 'laser', icon: '🔴', baseCost: 1e12,                baseProduction: 27_000_000 },
    { id: 'drone', icon: '🛸', baseCost: 1.4e13,              baseProduction: 170_000_000 },
    { id: 'nanobots', icon: '🦠', baseCost: 1.7e14,              baseProduction: 940_000_000 },
    { id: 'core', icon: '🌍', baseCost: 2.1e15,              baseProduction: 5.3e9 },
    { id: 'orbital', icon: '🛰️', baseCost: 2.6e16,              baseProduction: 3e10 },
    { id: 'wormhole', icon: '🌀', baseCost: 3.1e17,              baseProduction: 1.6e11 },
    // 17-50: cada uno cuesta ×12 y produce ×5,5 que el anterior (como los de arriba). Se abren con el avance de la escalera.
    { id: 'robot', icon: '🤖', baseCost: 3.7e18, baseProduction: 8.8e11 },
    { id: 'shuttle', icon: '🚀', baseCost: 4.5e19, baseProduction: 4.8e12 },
    { id: 'harvester', icon: '☄️', baseCost: 5.4e20, baseProduction: 2.7e13 },
    { id: 'colony', icon: '🌙', baseCost: 6.4e21, baseProduction: 1.5e14 },
    { id: 'rings', icon: '🪐', baseCost: 7.7e22, baseProduction: 8.1e14 },
    { id: 'solar', icon: '☀️', baseCost: 9.3e23, baseProduction: 4.4e15 },
    { id: 'fusion', icon: '⚛️', baseCost: 1.1e25, baseProduction: 2.4e16 },
    { id: 'accelerator', icon: '⚡', baseCost: 1.3e26, baseProduction: 1.3e17 },
    { id: 'magnet', icon: '🧲', baseCost: 1.6e27, baseProduction: 7.4e17 },
    { id: 'supernova', icon: '💥', baseCost: 1.9e28, baseProduction: 4.1e18 },
    { id: 'fleet', icon: '🌌', baseCost: 2.3e29, baseProduction: 2.2e19 },
    { id: 'timedigger', icon: '🕰️', baseCost: 2.8e30, baseProduction: 1.2e20 },
    { id: 'blackhole', icon: '⚫', baseCost: 3.3e31, baseProduction: 6.7e20 },
    { id: 'biovein', icon: '🧬', baseCost: 4e32, baseProduction: 3.7e21 },
    { id: 'hive', icon: '🧠', baseCost: 4.8e33, baseProduction: 2e22 },
    { id: 'aliens', icon: '👽', baseCost: 5.7e34, baseProduction: 1.1e23 },
    { id: 'starfisher', icon: '🌠', baseCost: 6.9e35, baseProduction: 6.2e23 },
    { id: 'alchemist', icon: '🪄', baseCost: 8.3e36, baseProduction: 3.4e24 },
    { id: 'oracle', icon: '🔮', baseCost: 9.9e37, baseProduction: 1.9e25 },
    { id: 'rainbow', icon: '🌈', baseCost: 1.2e39, baseProduction: 1e26 },
    { id: 'dragon', icon: '🐉', baseCost: 1.4e40, baseProduction: 5.6e26 },
    { id: 'dwarves', icon: '🏰', baseCost: 1.7e41, baseProduction: 3.1e27 },
    { id: 'improbability', icon: '🎰', baseCost: 2.1e42, baseProduction: 1.7e28 },
    { id: 'antenna', icon: '📡', baseCost: 2.5e43, baseProduction: 9.4e28 },
    { id: 'eye', icon: '🧿', baseCost: 3e44, baseProduction: 5.2e29 },
    { id: 'timeloop', icon: '⏳', baseCost: 3.5e45, baseProduction: 2.8e30 },
    { id: 'trident', icon: '🔱', baseCost: 4.3e46, baseProduction: 1.6e31 },
    { id: 'mirror', icon: '🪞', baseCost: 5.1e47, baseProduction: 8.6e31 },
    { id: 'thread', icon: '🧵', baseCost: 6.1e48, baseProduction: 4.7e32 },
    { id: 'book', icon: '📖', baseCost: 7.4e49, baseProduction: 2.6e33 },
    { id: 'infinity', icon: '♾️', baseCost: 8.8e50, baseProduction: 1.4e34 },
    { id: 'worldtree', icon: '🌳', baseCost: 1.1e52, baseProduction: 7.9e34 },
    { id: 'egg', icon: '🥚', baseCost: 1.3e53, baseProduction: 4.3e35 },
    { id: 'bigbang', icon: '💫', baseCost: 1.5e54, baseProduction: 2.4e36 },
  ],

  // ── Mejoras ──────────────────────────────────────────────
  // effect.type: 'clickAdd' (+N por clic) | 'clickMult' (×N al clic) | 'clickPps' (el clic suma
  // además esa fracción de tu producción/s) | 'globalMult' (×N a clic y producción) |
  // 'producerMult' (×N a un productor, solo en las generadas por `producerUpgradeTiers`).
  // Se compran una vez. Sin `unlock` aparecen al haber ganado `cost × upgradeRevealRatio` en total.
  upgradeRevealRatio: 0.5,

  // valor por clic = (base + Σ clickAdd) × Π clickMult × Π globalMult + producción/s × Σ clickPps
  clickUpgrades: [
    { id: 'pick', icon: '⛏️', cost: 50,          effect: { type: 'clickAdd',  value: 1 } },
    { id: 'gloves', icon: '🧤', cost: 500,         effect: { type: 'clickMult', value: 2 } },
    { id: 'steel', icon: '🔨', cost: 5_000,       effect: { type: 'clickAdd',  value: 5 } },
    { id: 'hands1', icon: '🤲', cost: 50_000,      effect: { type: 'clickPps',  value: 0.01 } },
    { id: 'hands2', icon: '🧠', cost: 50_000_000,  effect: { type: 'clickPps',  value: 0.02 } },
    { id: 'hands3', icon: '🏆', cost: 5e11,        effect: { type: 'clickPps',  value: 0.05 } },
  ],

  // Potenciadores globales: multiplican clic y producción a la vez.
  globalUpgrades: [
    { id: 'dynamite', icon: '🧨', cost: 100_000, effect: { type: 'globalMult', value: 2 } },
    { id: 'explosives', icon: '💥', cost: 1e8,     effect: { type: 'globalMult', value: 2 } },
    { id: 'nitro', icon: '⚗️', cost: 1e11,    effect: { type: 'globalMult', value: 2 } },
    { id: 'plasma', icon: '🔥', cost: 1e14,    effect: { type: 'globalMult', value: 2 } },
    { id: 'antimatter', icon: '⚛️', cost: 1e17,    effect: { type: 'globalMult', value: 2 } },
    { id: 'quantum', icon: '🔬', cost: 1e23,    effect: { type: 'globalMult', value: 2 } },
    { id: 'singularity', icon: '⚫', cost: 1e29,    effect: { type: 'globalMult', value: 2 } },
    { id: 'shockwave', icon: '☄️', cost: 1e35,    effect: { type: 'globalMult', value: 2 } },
    { id: 'darkmatter', icon: '🌑', cost: 1e41,    effect: { type: 'globalMult', value: 2 } },
    { id: 'multiverse', icon: '🌌', cost: 1e47,    effect: { type: 'globalMult', value: 2 } },
    { id: 'timewarp', icon: '⏳', cost: 1e53,    effect: { type: 'globalMult', value: 2 } },
    { id: 'primordial', icon: '💥', cost: 1e59,    effect: { type: 'globalMult', value: 2 } },
  ],

  // Mejoras de productor: cada productor tiene una por escalón, que aparece al tener `at`
  // unidades (de 10 a 1000). Multiplica su producción ×mult y cuesta baseCost × costFactor. A partir de 100
  // unidades el coste es ~4% de lo que cuesta la siguiente unidad (0,04 × 1,15^at), para que siga habiendo una
  // mejora asequible por escalón por muy caras que sean las unidades.
  producerGoldAt: 100, // unidades a partir de las que un productor se ve dorado en la tienda
  producerUpgradeTiers: [
    { at: 10,   label: 'I',    mult: 2, costFactor: 50 },
    { at: 25,   label: 'II',   mult: 2, costFactor: 500 },
    { at: 50,   label: 'III',  mult: 2, costFactor: 5_000 },
    { at: 100,  label: 'IV',   mult: 2, costFactor: 50_000 },
    { at: 150,  label: 'V',    mult: 2, costFactor: 5.1e7 },
    { at: 200,  label: 'VI',   mult: 2, costFactor: 5.5e10 },
    { at: 250,  label: 'VII',  mult: 2, costFactor: 6e13 },
    { at: 300,  label: 'VIII', mult: 2, costFactor: 6.5e16 },
    { at: 400,  label: 'IX',   mult: 2, costFactor: 7.6e22 },
    { at: 500,  label: 'X',    mult: 2, costFactor: 8.9e28 },
    { at: 600,  label: 'XI',   mult: 2, costFactor: 1e35 },
    { at: 750,  label: 'XII',  mult: 2, costFactor: 1.3e44 },
    { at: 1000, label: 'XIII', mult: 2, costFactor: 2e59 },
  ],

  // Sinergias: cada productor (del 2º en adelante) trae una mejora que hace que cada unidad suya aumente la
  // producción del productor anterior en `perUnit` (0.02 = +2% por unidad). Sale al tener `needSource`
  // unidades del que ayuda y `needTarget` del que recibe, y cuesta baseCost del que ayuda × `costFactor`.
  synergy: { perUnit: 0.02, needSource: 20, needTarget: 10, costFactor: 400 },

  // ── Prestigio (renacer) ──────────────────────────────────
  // Renacer reinicia la vuelta (moneda, productores, mejoras, mineral) y conserva los Núcleos, las
  // habilidades, el contador de prestigios, los logros, los clics totales, el tiempo jugado y los ajustes.
  // Los Núcleos se gastan en el árbol de habilidades (`skills`), que es permanente.
  prestige: {
    coreIcon: '💠',            // icono de los Núcleos
    firstMineral: 'iron',      // mineral que hay que alcanzar para renacer; al llegar aparece el botón
    mineralsPerPrestige: 0.5,  // cada renacer exige llegar a tantos minerales más lejos (0.5 = uno más cada 2)
    targetHeadroom: 3,         // el mineral exigido nunca pasa de (último − esto): así al final siempre se puede ir más lejos y ganar más Núcleos
    mineralsPerCore: 2,        // 1 Núcleo base + 1 más por cada N minerales por encima del exigido
    // Tope de Núcleos por renacer: vale el último tramo cuyo `from` (nº del renacer) ya se ha alcanzado.
    // Cada tramo puede traer su propio `mineralsPerCore`; de los 20 renaceres en adelante cuesta un solo mineral
    // más por Núcleo, para que los topes altos se puedan alcanzar de verdad (ver tools/sim-prestige.js).
    coreCaps: [
      { from: 1, max: 3 },
      { from: 10, max: 5 },
      { from: 20, max: 8, mineralsPerCore: 1 },
    ],
    // Desbloqueos por número de prestigios hechos: una mecánica (`feature`), una habilidad (`skill`) o un tramo nuevo
    // de la escalera (`biome`: sus minerales llevan `unlockPrestiges` con el mismo número).
    unlocks: [
      { at: 10, feature: 'autoMiner' },
      { at: 15, skill: 'legacy' },
      { at: 25, skill: 'stellar' },
      { at: 25, biome: 'beyond' },
      { at: 30, skill: 'forge' },
      { at: 35, skill: 'fortune' },
      { at: 40, skill: 'eternal' },
    ],
    autoMiner: { clicksPerSecond: 3 }, // el Autominero pica solo tantas veces por segundo (valor de clic completo)

    // Habilidades permanentes. Cada nivel trae su coste en Núcleos y el valor TOTAL del efecto en ese nivel
    // (no se suma al del anterior). effect.type:
    //   globalMult (×N a clic y producción) | clickMult (×N al clic) | costMult (×N al coste de productores)
    //   offlineRate (+N a la fracción offline) | prestigeMult (+N de producción por cada prestigio hecho)
    //   goldenRate (×N al tiempo entre minerales dorados) | goldenPower (×N a sus recompensas)
    //   synergyMult (×N a la fuerza de las sinergias) | critChance (+N a la probabilidad de crítico)
    //   startCash (moneda al renacer) | startProducers ({ id: unidades } al renacer)
    skills: [
      { id: 'power', icon: '⛰️', type: 'globalMult', levels: [
        { cost: 1, value: 3 }, { cost: 2, value: 6 }, { cost: 3, value: 12 }, { cost: 5, value: 25 }, { cost: 8, value: 50 },
        { cost: 12, value: 90 }, { cost: 18, value: 160 }, { cost: 26, value: 300 },
      ] },
      { id: 'strike', icon: '🔨', type: 'clickMult', levels: [
        { cost: 1, value: 2 }, { cost: 2, value: 3 }, { cost: 4, value: 5 }, { cost: 6, value: 8 }, { cost: 10, value: 12 },
        { cost: 14, value: 18 }, { cost: 20, value: 27 },
      ] },
      { id: 'discount', icon: '🏷️', type: 'costMult', levels: [
        { cost: 2, value: 0.85 }, { cost: 4, value: 0.7 }, { cost: 7, value: 0.55 }, { cost: 12, value: 0.4 },
        { cost: 18, value: 0.3 }, { cost: 26, value: 0.22 },
      ] },
      { id: 'dream', icon: '🌙', type: 'offlineRate', levels: [
        { cost: 1, value: 0.05 }, { cost: 3, value: 0.1 }, { cost: 6, value: 0.2 },
      ] },
      { id: 'fund', icon: '💰', type: 'startCash', levels: [
        { cost: 1, value: 2_000 }, { cost: 3, value: 200_000 }, { cost: 6, value: 2e7 },
      ] },
      { id: 'crew', icon: '👷', type: 'startProducers', levels: [
        { cost: 2, value: { novice: 10 } },
        { cost: 4, value: { novice: 25, barrow: 10, cart: 5 } },
        { cost: 8, value: { novice: 50, barrow: 25, cart: 15, drill: 10, mine: 5 } },
      ] },
      { id: 'goldRate', icon: '🌟', type: 'goldenRate', levels: [
        { cost: 2, value: 0.85 }, { cost: 4, value: 0.7 }, { cost: 7, value: 0.55 },
      ] },
      { id: 'goldPower', icon: '🏅', type: 'goldenPower', levels: [
        { cost: 2, value: 1.5 }, { cost: 5, value: 2 }, { cost: 9, value: 3 },
      ] },
      { id: 'legacy', icon: '🏺', type: 'prestigeMult', levels: [
        { cost: 5, value: 0.02 }, { cost: 10, value: 0.04 },
      ] },
      { id: 'stellar', icon: '⭐', type: 'globalMult', levels: [
        { cost: 12, value: 3 }, { cost: 25, value: 6 },
      ] },
      // Del tramo final (se abren a los 30, 35 y 40 renaceres):
      { id: 'forge', icon: '⚒️', type: 'synergyMult', levels: [
        { cost: 8, value: 1.5 }, { cost: 14, value: 2 }, { cost: 22, value: 3 },
      ] },
      { id: 'fortune', icon: '🍀', type: 'critChance', levels: [
        { cost: 10, value: 0.04 }, { cost: 16, value: 0.08 }, { cost: 24, value: 0.12 },
      ] },
      // Sumidero de Núcleos sin fin práctico: 30 niveles, cada uno ×1,1 y un 10% más caro que el anterior.
      { id: 'eternal', icon: '♾️', type: 'globalMult', levels: Array.from({ length: 30 }, (_, i) => ({ cost: Math.ceil(5 * Math.pow(1.1, i)), value: Math.pow(1.1, i + 1) })) },
    ],
  },

  // ── Logros ───────────────────────────────────────────────
  // Metas con una pequeña recompensa: +`bonus` de producción global por cada `per` logros.
  // Cada logro tiene id, icono y UNA condición, de estos tipos:
  //   clicks: N (clics totales)        earned: N (total ganado)       mineral: 'id' (mineral alcanzado)
  //   producer: 'id', count: N         allProducers: N (N de cada uno)  upgrades: N (mejoras compradas)
  //   playTime: segundos               offline: true (volver tras estar fuera)   pps: N (producción/s)
  // Los de mineral y productor usan el icono del mineral/productor si no traen `icon`.
  // Nombres en js/lang/ (clave 'ach.<id>'); la descripción se compone sola desde la condición.
  achievementBonus: { per: 5, bonus: 0.01 },
  achievements: [
    { id: 'clicks-1',    icon: '👆', clicks: 1 },
    { id: 'clicks-1k',   icon: '🔨', clicks: 1_000 },
    { id: 'clicks-10k',  icon: '💪', clicks: 10_000 },
    { id: 'clicks-100k', icon: '🦾', clicks: 100_000 },
    { id: 'clicks-1m',   icon: '🌋', clicks: 1_000_000 },

    { id: 'earned-1k',  icon: '🪙', earned: 1e3 },
    { id: 'earned-1m',  icon: '💵', earned: 1e6 },
    { id: 'earned-1b',  icon: '💰', earned: 1e9 },
    { id: 'earned-1t',  icon: '🏦', earned: 1e12 },
    { id: 'earned-1qi', icon: '👑', earned: 1e18 },
    { id: 'earned-1sp', icon: '🌟', earned: 1e24 },
    { id: 'earned-1no', icon: '🌌', earned: 1e30 },
    { id: 'earned-1ud', icon: '♾️', earned: 1e36 },
    { id: 'earned-1e42', icon: '🪐', earned: 1e42 },
    { id: 'earned-1e48', icon: '🌀', earned: 1e48 },
    { id: 'earned-1e54', icon: '💠', earned: 1e54 },
    { id: 'earned-1e60', icon: '🔱', earned: 1e60 },

    { id: 'mineral-sand',         mineral: 'sand' },
    { id: 'mineral-quartz',       mineral: 'quartz' },
    { id: 'mineral-zinc',         mineral: 'zinc' },
    { id: 'mineral-gold',         mineral: 'gold' },
    { id: 'mineral-tungsten',     mineral: 'tungsten' },
    { id: 'mineral-diamond',      mineral: 'diamond' },
    { id: 'mineral-stellar',      mineral: 'stellar' },
    { id: 'mineral-unobtainium',  mineral: 'unobtainium' },
    { id: 'mineral-aether',       mineral: 'aether' },
    { id: 'mineral-omega',        mineral: 'omega' },

    { id: 'producer-novice-100',  producer: 'novice', count: 100 },
    { id: 'producer-drone-1',     producer: 'drone', count: 1 },
    { id: 'producer-wormhole-1',  producer: 'wormhole', count: 1 },
    { id: 'producer-all-10',      icon: '🧰', allProducers: 10 },
    { id: 'producer-all-50',      icon: '🏆', allProducers: 50 },
    { id: 'producer-bigbang-1',   producer: 'bigbang', count: 1 },
    { id: 'producer-all-100',     icon: '🏅', allProducers: 100 },
    { id: 'producer-novice-1000', producer: 'novice', count: 1000 },

    { id: 'upgrades-10', icon: '🔧', upgrades: 10 },
    { id: 'upgrades-25', icon: '🛠️', upgrades: 25 },
    { id: 'upgrades-50', icon: '⚒️', upgrades: 50 },
    { id: 'upgrades-75', icon: '🎖️', upgrades: 75 },
    { id: 'upgrades-150', icon: '🔨', upgrades: 150 },
    { id: 'upgrades-300', icon: '🧰', upgrades: 300 },
    { id: 'upgrades-500', icon: '🧪', upgrades: 500 },

    { id: 'play-1h',   icon: '⏱️', playTime: 3600 },
    { id: 'play-10h',  icon: '🕰️', playTime: 36_000 },
    { id: 'play-100h', icon: '📅', playTime: 360_000 },

    { id: 'offline-return', icon: '🌙', offline: true },

    { id: 'pps-100',  icon: '📈', pps: 100 },
    { id: 'pps-10k',  icon: '⚡', pps: 1e4 },
    { id: 'pps-1m',   icon: '🔥', pps: 1e6 },
    { id: 'pps-1b',   icon: '🌊', pps: 1e9 },
    { id: 'pps-1t',   icon: '🚀', pps: 1e12 },
    { id: 'pps-1qa',  icon: '🌠', pps: 1e15 },
    { id: 'pps-1e21', icon: '🌊', pps: 1e21 },
    { id: 'pps-1e30', icon: '🌪️', pps: 1e30 },
    { id: 'pps-1e40', icon: '💥', pps: 1e40 },
    { id: 'pps-1e50', icon: '⏳', pps: 1e50 },
  ],
};

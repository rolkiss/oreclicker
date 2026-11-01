// Sonido sintetizado con WebAudio: sin archivos de audio, así que no cuesta nada ni carga nada.
// Los navegadores bloquean el audio hasta el primer gesto del jugador; el contexto se crea y se
// reanuda en ese primer toque, y hasta entonces play() simplemente no suena.
(function (Game) {
  const { config } = Game;
  const cfg = config.sound;

  let ctx = null;
  let master = null;
  let noise = null;
  let voices = 0; // sonidos sonando a la vez (con tope, para no saturar con clics muy rápidos)
  let lastClick = -Infinity;

  const settings = () => Game.state.settings;
  const isOn = () => !!settings().sound && settings().volume > 0;

  // Volumen percibido: curva suave para que la mitad del control sea "bajo" de verdad.
  const levelFor = (volume) => cfg.master * Math.pow(volume, 1.5);

  function getContext() {
    if (ctx) return ctx;
    const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AudioCtx) return null;
    try {
      ctx = new AudioCtx();
    } catch (err) {
      return null;
    }
    master = ctx.createGain();
    master.connect(ctx.destination);
    refresh();
    return ctx;
  }

  // Aplica el volumen de los ajustes (con una rampa corta para evitar chasquidos).
  function refresh() {
    if (!master) return;
    master.gain.setTargetAtTime(levelFor(settings().volume), ctx.currentTime, 0.02);
  }

  // Llamar desde un gesto del jugador: crea el contexto si hace falta y lo reanuda.
  function unlock() {
    if (!isOn()) return;
    const c = getContext();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  // ── Piezas básicas ────────────────────────────────────────
  // Una nota con envolvente rápida de ataque y caída exponencial.
  function tone({ type = 'sine', freq, freqEnd, start = 0, dur = 0.15, gain = 0.5 }) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBuffer() {
    if (!noise) {
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  // Ráfaga de ruido filtrado: el "golpe" del pico contra la roca.
  function hit({ start = 0, dur = 0.05, gain = 0.4, freq = 2000, q = 1 }) {
    const t0 = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ── Sonidos ───────────────────────────────────────────────
  // `pitch` sube un poco con el mineral y varía al azar para que picar no suene a metralleta.
  const recipes = {
    click({ pitch = 1 }) {
      const p = pitch * (0.92 + Math.random() * 0.16);
      hit({ dur: 0.045, gain: 0.5, freq: 1800 * p, q: 0.8 });
      tone({ freq: 170 * p, freqEnd: 70 * p, dur: 0.08, gain: 0.5 });
    },
    buy() {
      tone({ type: 'triangle', freq: 440, dur: 0.09, gain: 0.35 });
      tone({ type: 'triangle', freq: 660, start: 0.07, dur: 0.16, gain: 0.35 });
    },
    unlock() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone({ type: 'triangle', freq, start: i * 0.09, dur: 0.55, gain: 0.3 });
        tone({ freq: freq * 2, start: i * 0.09, dur: 0.35, gain: 0.1 });
      });
    },
    achievement() {
      tone({ freq: 988, dur: 0.7, gain: 0.3 });
      tone({ freq: 1480, dur: 0.5, gain: 0.16 });
      tone({ freq: 1976, start: 0.06, dur: 0.35, gain: 0.1 });
    },
  };

  // Cuánto ocupa cada sonido (s), para contar las voces activas.
  const lengths = { click: 0.12, buy: 0.3, unlock: 1.1, achievement: 0.9 };

  function play(name, options = {}) {
    if (!isOn() || !recipes[name]) return;
    // El contexto solo lo crea unlock() (un gesto del jugador): sin él, silencio y sin avisos del navegador.
    if (!ctx || ctx.state !== 'running') return;

    if (name === 'click') {
      const now = performance.now();
      if (now - lastClick < cfg.clickGapMs) return;
      lastClick = now;
    }
    if (voices >= cfg.maxVoices) return;

    voices++;
    setTimeout(() => { voices--; }, lengths[name] * 1000);
    recipes[name](options);
  }

  // Al ocultar la pestaña se pausa el audio; al volver, se reanuda.
  function init() {
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlock, true);
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
      else unlock();
    });
  }

  Game.sound = { init, play, unlock, refresh, levelFor };
})(window.Game);

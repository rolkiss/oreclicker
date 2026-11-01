// Persistencia en localStorage y códigos de exportar/importar. Nunca lanza al guardar o cargar:
// si el almacenamiento falla o los datos están corruptos, el juego sigue con una partida nueva.
(function (Game) {
  const { config } = Game;

  const NOTATIONS = ['abbreviated', 'scientific'];
  const CODE_ID = 'mineral-clicker';
  const MAX_CODE_LENGTH = 1_000_000;

  const isAmount = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

  // Construye un estado válido a partir de datos guardados. Parte de una partida nueva
  // y solo copia lo reconocible, así que añadir o quitar productores/mejoras en el
  // config no rompe partidas antiguas.
  function sanitize(saved) {
    const state = Game.createState();
    if (isAmount(saved.currency)) state.currency = saved.currency;
    if (isAmount(saved.totalClicks)) state.totalClicks = Math.floor(saved.totalClicks);

    // Las partidas de la versión 1 no tenían totalEarned: lo mejor que se sabe es lo que hay.
    state.totalEarned = isAmount(saved.totalEarned) ? saved.totalEarned : state.currency;
    state.totalEarned = Math.max(state.totalEarned, state.currency);

    const producers = saved.producers || {};
    for (const p of config.producers) {
      if (isAmount(producers[p.id])) state.producers[p.id] = Math.floor(producers[p.id]);
    }

    // Versión 1 guardaba las mejoras de clic en `clickUpgrades`; desde la 2 todas van en `upgrades`
    // (los ids de las 3 mejoras de clic originales se mantienen).
    for (const group of [saved.clickUpgrades, saved.upgrades]) {
      if (!group || typeof group !== 'object') continue;
      for (const id of Object.keys(group)) {
        if (group[id] === true && Game.upgradeById[id]) state.upgrades[id] = true;
      }
    }

    const achievements = saved.achievements;
    if (achievements && typeof achievements === 'object') {
      for (const a of Game.achievements) {
        if (achievements[a.id] === true) state.achievements[a.id] = true;
      }
    }
    const milestones = saved.milestones; // (las partidas anteriores a la 4 no lo traen: se rellenan en el primer tick)
    if (milestones && typeof milestones === 'object') {
      for (const m of Game.milestones) {
        if (milestones[m.id] === true) state.milestones[m.id] = true;
      }
    }
    if (isAmount(saved.playTime)) state.playTime = saved.playTime;

    // Contadores y misiones (versión 6). Una partida anterior que ya tenía progreso se salta las misiones de inicio.
    const st = saved.stats;
    if (st && typeof st === 'object') {
      for (const key of ['bought', 'crits', 'goldens']) if (isAmount(st[key])) state.stats[key] = Math.floor(st[key]);
      if (isAmount(st.lifetime)) state.stats.lifetime = st.lifetime;
      else state.stats.lifetime = state.totalEarned; // versión anterior: lo mejor que se sabe es lo de esta vuelta
    } else {
      state.stats.lifetime = state.totalEarned;
    }
    // Anuncios (versión 12): hora del último frenesí por anuncio (nunca en el futuro: reloj atrasado no bloquea).
    if (saved.ads && typeof saved.ads === 'object' && isAmount(saved.ads.boostAt)) state.ads.boostAt = Math.min(saved.ads.boostAt, Game.obtenerHora());

    // Retos (versión 10): mejores tiempos y, si se cerró el juego en mitad de uno, el reto en curso con la vuelta guardada.
    const ch = saved.challenges;
    if (ch && typeof ch === 'object') {
      const out = state.challenges;
      if (ch.done && typeof ch.done === 'object') {
        for (const c of Game.challenges) if (typeof ch.done[c.id] === 'number' && ch.done[c.id] > 0 && Number.isFinite(ch.done[c.id])) out.done[c.id] = ch.done[c.id];
      }
      const a = ch.active;
      const snap = a && typeof a === 'object' ? a.snapshot : null;
      if (a && Game.challengeById[a.id] && isAmount(a.elapsed) && snap && typeof snap === 'object' && isAmount(snap.currency) && isAmount(snap.totalEarned)) {
        const producers = {};
        for (const p of config.producers) producers[p.id] = isAmount(snap.producers && snap.producers[p.id]) ? Math.floor(snap.producers[p.id]) : 0;
        const upgrades = {};
        for (const id of Object.keys(snap.upgrades || {})) if (snap.upgrades[id] === true && Game.upgradeById[id]) upgrades[id] = true;
        out.active = { id: a.id, elapsed: a.elapsed, snapshot: { currency: snap.currency, totalEarned: Math.max(snap.totalEarned, snap.currency), producers, upgrades } };
      }
    }

    // Catálogo de maquinaria (versión 9). Una partida anterior no lo trae: lo descubierto es hasta el productor más
    // lejano que tiene ahora.
    const cg = saved.catalog;
    if (cg && typeof cg === 'object') {
      if (Number.isInteger(cg.best) && cg.best >= -1) state.catalog.best = Math.min(cg.best, config.producers.length - 1);
      if (Number.isInteger(cg.seen) && cg.seen >= 0) state.catalog.seen = Math.min(cg.seen, state.catalog.best + 1);
    } else {
      let highest = -1;
      config.producers.forEach((p, i) => { if (state.producers[p.id] > 0) highest = i; });
      state.catalog.best = highest;
      state.catalog.seen = highest + 1; // lo que ya tenía no cuenta como novedad
    }

    // Mineralpedia (versión 7). Una partida anterior no la trae: lo descubierto es hasta donde llegó su total ganado.
    const dx = saved.dex;
    if (dx && typeof dx === 'object') {
      if (Number.isInteger(dx.best) && dx.best >= 0) state.dex.best = Math.min(dx.best, Game.minerals.length - 1);
      if (Number.isInteger(dx.seen) && dx.seen >= 0) state.dex.seen = Math.min(dx.seen, state.dex.best + 1, Game.realMineralCount);
    } else {
      let reached = 0;
      for (let i = 1; i < Game.realMineralCount && state.totalEarned >= Game.minerals[i].unlockAt; i++) reached = i;
      state.dex.best = reached;
      state.dex.seen = reached + 1; // lo que ya llevaba hecho no cuenta como novedad
    }
    const ms = saved.missions;
    if (ms && typeof ms === 'object') {
      const out = state.missions;
      if (Number.isInteger(ms.intro) && ms.intro >= 0) out.intro = Math.min(ms.intro, config.missions.intro.length);
      if (typeof ms.streak === 'number' && Number.isInteger(ms.streak) && ms.streak >= 0) out.streak = ms.streak;
      if (typeof ms.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ms.day)) out.day = ms.day;
      out.giftClaimed = ms.giftClaimed === true;
      out.allClaimed = ms.allClaimed === true;
      const goals = Array.isArray(ms.goals) ? ms.goals : [];
      const valid = goals.length > 0 && goals.length <= config.missions.daily.count
        && goals.every((g) => g && Game.dailyGoalDef(g.id) && typeof g.base === 'number' && Number.isFinite(g.base) && g.base >= 0);
      if (valid) out.goals = goals.map((g) => ({ id: g.id, base: g.base, claimed: g.claimed === true }));
      else out.day = ''; // objetivos ilegibles: empieza un día nuevo en el primer tick
    } else if (state.totalClicks > 0 || state.totalEarned > 0) {
      state.missions.intro = config.missions.intro.length;
    }
    if (isAmount(saved.offlineReturns)) state.offlineReturns = Math.floor(saved.offlineReturns);

    // Prestigio (versión 4). Las partidas anteriores no lo traen: se queda en el valor de una partida
    // nueva (0 renaceres) y la vuelta en curso cuenta todo el tiempo jugado hasta ahora.
    const pr = saved.prestige;
    if (pr && typeof pr === 'object') {
      const out = state.prestige;
      for (const key of ['count', 'cores', 'coresEarned']) {
        if (isAmount(pr[key])) out[key] = Math.floor(pr[key]);
      }
      if (pr.skills && typeof pr.skills === 'object') {
        for (const s of Game.skills) {
          const level = pr.skills[s.id];
          if (Number.isInteger(level) && level > 0) out.skills[s.id] = Math.min(level, s.levels.length);
        }
      }
      if (typeof pr.unlocked === 'boolean') out.unlocked = pr.unlocked;
      if (isAmount(pr.runTime)) out.runTime = pr.runTime;
      for (const key of ['readyTime', 'lastRunTime', 'lastRunMineral']) {
        if (typeof pr[key] === 'number' && Number.isFinite(pr[key]) && pr[key] >= -1) out[key] = pr[key];
      }
    } else {
      state.prestige.runTime = state.playTime;
    }

    // Resumen de la vuelta (versión 11): contadores al empezar la vuelta y resumen de la anterior. Una partida anterior
    // no los trae: la vuelta en curso cuenta desde ahora (mejor quedarse corto que enseñar cifras inventadas).
    const prSaved = saved.prestige && typeof saved.prestige === 'object' ? saved.prestige : {};
    const rs = prSaved.runStart;
    const runKeys = [['clicks', state.totalClicks], ['bought', state.stats.bought], ['crits', state.stats.crits], ['goldens', state.stats.goldens]];
    for (const [key, current] of runKeys) {
      state.prestige.runStart[key] = rs && typeof rs === 'object' && isAmount(rs[key]) ? Math.min(Math.floor(rs[key]), current) : current;
    }
    const last = prSaved.last;
    const LAST_KEYS = ['count', 'gain', 'mineral', 'time', 'earned', 'pps', 'clicks', 'bought', 'crits', 'goldens'];
    if (last && typeof last === 'object' && LAST_KEYS.every((k) => isAmount(last[k])) && typeof last.ready === 'number' && Number.isFinite(last.ready) && last.ready >= -1) {
      state.prestige.last = {}; // (en el orden con el que lo escribe prestigeNow)
      for (const k of ['count', 'gain', 'mineral', 'time', 'ready', 'earned', 'pps', 'clicks', 'bought', 'crits', 'goldens']) state.prestige.last[k] = last[k];
    }

    const settings = saved.settings || {};
    if (NOTATIONS.includes(settings.notation)) state.settings.notation = settings.notation;
    if (config.buyAmounts.includes(settings.buyAmount)) state.settings.buyAmount = settings.buyAmount;
    if (config.languages.includes(settings.language)) state.settings.language = settings.language;
    if (typeof settings.sound === 'boolean') state.settings.sound = settings.sound;
    if (['unset', 'granted', 'denied'].includes(settings.adsConsent)) state.settings.adsConsent = settings.adsConsent;
    if (typeof settings.volume === 'number' && settings.volume >= 0 && settings.volume <= 1) {
      state.settings.volume = settings.volume; // (NaN e infinitos no pasan la comparación)
    }
    return state;
  }

  // ── localStorage ──────────────────────────────────────────
  // Guarda la partida actual. Devuelve true si se escribió.
  function save() {
    try {
      localStorage.setItem(config.saveKey, JSON.stringify({
        version: config.saveVersion,
        savedAt: Game.obtenerHora(), // el cálculo offline mide la ausencia desde aquí
        state: Game.state,
      }));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Devuelve { state, savedAt } con el estado ya validado (savedAt en ms, o null si no consta),
  // o null si no hay partida (o es ilegible).
  function load() {
    try {
      const raw = localStorage.getItem(config.saveKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.state !== 'object' || data.state === null) return null;
      return {
        state: sanitize(data.state),
        savedAt: isAmount(data.savedAt) ? data.savedAt : null,
      };
    } catch (err) {
      return null;
    }
  }

  function clear() {
    try {
      localStorage.removeItem(config.saveKey);
    } catch (err) { /* nada que borrar */ }
  }

  // ── Exportar / importar ───────────────────────────────────
  // El código es el estado en JSON dentro de un sobre con una marca de formato y un resumen
  // (hash) para detectar copias cortadas o alteradas por error; todo en base64.
  // No es seguridad: cualquiera puede editar su propia partida.
  function hash(text) {
    let h = 0x811c9dc5; // FNV-1a de 32 bits
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  function toBase64(text) {
    let binary = '';
    for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function fromBase64(code) {
    const binary = atob(code);
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  }

  // Código con la partida actual.
  function exportCode() {
    const state = JSON.stringify(Game.state);
    return toBase64(JSON.stringify({
      id: CODE_ID,
      version: config.saveVersion,
      exportedAt: Game.obtenerHora(),
      hash: hash(state),
      state,
    }));
  }

  // Valida un código y devuelve el estado saneado. Si falla, lanza un Error cuyo `message` es la
  // clave del texto para el jugador ('import.invalid'…); la interfaz la traduce con Game.tr.
  function parseCode(code) {
    const clean = String(code || '').replace(/\s+/g, '');
    if (!clean) throw new Error('import.empty');
    if (clean.length > MAX_CODE_LENGTH) throw new Error('import.tooLong');

    let envelope;
    try {
      envelope = JSON.parse(fromBase64(clean));
    } catch (err) {
      throw new Error('import.invalid');
    }
    if (!envelope || envelope.id !== CODE_ID || typeof envelope.state !== 'string') {
      throw new Error('import.foreign');
    }
    if (envelope.hash !== hash(envelope.state)) {
      throw new Error('import.corrupt');
    }

    let state;
    try {
      state = JSON.parse(envelope.state);
    } catch (err) {
      throw new Error('import.invalid');
    }
    if (!state || typeof state !== 'object') throw new Error('import.invalid');
    return sanitize(state);
  }

  Game.storage = { save, load, clear, exportCode, parseCode };
})(window.Game);

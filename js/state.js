// Estado de la partida: solo datos, sin lógica. Es lo que se guarda en localStorage.
(function (Game) {
  Game.createState = function () {
    const producers = {};
    for (const p of Game.config.producers) producers[p.id] = 0; // id → unidades compradas

    return {
      currency: 0,
      totalEarned: 0, // total ganado en la partida (no baja al gastar); desbloquea mejoras
      totalClicks: 0,
      producers,
      upgrades: {}, // id → true (mejoras compradas)
      achievements: {}, // id → true (logros conseguidos)
      playTime: 0, // segundos con el juego abierto
      offlineReturns: 0, // veces que se ha vuelto tras estar fuera (con ganancias)
      milestones: {}, // id → true (hitos cumplidos: sobreviven a renacer)
      stats: { bought: 0, crits: 0, goldens: 0, lifetime: 0 }, // contadores de toda la vida (objetivos diarios; total extraído sin contar renaceres)
      ads: { boostAt: 0 }, // hora (ms) del último frenesí ×2 por anuncio, para espaciarlos
      challenges: { done: {}, active: null }, // retos: id → mejor tiempo (s) y el reto en curso { id, elapsed, snapshot } (sobreviven a renacer)
      catalog: { best: -1, seen: 0 }, // Catálogo de maquinaria: productor más lejano que se ha tenido (índice) y cuántas entradas ha visto el jugador
      dex: { best: 0, seen: 1 }, // Mineralpedia: mineral más lejano descubierto (índice) y cuántas entradas ha visto el jugador
      // Misiones (sobreviven a renacer)
      missions: {
        intro: 0, // misiones de inicio cumplidas
        day: '', // fecha ('AAAA-MM-DD') del día en curso
        streak: 0, // días seguidos entrando
        giftClaimed: false, // regalo de entrada de hoy
        allClaimed: false, // bonus de hoy por reclamar los tres objetivos
        goals: [], // objetivos de hoy: { id, base, claimed }
      },
      // Prestigio: es lo único (con logros, clics, tiempo y ajustes) que sobrevive a renacer.
      prestige: {
        count: 0, // renaceres hechos
        cores: 0, // Núcleos sin gastar
        coresEarned: 0, // Núcleos ganados en total
        skills: {}, // id → nivel de la habilidad permanente
        unlocked: false, // ya se ha alcanzado el mineral exigido alguna vez (enseña el botón de renacer)
        runTime: 0, // segundos de esta vuelta
        readyTime: -1, // segundos que tardó esta vuelta en poder renacer (-1 = aún no)
        lastRunTime: -1, // lo mismo, de la vuelta anterior (-1 = no hay)
        lastRunMineral: -1, // mineral al que se llegó en la vuelta anterior
        runStart: { clicks: 0, bought: 0, crits: 0, goldens: 0 }, // contadores de toda la vida al empezar esta vuelta (para el resumen)
        last: null, // resumen de la vuelta anterior (ver Game.prestigeNow)
      },
      settings: {
        notation: 'abbreviated', // 'abbreviated' (1.5M) | 'scientific' (1.5e6)
        buyAmount: Game.config.buyAmounts[0], // selección del selector de compra de productores
        language: Game.detectLanguage(), // 'es' | 'en' (ver config.languages)
        sound: true, // sonido activado
        volume: Game.config.sound.defaultVolume, // 0–1
        adsConsent: 'unset', // anuncios: 'unset' (aún sin elegir) | 'granted' | 'denied'
      },
    };
  };

  Game.state = Game.createState();
})(window.Game);

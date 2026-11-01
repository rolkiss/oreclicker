// Ganancias offline: lo que producen los productores mientras el juego está cerrado.
(function (Game) {
  const { config } = Game;

  // Única fuente de la hora del juego. Hoy es el reloj del dispositivo; si algún día hace falta
  // antifraude, basta con cambiar esta función por una hora de servidor.
  Game.obtenerHora = function () {
    return Date.now();
  };

  // Suma las ganancias de haber estado fuera desde `savedAt` (ms) y devuelve un resumen para
  // enseñar al jugador, o null si no hay nada que contar (poco tiempo, reloj atrasado o sin
  // producción).
  Game.applyOffline = function (savedAt) {
    const { maxHours, minSeconds } = config.offline;
    const rate = Game.getOfflineRate(); // la base más lo que den las habilidades
    const away = (Game.obtenerHora() - savedAt) / 1000;
    if (!Number.isFinite(away) || away < minSeconds) return null;

    const counted = Math.min(away, maxHours * 3600);
    const earned = Game.getPps() * counted * rate; // el clic (y el Autominero) no cuentan offline
    if (!(earned > 0)) return null;

    const mineralBefore = Game.getMineralIndex();
    Game.earn(earned);
    Game.state.offlineReturns += 1;
    return {
      away,
      counted,
      capped: away > counted,
      earned,
      mineralBefore,
      mineralAfter: Game.getMineralIndex(),
    };
  };
})(window.Game);

// Arranque: carga la partida, conecta la lógica con la interfaz y pone en marcha los bucles.
(function (Game) {
  const { config } = Game;

  const saved = Game.storage.load();
  let offline = null;
  if (saved) {
    Game.state = saved.state;
    if (saved.savedAt !== null) offline = Game.applyOffline(saved.savedAt);
    if (offline) Game.storage.save(); // fija la hora: recargar enseguida no cobra dos veces
  }

  const newDay = Game.checkDay(); // el día nuevo (racha, regalo y objetivos) se abre al cargar, antes de pintar
  Game.ui.init({
    onMine: Game.mine,
    onBuyProducer: Game.buyProducer,
    onBuyUpgrade: Game.buyUpgrade,
  });
  Game.sound.init();
  Game.options.init();
  Game.achievementsPanel.init();
  Game.prestigePanel.init();
  Game.eventsUi.init();
  Game.missionsPanel.init();
  Game.dexPanel.init();
  Game.challengesPanel.init();
  Game.shareUi.init();
  Game.summaryPanel.init();
  Game.adsUi.init();
  Game.ui.render();
  if (newDay) Game.missionsPanel.announceDay();
  if (offline) {
    Game.ui.showOffline(offline);
    Game.adsUi.offerOffline(offline);
  }

  // Se usa el tiempo real transcurrido, no `tickMs`, porque el navegador frena los
  // temporizadores en pestañas ocultas. El tope evita que una suspensión del equipo
  // se convierta en horas de producción a ritmo completo (el tiempo con el juego
  // cerrado lo cuentan las ganancias offline, mucho más bajas).
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const seconds = Math.min((now - last) / 1000, config.maxTickSeconds);
    last = now;
    Game.tick(seconds);
    const unlocked = Game.checkAchievements();
    if (unlocked.length) Game.achievementsPanel.announce(unlocked);
    const introDone = Game.checkIntro();
    if (introDone.length) Game.missionsPanel.announceIntro(introDone);
    if (Game.checkDay()) Game.missionsPanel.announceDay();
    const challengeEvents = Game.takeChallengeEvents();
    if (challengeEvents.length) Game.challengesPanel.announce(challengeEvents);
    const completed = Game.checkDex();
    if (completed.length) Game.dexPanel.announceComplete(completed);
    const eras = Game.checkCatalog();
    if (eras.length) Game.dexPanel.announceEras(eras);
    const reached = Game.checkMilestones();
    if (reached.length) Game.achievementsPanel.announceMilestones(reached);
    Game.ui.render();
  }, config.tickMs);

  // Autoguardado periódico, y al ocultar/cerrar la pestaña (pagehide cubre también móvil).
  setInterval(Game.storage.save, config.autosaveMs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Game.storage.save();
  });
  window.addEventListener('pagehide', Game.storage.save);
})(window.Game);

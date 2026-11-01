// Anuncios: consentimiento, qué anuncios recompensados se pueden ofrecer y qué dan. Solo lógica, sin DOM; los
// proveedores reales (y el de prueba), el banner y los botones están en ads-ui.js. Con `provider: 'none'` (lo
// habitual hasta tener una red de anuncios) no se carga nada, no se enseña nada y el juego va como siempre.
(function (Game) {
  const { config } = Game;
  const cfg = config.ads;

  const providers = {}; // nombre → { isReady(), showRewarded(placement) → Promise<boolean>, ... }
  Game.ads = {};

  // El proveedor en uso. `?ads=test` activa el de prueba SOLO en el equipo local (para probar el flujo en desarrollo);
  // en un sitio publicado se ignora, para que nadie pueda darse recompensas gratis con él.
  Game.ads.providerName = function () {
    try {
      if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
        && new URLSearchParams(location.search).get('ads') === 'test') return 'test';
    } catch (err) { /* sin location (pruebas en Node) */ }
    return cfg.provider;
  };
  Game.ads.registerProvider = (name, impl) => { providers[name] = impl; };
  Game.ads.getProvider = () => providers[Game.ads.providerName()] || null;
  Game.ads.isEnabled = () => Game.ads.providerName() !== 'none';
  // ¿Ha pasado ya el tiempo de gracia desde que se abrió la web? (`elapsedMs` = tiempo desde la carga de la página)
  Game.ads.startDelayPassed = (elapsedMs) => elapsedMs >= cfg.startDelaySeconds * 1000;

  // ── Consentimiento: nada se carga hasta que el jugador acepta ──
  Game.ads.getConsent = () => Game.state.settings.adsConsent;
  Game.ads.hasConsent = () => Game.state.settings.adsConsent === 'granted';
  // Con proveedor, hay que haber aceptado para jugar (la ventana de aviso no se puede cerrar sin aceptar).
  Game.ads.needsConsent = () => Game.ads.isEnabled() && Game.state.settings.adsConsent !== 'granted';
  Game.ads.setConsent = function (value) {
    if (value !== 'granted' && value !== 'denied' && value !== 'unset') return false;
    Game.state.settings.adsConsent = value;
    return true;
  };

  // El banner de Adsterra va en un iframe que carga ad-banner.html (una página real del sitio: el script de Adsterra
  // necesita ver la dirección de la web, y en un iframe srcdoc no la ve y no sirve anuncios). Este es el fragmento que
  // escribe esa página, con el mismo código que da el panel (atOptions + script). Solo se acepta una dirección https
  // sin comillas ni parámetros raros; si algo no cuadra, null.
  Game.ads.adsterraSnippet = function () {
    const a = cfg.adsterra;
    if (!a || !/^[A-Za-z0-9]{8,64}$/.test(a.key || '')) return null;
    if (!/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._\/-]*$/.test(a.src || '')) return null;
    if (!Number.isInteger(a.width) || !Number.isInteger(a.height) || a.width < 1 || a.height < 1) return null;
    const options = { key: a.key, format: 'iframe', height: a.height, width: a.width, params: {} };
    return '<script>atOptions = ' + JSON.stringify(options) + ';<\/script>'
      + '<script src="' + a.src + '"><\/script>';
  };

  // ── Anuncios recompensados ────────────────────────────────
  // Se ofrecen si hay proveedor listo y consentimiento, y nunca dentro de un reto (la vuelta es "limpia").
  Game.ads.canOffer = function (placement) {
    if (!Game.ads.isEnabled() || !Game.ads.hasConsent() || Game.isClean()) return false;
    if (!cfg.rewards[placement] || !cfg.rewards[placement].enabled) return false;
    const provider = Game.ads.getProvider();
    if (!provider || !provider.isReady()) return false;
    return placement !== 'boost' || Game.getAdBoostWait() === 0;
  };

  // Pide un anuncio recompensado; resuelve true solo si se vio entero.
  Game.ads.request = async function (placement) {
    if (!Game.ads.canOffer(placement)) return false;
    try {
      return !!(await Game.ads.getProvider().showRewarded(placement));
    } catch (err) {
      return false;
    }
  };

  // Frenesí ×N a cambio de un anuncio: no más de uno cada `cooldown` segundos y sin rebajar un frenesí mejor que ya esté en marcha.
  Game.getAdBoostWait = function () {
    const last = Game.state.ads.boostAt;
    if (!last) return 0;
    return Math.max(0, (last + cfg.rewards.boost.cooldown * 1000 - Game.obtenerHora()) / 1000);
  };

  Game.grantAdBoost = function () {
    if (Game.isClean() || Game.getAdBoostWait() > 0) return false;
    const r = cfg.rewards.boost;
    Game.live.boostMult = Math.max(Game.getBoostMultiplier(), r.mult);
    Game.live.boostTime = Math.max(Game.live.boostTime, r.seconds);
    Game.state.ads.boostAt = Game.obtenerHora();
    return true;
  };

  // Duplica lo ganado offline (una sola vez por aviso de bienvenida). Devuelve lo añadido o 0.
  Game.claimOfflineBonus = function (summary) {
    if (!summary || summary.bonusClaimed || !(summary.earned > 0)) return 0;
    summary.bonusClaimed = true;
    Game.earn(summary.earned);
    return summary.earned;
  };
})(window.Game);

// Parte visual de los anuncios: aviso de consentimiento, banner, botones de recompensa (duplicar lo ganado fuera,
// duplicar el regalo diario, frenesí ×2), sección de Opciones y los proveedores ('test' y 'adsense'). La lógica
// (qué se puede ofrecer y qué da) está en ads.js. Con `provider: 'none'` nada de esto se enseña ni se carga.
(function (Game) {
  const { config, formatNumber } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);
  const cfg = config.ads;

  const els = {};
  let busy = false; // hay un anuncio en curso: los botones esperan
  let started = false; // el proveedor ya se puso en marcha (solo ocurre con consentimiento)
  let bannerState = 'none'; // 'none' | 'shown' | 'failed'
  let offlineSummary = null; // el aviso de bienvenida abierto, para duplicarlo

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function setHidden(node, hidden) {
    if (node.hidden !== hidden) node.hidden = hidden;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ── Proveedor de prueba: un anuncio falso con cuenta atrás, para probar el flujo sin red de anuncios ──
  Game.ads.registerProvider('test', {
    isReady: () => true,
    mountBanner(container) {
      container.append(el('div', 'ad-banner-test', tr('ads.bannerTest')));
      return true;
    },
    showRewarded: () => new Promise((resolve) => {
      const overlay = el('div', 'ad-test');
      const card = el('div', 'ad-test-card');
      const count = el('p', 'ad-test-count');
      const skip = el('button', 'btn', tr('ads.testSkip'));
      skip.type = 'button';
      card.append(el('h2', 'modal-title', tr('ads.testTitle')), el('p', 'opt-hint', tr('ads.testNote')), count, skip);
      overlay.append(card);
      document.body.append(overlay);
      skip.focus();

      const end = performance.now() + cfg.testSeconds * 1000;
      const finish = (viewed) => {
        clearInterval(timer);
        overlay.remove();
        resolve(viewed);
      };
      const tick = () => {
        const left = Math.ceil((end - performance.now()) / 1000);
        if (left <= 0) finish(true);
        else setText(count, tr('ads.testWait', { s: left }));
      };
      const timer = setInterval(tick, 100);
      skip.addEventListener('click', () => finish(false));
      tick();
    }),
  });

  // ── Adsterra: solo banner (no tiene anuncios recompensados, así que no se ofrece ninguno) ──
  // El código de Adsterra se ejecuta dentro de un iframe que carga ad-banner.html. Necesita `allow-same-origin` (cookies
  // y la dirección real del sitio), así que NO está aislado de la partida guardada; el `sandbox` sigue impidiendo que
  // redirija el juego a otro sitio sin que el jugador toque el anuncio (sin `allow-top-navigation`).
  Game.ads.registerProvider('adsterra', {
    isReady: () => false,
    mountBanner(container) {
      if (!Game.ads.adsterraSnippet()) return false;
      const frame = document.createElement('iframe');
      frame.className = 'ad-frame';
      frame.width = String(cfg.adsterra.width);
      frame.height = String(cfg.adsterra.height);
      frame.setAttribute('scrolling', 'no');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation');
      frame.title = tr('ads.frameTitle');
      frame.src = 'ad-banner.html';
      container.append(frame);
      return true;
    },
  });

  // ── Google AdSense (SIN PROBAR con una cuenta real; ver README.md) ──
  // Banner: bloque de anuncio normal. Recompensados: la API `adBreak` de Google (anuncios para juegos), que solo
  // existe si la cuenta la tiene activada; si no responde, `isReady()` sigue en false y no se ofrece nada recompensado.
  {
    let ready = false;
    Game.ads.registerProvider('adsense', {
      load() {
        if (!cfg.adsense.client || document.getElementById('adsense-script')) return;
        window.adsbygoogle = window.adsbygoogle || [];
        window.adBreak = window.adConfig = function (options) { window.adsbygoogle.push(options); };
        const script = document.createElement('script');
        script.id = 'adsense-script';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.adsense.client);
        script.dataset.adFrequencyHint = '30s';
        document.head.append(script);
        window.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: () => { ready = true; } });
      },
      isReady: () => ready,
      mountBanner(container) {
        if (!cfg.adsense.client || !cfg.adsense.bannerSlot) return false;
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.cssText = 'display:inline-block;width:320px;height:50px';
        ins.dataset.adClient = cfg.adsense.client;
        ins.dataset.adSlot = cfg.adsense.bannerSlot;
        container.append(ins);
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        return true;
      },
      showRewarded: (placement) => new Promise((resolve) => {
        let viewed = false;
        const guard = setTimeout(() => resolve(false), 8000); // si no hay anuncio disponible, no esperar eternamente
        window.adBreak({
          type: 'reward',
          name: placement,
          beforeReward: (showAd) => { clearTimeout(guard); showAd(); },
          adViewed: () => { viewed = true; },
          adDismissed: () => { viewed = false; },
          adBreakDone: () => { clearTimeout(guard); resolve(viewed); },
        });
      }),
    });
  }

  // ── Arranque ──────────────────────────────────────────────
  function init() {
    for (const id of ['ad-dock', 'ad-gate', 'ad-accept', 'ad-banner', 'ad-boost',
                      'offline', 'offline-double', 'gift-double', 'missions', 'gift-claim']) {
      els[id] = $(id);
    }

    els['ad-accept'].addEventListener('click', accept);
    els['offline-double'].addEventListener('click', () => watch('offline', () => {
      const earned = Game.claimOfflineBonus(offlineSummary);
      if (earned > 0) Game.achievementsPanel.toast(tr('missions.toastClaimed', { n: formatNumber(Math.floor(earned)) }));
    }));
    els['gift-double'].addEventListener('click', () => watch('gift', () => {
      const result = Game.claimGift(2);
      if (result) Game.achievementsPanel.toast(tr('missions.toastClaimed', { n: formatNumber(Math.floor(result.amount)) }));
    }));
    els['ad-boost'].addEventListener('click', () => watch('boost', () => {
      if (Game.grantAdBoost()) Game.achievementsPanel.toast(tr('ads.boostDone', { n: formatNumber(cfg.rewards.boost.mult), t: Game.formatDuration(cfg.rewards.boost.seconds) }));
    }));

    // El dock (el banner) va fijo abajo: reserva su alto para que no tape la tienda.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        document.documentElement.style.setProperty('--ad-h', (els['ad-dock'].hidden ? 0 : els['ad-dock'].offsetHeight) + 'px');
      }).observe(els['ad-dock']);
    }

    Game.ui.onRender(render);
    render();
  }

  // El aviso de bienvenida (lo llama main.js): si se puede, ofrece duplicarlo.
  function offerOffline(summary) {
    offlineSummary = summary;
  }

  // Aceptar es obligatorio para jugar: la ventana no tiene otra salida.
  function accept() {
    Game.ads.setConsent('granted');
    Game.storage.save();
    Game.ui.render();
  }

  // Pide el anuncio y, si se vio entero, da la recompensa.
  function watch(placement, reward) {
    if (busy || !Game.ads.canOffer(placement)) return;
    busy = true;
    renderButtons();
    Game.ads.request(placement).then((viewed) => {
      busy = false;
      if (viewed) {
        reward();
        Game.sound.play('buy');
        Game.storage.save();
      } else {
        Game.achievementsPanel.toast(tr('ads.failed'));
      }
      Game.ui.render();
    });
  }

  // ── Pintado (10 veces por segundo, con la interfaz) ───────
  function render() {
    const provider = Game.ads.getProvider();
    const enabled = Game.ads.isEnabled() && !!provider;
    const granted = enabled && Game.ads.hasConsent();

    // Con consentimiento (y pasados los primeros segundos) se pone en marcha el proveedor y el banner; sin él (o si se retira) no queda nada.
    const delayed = Game.ads.startDelayPassed(performance.now()); // performance.now() cuenta desde que se abrió la página
    if (granted && delayed) {
      if (!started) {
        started = true;
        if (provider.load) provider.load();
      }
      if (cfg.banner && bannerState === 'none' && provider.mountBanner) {
        bannerState = provider.mountBanner(els['ad-banner']) === false ? 'failed' : 'shown';
      }
    } else if (!granted && bannerState !== 'none') {
      els['ad-banner'].replaceChildren();
      bannerState = 'none';
    }

    // Sin aceptar no se juega: una ventana en el centro, sin cerrar, que tapa el juego (y bloquea sus atajos y el Tab).
    const askConsent = enabled && delayed && Game.ads.needsConsent();
    if (askConsent && els['ad-gate'].hidden) {
      Game.ui.openModal(els['ad-gate'], els['ad-accept']);
    } else if (!askConsent && !els['ad-gate'].hidden) {
      els['ad-gate'].dataset.locked = 'false';
      Game.ui.closeModal(els['ad-gate']);
      els['ad-gate'].dataset.locked = 'true';
    }
    setHidden(els['ad-banner'], bannerState !== 'shown');
    setHidden(els['ad-dock'], bannerState !== 'shown');

    renderButtons();
  }

  function renderButtons() {
    const offline = offlineSummary && !els.offline.hidden && !offlineSummary.bonusClaimed && Game.ads.canOffer('offline');
    setHidden(els['offline-double'], !offline);
    if (offline) setText(els['offline-double'], tr('ads.offlineDouble', { n: formatNumber(Math.floor(offlineSummary.earned)) }));
    if (els.offline.hidden) offlineSummary = null;

    const gift = !els.missions.hidden && Game.canClaimGift() && Game.ads.canOffer('gift');
    setHidden(els['gift-double'], !gift);
    if (gift) setText(els['gift-double'], tr('ads.giftDouble', { n: formatNumber(Math.floor(Game.getGiftAmount() * 2)) }));

    const boost = Game.ads.canOffer('boost') && Game.live.boostTime <= 0;
    setHidden(els['ad-boost'], !boost);
    if (boost) {
      const r = cfg.rewards.boost;
      setText(els['ad-boost'], tr('ads.boost', { n: formatNumber(r.mult), t: Game.formatDuration(r.seconds) }));
      els['ad-boost'].title = tr('ads.boostTitle', { n: formatNumber(r.mult), t: Game.formatDuration(r.seconds) });
    }

    for (const id of ['offline-double', 'gift-double', 'ad-boost']) els[id].setAttribute('aria-disabled', String(busy));
  }

  Game.adsUi = { init, offerOffline };
})(window.Game);

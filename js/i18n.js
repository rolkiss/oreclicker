// Localización: Game.tr(clave, valores) devuelve el texto en el idioma de la partida.
// Las tablas están en js/lang/. Si falta una clave se usa el español, y si tampoco está, la clave.
(function (Game) {
  const { config } = Game;
  const FALLBACK = 'es';

  // Idioma por defecto de una partida nueva: el del navegador si lo tenemos, si no español.
  Game.detectLanguage = function () {
    const nav = typeof navigator !== 'undefined' && navigator.language ? navigator.language.toLowerCase() : '';
    const code = nav.slice(0, 2);
    return config.languages.includes(code) ? code : FALLBACK;
  };

  Game.currentLanguage = function () {
    const settings = Game.state && Game.state.settings;
    return (settings && settings.language) || Game.detectLanguage();
  };

  Game.tr = function (key, params) {
    const table = Game.lang[Game.currentLanguage()] || Game.lang[FALLBACK];
    let text = table[key];
    if (text === undefined) text = Game.lang[FALLBACK][key];
    if (text === undefined) return key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
  };

  // Rellena los textos fijos del HTML:
  //   data-i18n="clave"                         → el contenido del elemento
  //   data-i18n-attr="aria-label:clave;title:…" → atributos
  Game.i18n = {
    applyStatic() {
      document.documentElement.lang = Game.currentLanguage();
      for (const node of document.querySelectorAll('[data-i18n]')) {
        node.textContent = Game.tr(node.dataset.i18n);
      }
      for (const node of document.querySelectorAll('[data-i18n-attr]')) {
        for (const pair of node.dataset.i18nAttr.split(';')) {
          const [attr, key] = pair.split(':');
          node.setAttribute(attr.trim(), Game.tr(key.trim()));
        }
      }
    },
  };
})(window.Game);

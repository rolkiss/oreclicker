// Panel de opciones: idioma, formato de números, guardar, exportar/importar y reiniciar.
(function (Game) {
  const { config } = Game;
  const $ = (id) => document.getElementById(id);
  const tr = (key, params) => Game.tr(key, params);

  const NOTATIONS = ['abbreviated', 'scientific'];
  const ARM_MS = 4000; // tiempo que dura el "¿seguro?" de las acciones que pisan la partida

  const els = {};
  const notationButtons = []; // { node, id }
  const languageButtons = []; // { node, id }
  const soundButtons = []; // { node, on }
  let lastPreview = 0; // para no sonar en cada pixel que se mueve el deslizador
  let transferLabelKey = null; // clave del texto de ayuda de la zona de exportar/importar
  let statusState = { key: null, kind: '' }; // último mensaje, para traducirlo al cambiar de idioma

  function init() {
    for (const id of ['options', 'options-open', 'options-close', 'language-select', 'notation-select',
                      'sound-select', 'volume', 'sound-toggle',
                      'notation-example', 'opt-save', 'opt-export', 'opt-import', 'opt-status', 'opt-reset',
                      'transfer', 'transfer-label', 'transfer-code', 'transfer-copy',
                      'transfer-download', 'transfer-pick', 'transfer-apply', 'transfer-file']) {
      els[id] = $(id);
    }

    for (const id of config.languages) {
      const node = segButton(tr('lang.' + id), () => {
        Game.state.settings.language = id;
        Game.ui.retranslate();
        retranslate();
        Game.storage.save();
      });
      languageButtons.push({ node, id });
      els['language-select'].append(node);
    }

    for (const id of NOTATIONS) {
      const node = segButton('', () => {
        Game.state.settings.notation = id;
        Game.ui.render();
        renderSettings();
        Game.storage.save();
      });
      notationButtons.push({ node, id });
      els['notation-select'].append(node);
    }

    for (const on of [true, false]) {
      const node = segButton('', () => setSound(on));
      soundButtons.push({ node, on });
      els['sound-select'].append(node);
    }
    els['sound-toggle'].addEventListener('click', () => setSound(!Game.state.settings.sound));
    els.volume.addEventListener('input', () => {
      Game.state.settings.volume = Number(els.volume.value) / 100;
      Game.sound.refresh();
      const now = performance.now();
      if (now - lastPreview > 150) { // una muestra mientras se arrastra, para oír el nivel
        lastPreview = now;
        Game.sound.play('click');
      }
    });
    els.volume.addEventListener('change', () => Game.storage.save());

    els['options-open'].addEventListener('click', open);
    els['options-close'].addEventListener('click', () => Game.ui.closeModal(els.options));

    els['opt-save'].addEventListener('click', () => {
      const saved = Game.storage.save();
      status(saved ? 'options.saved' : 'options.saveFailed', saved ? 'ok' : 'error');
    });
    els['opt-export'].addEventListener('click', showExport);
    els['opt-import'].addEventListener('click', showImport);
    els['transfer-copy'].addEventListener('click', copyCode);
    els['transfer-download'].addEventListener('click', downloadCode);
    els['transfer-pick'].addEventListener('click', () => els['transfer-file'].click());
    els['transfer-file'].addEventListener('change', readFile);
    armed(els['transfer-apply'], 'options.apply', 'options.applyConfirm', applyImport);
    armed(els['opt-reset'], 'options.reset', 'options.resetConfirm', resetGame);

    renderSettings();
  }

  function setSound(on) {
    Game.state.settings.sound = on;
    renderSettings();
    if (on) {
      Game.sound.unlock(); // por si el sonido estaba apagado desde el principio
      Game.sound.play('buy'); // una muestra al encenderlo
    }
    Game.storage.save();
  }

  function segButton(label, onClick) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'seg-btn';
    node.textContent = label;
    node.addEventListener('click', onClick);
    return node;
  }

  function open() {
    renderSettings();
    closeTransfer();
    status(null);
    Game.ui.openModal(els.options, els['options-close']);
  }

  // Lo que depende de los ajustes y del idioma: botones del selector, ejemplo de números…
  function renderSettings() {
    const { notation, language } = Game.state.settings;
    for (const b of languageButtons) b.node.setAttribute('aria-pressed', String(b.id === language));
    for (const b of notationButtons) {
      b.node.textContent = tr('options.notation.' + b.id);
      b.node.setAttribute('aria-pressed', String(b.id === notation));
    }
    const { sound, volume } = Game.state.settings;
    for (const b of soundButtons) {
      b.node.textContent = tr(b.on ? 'options.soundOn' : 'options.soundOff');
      b.node.setAttribute('aria-pressed', String(b.on === sound));
    }
    els.volume.value = String(Math.round(volume * 100));
    els['sound-toggle'].textContent = sound ? '🔊' : '🔇';
    els['sound-toggle'].setAttribute('aria-label', tr(sound ? 'sound.mute' : 'sound.unmute'));
    els['sound-toggle'].title = tr(sound ? 'sound.mute' : 'sound.unmute');
    Game.sound.refresh();
    els['notation-example'].textContent = tr('options.example', {
      a: Game.formatNumber(1234567),
      b: Game.formatNumber(98765432100),
    });
  }

  // Tras cambiar de idioma: los textos que se escribieron desde aquí vuelven a traducirse.
  function retranslate() {
    renderSettings();
    els['transfer-apply'].disarm();
    els['opt-reset'].disarm();
    if (transferLabelKey) els['transfer-label'].textContent = tr(transferLabelKey);
    status(statusState.key, statusState.kind);
  }

  // Muestra un mensaje de estado (por clave de texto) o lo borra con null.
  function status(key, kind) {
    statusState = { key, kind: kind || '' };
    els['opt-status'].textContent = key ? tr(key) : '';
    els['opt-status'].className = 'opt-hint' + (kind ? ' ' + kind : '');
  }

  // Botón que pide una segunda pulsación antes de actuar (sin usar window.confirm).
  function armed(button, labelKey, confirmKey, action) {
    let timer = null;
    const disarm = () => {
      clearTimeout(timer);
      button.classList.remove('armed');
      button.textContent = tr(labelKey);
    };
    button.addEventListener('click', () => {
      if (button.classList.contains('armed')) {
        disarm();
        action();
        return;
      }
      button.classList.add('armed');
      button.textContent = tr(confirmKey);
      timer = setTimeout(disarm, ARM_MS);
    });
    button.disarm = disarm;
  }

  // ── Exportar / importar ───────────────────────────────────
  function showTransfer(mode, labelKey) {
    els.transfer.hidden = false;
    transferLabelKey = labelKey;
    els['transfer-label'].textContent = tr(labelKey);
    const exporting = mode === 'export';
    els['transfer-code'].readOnly = exporting;
    els['transfer-copy'].hidden = !exporting;
    els['transfer-download'].hidden = !exporting;
    els['transfer-pick'].hidden = exporting;
    els['transfer-apply'].hidden = exporting;
  }

  function closeTransfer() {
    els.transfer.hidden = true;
    transferLabelKey = null;
    els['transfer-code'].value = '';
    els['transfer-apply'].disarm();
  }

  function showExport() {
    showTransfer('export', 'options.exportLabel');
    els['transfer-code'].value = Game.storage.exportCode();
    els['transfer-code'].select();
    status(null);
  }

  function showImport() {
    showTransfer('import', 'options.importLabel');
    els['transfer-code'].value = '';
    els['transfer-code'].focus();
    status(null);
  }

  function copyCode() {
    const box = els['transfer-code'];
    box.select();
    const done = () => status('options.copied');
    const fallback = () => {
      try {
        status(document.execCommand('copy') ? 'options.copied' : 'options.copyManual');
      } catch (err) {
        status('options.copyManual');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(box.value).then(done, fallback);
    } else {
      fallback();
    }
  }

  function downloadCode() {
    const blob = new Blob([els['transfer-code'].value], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ore-clicker-' + new Date(Game.obtenerHora()).toISOString().slice(0, 10) + '.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status('options.downloaded');
  }

  function readFile() {
    const file = els['transfer-file'].files[0];
    els['transfer-file'].value = ''; // permite elegir el mismo archivo otra vez
    if (!file) return;
    if (file.size > 2_000_000) {
      status('options.fileTooBig', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      els['transfer-code'].value = String(reader.result);
      status('options.fileLoaded');
    };
    reader.onerror = () => status('options.fileError', 'error');
    reader.readAsText(file);
  }

  function applyImport() {
    let state;
    try {
      state = Game.storage.parseCode(els['transfer-code'].value);
    } catch (err) {
      status(err.message, 'error'); // parseCode lanza la clave del texto
      return;
    }
    Game.state = state;
    Game.storage.save();
    Game.ui.retranslate(); // la partida importada puede traer otro idioma
    renderSettings();
    closeTransfer();
    status('options.imported', 'ok');
  }

  function resetGame() {
    Game.resetGame();
    Game.storage.save();
    Game.ui.reload();
    closeTransfer();
    status('options.resetDone', 'ok');
  }

  Game.options = { init };
})(window.Game);

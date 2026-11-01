// Genera un código de importación con muchos minerales y todos los minerales desbloqueados,
// y lo guarda en tools/codigo-importar.txt (así no hay que copiarlo a mano). Uso:
//   node tools/make-code.js [cantidad]      (por defecto 1e40)
'use strict';

const fs = require('fs');
const path = require('path');

global.window = global;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
for (const f of ['config', 'lang/es', 'lang/en', 'i18n', 'format', 'state', 'upgrades', 'minerals', 'game', 'biomes', 'events', 'prestige', 'milestones', 'dex', 'catalog', 'challenges', 'ads', 'share', 'missions', 'achievements', 'offline', 'save']) {
  require(path.join(__dirname, '..', 'js', f + '.js'));
}
const G = window.Game;

const amount = Number(process.argv[2] || 1e40);
if (!Number.isFinite(amount) || amount < 0) {
  console.log('Cantidad no válida.');
  process.exit(1);
}

G.state = G.createState();
G.state.currency = amount;
G.state.totalEarned = amount;
const code = G.storage.exportCode();

// Comprobación: el código tiene que importarse tal cual está en el archivo.
const file = path.join(__dirname, 'codigo-importar.txt');
fs.writeFileSync(file, code);
const back = G.storage.parseCode(fs.readFileSync(file, 'utf8'));
if (back.currency !== amount) {
  console.log('El código no se importa bien.');
  process.exit(1);
}
const unlocked = G.minerals.filter((m) => back.totalEarned >= m.unlockAt).length;
console.log('Código guardado en ' + file + ' (' + code.length + ' caracteres, ' + unlocked + '/' + G.minerals.length + ' minerales).');

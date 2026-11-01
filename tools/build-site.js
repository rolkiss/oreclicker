// Genera la carpeta `dist/` lista para publicar: solo lo que necesita el juego (nada de GDD.md, tools/ ni pruebas),
// con un sello de versión en los scripts y estilos para que el navegador no use copias viejas tras una actualización.
// Uso, desde la raíz del proyecto:
//
//   node tools/build-site.js            genera dist/ y avisa si queda algún marcador por rellenar
//   node tools/build-site.js --strict   igual, pero falla (código 1) si hay marcadores [[...]] sin rellenar
//
// Los marcadores son textos como [[TU-CORREO]] en privacy.html: hay que sustituirlos antes de publicar.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
const strict = process.argv.includes('--strict');

const FILES = ['index.html', 'privacy.html', 'ad-test.html', '404.html', 'robots.txt', 'ads.txt', 'favicon.svg']; // en la raíz
const DIRS = ['css', 'js'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Sello de versión: depende del contenido de los scripts y estilos.
const hash = crypto.createHash('sha1');
for (const dir of DIRS) for (const file of walk(path.join(root, dir)).sort()) hash.update(fs.readFileSync(file));
const version = hash.digest('hex').slice(0, 8);

let copied = 0;
let bytes = 0;
function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
  bytes += fs.statSync(to).size;
}

for (const dir of DIRS) {
  for (const file of walk(path.join(root, dir))) copy(file, path.join(out, path.relative(root, file)));
}
for (const name of FILES) {
  const from = path.join(root, name);
  if (!fs.existsSync(from)) { console.log('AVISO: falta ' + name); continue; }
  if (name === 'index.html') {
    // ?v=sello en cada script y hoja de estilos locales
    const html = fs.readFileSync(from, 'utf8').replace(/(src|href)="((?:js|css)\/[^"?]+)"/g, '$1="$2?v=' + version + '"');
    fs.writeFileSync(path.join(out, name), html);
    copied++;
    bytes += Buffer.byteLength(html);
  } else {
    copy(from, path.join(out, name));
  }
}

// Marcadores sin rellenar
const pending = [];
for (const file of walk(out)) {
  if (!/\.(html|txt|js|svg)$/.test(file)) continue;
  const matches = fs.readFileSync(file, 'utf8').match(/\[\[[A-Z0-9-]+\]\]/g);
  if (matches) pending.push(path.relative(out, file) + ': ' + [...new Set(matches)].join(' '));
}

// Nunca se publica con el proveedor de anuncios de prueba (daría recompensas gratis a cualquiera).
const config = fs.readFileSync(path.join(out, 'js', 'config.js'), 'utf8');
if (/provider:\s*'test'/.test(config)) {
  pending.push("js/config.js: ads.provider está en 'test' (pon 'none' o 'adsense')");
}

if (/provider:\s*'adsterra'/.test(config) && !/adsterra:\s*\{\s*key:\s*'[A-Za-z0-9]{8,}'/.test(config)) {
  pending.push("js/config.js: ads.provider es 'adsterra' pero falta ads.adsterra.key / src");
}

console.log(`dist/ listo: ${copied} archivos, ${(bytes / 1024).toFixed(0)} KB, versión ${version}.`);
if (pending.length) {
  console.log('\nFALTA RELLENAR antes de publicar:\n  ' + pending.join('\n  '));
  if (strict) process.exit(1);
}

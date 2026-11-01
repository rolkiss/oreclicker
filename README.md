# Ore Clicker

Un clicker de minería hecho con JavaScript puro (sin dependencias ni compilación): pica la roca, compra 50 productores,
desciende por 7 biomas, renace, completa retos y llena la Mineralpedia.

## Probarlo en local

Necesita un servidor estático cualquiera (abrir `index.html` con doble clic funciona casi todo, pero mejor servirlo):

```bash
python -m http.server 5500
```

y abrir <http://localhost:5500>. En local, `?ads=test` en la dirección activa unos **anuncios de prueba** (consentimiento,
banner y recompensas simuladas con cuenta atrás) para probar el flujo sin ninguna red de anuncios. En un sitio publicado
ese parámetro se ignora.

## Pruebas y herramientas

```bash
node tools/test.js          # pruebas (lógica, guardado, migración de partidas antiguas, textos ES/EN)
node tools/build-site.js    # genera dist/ listo para publicar
```

Los números del juego están en `js/config.js`. Los simuladores de equilibrio (`tools/sim.js`, `sim-prestige.js`,
`balance.js`) están comentados en su cabecera. **No ejecutes `tools/make-code.js`**: sobrescribe
`tools/codigo-importar.txt`, que debe seguir siendo un código de exportación de versión 3 (sirve de prueba de migración).

## Publicar

`node tools/build-site.js` copia solo lo necesario (`index.html`, `privacy.html`, `404.html`, `robots.txt`, `ads.txt`,
`favicon.svg`, `css/`, `js/`) a `dist/`, con un sello de versión en scripts y estilos para que nadie vea copias viejas
tras una actualización. Avisa de lo que falte por rellenar; con `--strict` falla en ese caso (así lo usa el workflow).

### Antes de publicar (lista)

1. `privacy.html` (ES y EN) ya lleva el correo de contacto y la fecha. Si cambian, actualízalos y revisa el texto (no es asesoramiento legal);
   debe describir los anuncios que realmente se usen.
   Cualquier marcador `[[...]]` que quede sin rellenar hace fallar `build-site.js --strict`.
2. En `js/config.js`: `share.url` (ya es `https://oreclicker.com`; cámbiala si la dirección pública es otra, y la de
   `og:url` y `canonical` en `index.html`) y `ads.provider` (`'none'` mientras no tengas red de anuncios;
   **nunca `'test'`**: `build-site.js` lo marca como pendiente).
3. El nombre del juego es definitivo: Ore Clicker (título y etiquetas de `index.html`, `config.share.title`, `privacy.html`, `404.html`).
4. No hay imagen de previsualización (`og:image`) para redes sociales; añádela si quieres que se vea al compartir el enlace.
5. `node tools/test.js` y `node tools/build-site.js --strict` sin errores.

### GitHub Pages (el workflow ya está en `.github/workflows/pages.yml`)

1. Crea un repositorio en GitHub, sube el proyecto (`git init`, `git add .`, `git commit`, `git remote add origin …`, `git push -u origin main`).
2. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
3. Cada push a `main` pasa las pruebas, genera `dist/` y lo publica en `https://<usuario>.github.io/<repositorio>/`.

### Cloudflare Pages / Netlify

Conecta el repositorio con *build command* `node tools/build-site.js` y *publish directory* `dist`.

### Dominio propio (opcional)

Compra el dominio donde prefieras y apúntalo al alojamiento (en GitHub Pages: Settings → Pages → Custom domain y los
registros DNS que indica; en Cloudflare/Netlify, desde su panel). Luego actualiza `config.share.url`.

## Anuncios

Ahora mismo el proveedor es **Adsterra** (`ads.provider: 'adsterra'`), solo con banner. Con `'none'` el sistema queda
apagado: no se carga ni se enseña nada. Piezas (`js/ads.js` lógica, `js/ads-ui.js` interfaz y proveedores, bloque `ads` de `config.js`):

- **Consentimiento**: la primera vez (con proveedor activo) sale un aviso Aceptar/Rechazar. Hasta que el jugador acepta no
  se carga ningún script de anuncios. Se puede cambiar en Opciones → Anuncios.
- **Banner** discreto abajo (320×50). El de Adsterra se carga en un iframe aislado (`sandbox`): su script no puede leer la partida
  guardada ni redirigir el juego; solo abrir el anuncio en otra pestaña cuando el jugador lo toca. La clave y la dirección del
  script salen del código «Banner» del panel de Adsterra y van en `ads.adsterra` (`key`, `src`); si algo no cuadra, no se monta.
- **Recompensados** (solo con un proveedor que los tenga, como AdSense o el de prueba; Adsterra no; opcionales y nunca dentro de un reto): duplicar lo ganado estando fuera, duplicar el regalo diario y un
  frenesí ×2 durante 2 min (uno cada 10 min). Valores en `config.ads.rewards`.

Para cambiar de Adsterra a Google AdSense (alternativa, que sí permitiría recompensados):

1. Publica el sitio (con su dominio y la página de privacidad) y solicita la cuenta de AdSense; hay que esperar la aprobación.
2. En `config.js`: `ads.provider: 'adsense'`, `ads.adsense.client` (`ca-pub-…`) y `ads.adsense.bannerSlot` (id del bloque).
3. Sustituye el contenido de `ads.txt` por la línea que te dé AdSense.
4. Los recompensados usan la API `adBreak` de Google (anuncios para juegos), que solo existe si tu cuenta la tiene activada.
   Si no responde, simplemente no se ofrecen recompensados y queda el banner.

Aviso importante:

- **El adaptador de AdSense no se ha probado con una cuenta real** (el proveedor `'test'` sí está probado en navegador).
  Pruébalo en cuanto tengas cuenta.
- El aviso de consentimiento propio **no equivale a cumplir la normativa**: para usuarios del Espacio Económico Europeo,
  Google exige una plataforma de gestión del consentimiento (CMP) certificada. Si vas a tener público europeo, integra una.
- La política de privacidad de `privacy.html` es un texto base: revísala y mantenla al día con los anuncios que uses.

## Estructura

```
index.html, css/, js/      el juego (scripts clásicos en window.Game; orden de carga en index.html)
js/config.js               todos los números y listas del juego
js/lang/                   textos ES / EN (las pruebas exigen que tengan las mismas claves)
tools/                     pruebas, simuladores, generador de dist/
privacy.html, 404.html     páginas del sitio publicado
```

Las partidas guardadas llevan versión (`saveVersion` en `config.js`); `js/save.js` rellena lo que falte al cargar una
partida antigua. Si añades campos al estado, sube la versión y completa `sanitize`.

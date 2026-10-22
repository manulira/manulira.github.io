// Sirve la página del equipo como la serviría la tienda: la plantilla (page.equipo.liquid) con sus
// archivos de assets. No hay ningún /api: si la interfaz llamara a un servidor propio, fallaría (404);
// todo tiene que pasar por el adaptador y la base de datos.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TEMA = path.join(AQUI, '..', '..');
const tipos = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.html': 'text/html; charset=utf-8' };

/* Como asset_url de Shopify: dirección con «?v=…» (la tienda la agrega a todo lo que se pide con asset_url). */
const urlAsset = n => '/assets/' + n + (process.env.SIN_VERSION ? '' : '?v=1700000000');

/* Las direcciones del sitio, como las daría la tienda (las reales salen de snippets/sepia-equipo-sitio.liquid). */
const SITIO_PRUEBA = '<script>window.SEPIA_EQUIPO_SITIO = { inicio: "/", nosotros: "/pages/nosotros" };</script>';

/* Un «Liquid» mínimo, solo para esta plantilla: quita las etiquetas de control y resuelve asset_url. */
export function renderizar(plantilla, url, clave, snippet = '') {
  let t = plantilla
    .replace(/\{%\s*render 'sepia-equipo-conexion'\s*%\}/g, () => snippet)
    .replace(/\{%\s*render 'sepia-equipo-sitio'\s*%\}/g, () => SITIO_PRUEBA)
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
    .replace(/\{%\s*layout none\s*%\}/g, '')
    .replace(/\{%\s*(end)?raw\s*%\}/g, '')
    // asset_url con «| split: '?' | first» (sin «?v=»), con o sin «| json»
    .replace(/\{\{\s*['"]([^'"]+)['"]\s*\|\s*asset_url\s*\|\s*split:\s*['"]\?['"]\s*\|\s*first\s*\|\s*json\s*\}\}/g, (_, n) => JSON.stringify('/assets/' + n))
    .replace(/\{\{\s*['"]([^'"]+)['"]\s*\|\s*asset_url\s*\|\s*split:\s*['"]\?['"]\s*\|\s*first\s*\}\}/g, (_, n) => '/assets/' + n)
    // asset_url a secas: con «?v=», como la tienda
    .replace(/\{\{\s*['"]([^'"]+)['"]\s*\|\s*asset_url\s*\}\}/g, (_, n) => urlAsset(n))
    .replaceAll('SUPABASE_URL', url).replaceAll('SUPABASE_CLAVE', clave);
  const resto = t.match(/\{\{|\{%/g);
  if (resto) throw new Error('La plantilla trae Liquid que el armado de pruebas no entiende: ' + t.slice(t.search(/\{\{|\{%/), 80));
  return t;
}

export function servir(puerto, { url, clave }) {
  const plantilla = fs.readFileSync(path.join(TEMA, 'templates', 'page.equipo.liquid'), 'utf8');
  const snippet = fs.readFileSync(path.join(TEMA, 'snippets', 'sepia-equipo-conexion.liquid'), 'utf8')
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '');
  const html = renderizar(plantilla, url, clave, snippet);
  const peticiones = [];
  const servidor = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    peticiones.push(req.method + ' ' + u.pathname);
    if (u.pathname === '/pages/equipo') { res.writeHead(200, { 'content-type': tipos['.html'] }); res.end(html); return; }
    if (u.pathname === '/') { res.writeHead(200, { 'content-type': tipos['.html'] }); res.end('<h1>Inicio de Sepia Coffee</h1>'); return; }
    if (u.pathname === '/pages/nosotros') { res.writeHead(200, { 'content-type': tipos['.html'] }); res.end('<h1>Nosotros de Sepia Coffee</h1>'); return; }
    if (u.pathname.startsWith('/assets/') && u.pathname.endsWith('.json')) {      // el manifiesto: en el tema es un «.json.liquid»
      const f = path.join(TEMA, 'assets', path.basename(u.pathname) + '.liquid');
      if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(renderizar(fs.readFileSync(f, 'utf8'), url, clave)); return; }
    }
    if (u.pathname === '/pages/baristas') { res.writeHead(200, { 'content-type': tipos['.html'] }); res.end('<h1>Portal de baristas</h1>'); return; }
    if (u.pathname.startsWith('/assets/')) {
      const f = path.join(TEMA, 'assets', path.basename(u.pathname));
      if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': tipos[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); return; }
    }
    res.writeHead(404); res.end('no');
  }).listen(puerto);
  servidor.peticiones = peticiones;
  return servidor;
}

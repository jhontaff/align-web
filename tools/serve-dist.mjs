/**
 * Sirve el build de produccion con el mismo proxy que `ng serve`, para poder
 * probar el Service Worker.
 *
 * Por que hace falta: **Web Push es una API del Service Worker**, y `ng serve`
 * no genera `ngsw-worker.js` en absoluto (`serviceWorker` solo esta en la
 * configuracion `production` de angular.json). Con el dev server, `SwPush`
 * queda deshabilitado y no hay nada que probar.
 *
 * Y al servir el build como estatico se pierde `proxy.conf.json`, con lo que
 * vuelve el problema de CORS que el backend no tiene resuelto. Este script
 * reproduce esa pieza: reenvia `/api` y `/auth` a localhost:1010, asi que el
 * navegador ve un unico origen igual que en desarrollo.
 *
 * `localhost` cuenta como contexto seguro, asi que no hace falta HTTPS aqui.
 * Desde el movil contra `http://<ip-local>:4300` **si** falla: el navegador
 * exige contexto seguro para Service Workers y notificaciones.
 *
 * Uso: `npm run serve:pwa` (compila y arranca esto).
 *
 * Sin dependencias a proposito: todo lo que hace cabe en el `node:http` que ya
 * hay, y este repo no instala paquetes para envolver una llamada que ya existe.
 */
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 4300);
const BACKEND = { host: 'localhost', port: 1010 };
const PROXIED = ['/api', '/auth'];

// El builder `application` deja los archivos del navegador en `browser/`. Se
// comprueban las dos rutas porque un cambio de builder mueve la carpeta y el
// sintoma seria un 404 en todo sin ninguna pista.
const ROOT = ['dist/align-web/browser', 'dist/align-web']
  .map(candidate => resolve(process.cwd(), candidate))
  .find(candidate => existsSync(join(candidate, 'index.html')));

if (!ROOT) {
  console.error('No se encontró el build. Ejecuta `ng build` antes.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function proxy(req, res) {
  const upstream = httpRequest(
    { ...BACKEND, method: req.method, path: req.url, headers: { ...req.headers, host: `${BACKEND.host}:${BACKEND.port}` } },
    backendRes => {
      res.writeHead(backendRes.statusCode ?? 502, backendRes.headers);
      backendRes.pipe(res);
    }
  );

  upstream.on('error', err => {
    // El mismo ECONNREFUSED que ya documenta el proxy de desarrollo: significa
    // que el backend de Spring no está levantado, no que falle el frontend.
    console.error(`[proxy] ${req.method} ${req.url} → ${err.code ?? err.message}`);
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'Backend no disponible en localhost:1010' }));
  });

  req.pipe(upstream);
}

function sendFile(res, filePath, { noStore = false } = {}) {
  res.writeHead(200, {
    'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream',
    // El SW y el index no se cachean nunca: es lo que permite que un `ng build`
    // nuevo se vea sin borrar los datos del sitio a mano.
    'cache-control': noStore ? 'no-store' : 'public, max-age=3600'
  });

  createReadStream(filePath).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (PROXIED.some(prefix => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    proxy(req, res);
    return;
  }

  // `normalize` sobre la ruta ya decodificada corta el `../` que sacaría del
  // directorio del build.
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const filePath = join(ROOT, relative);

  if (filePath.startsWith(ROOT) && existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(res, filePath, { noStore: relative.startsWith('ngsw') });
    return;
  }

  // Cualquier otra ruta es una ruta de Angular: la resuelve el router del
  // cliente sobre index.html.
  sendFile(res, join(ROOT, 'index.html'), { noStore: true });
}).listen(PORT, () => {
  console.log(`Build servido en http://localhost:${PORT}`);
  console.log(`  /api y /auth → http://${BACKEND.host}:${BACKEND.port}`);
});

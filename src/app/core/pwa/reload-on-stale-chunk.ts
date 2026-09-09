import { NavigationError } from '@angular/router';

/**
 * Centinela contra el bucle de recargas. Guarda la última URL por la que ya se
 * recargó, y es de sesión a propósito: cerrar la pestaña olvida el intento.
 */
const RELOAD_KEY = 'align_chunk_reload';

/**
 * Reconoce el `import()` que falla porque el archivo ya no está en el servidor.
 *
 * **No se busca `ChunkLoadError`**: ese es el nombre que le pone webpack, y
 * Angular 20 compila con esbuild y usa `import()` nativo. Lo que llega aquí es
 * un `TypeError` cuyo mensaje depende del motor — "Failed to fetch dynamically
 * imported module" en Chrome, "error loading dynamically imported module" en
 * Firefox, "Importing a module script failed" en Safari—, así que se filtra por
 * mensaje y con los tres. Filtrar por el nombre de webpack no cazaría ninguno.
 */
const STALE_CHUNK = /dynamically imported module|importing a module script failed/i;

/**
 * Recarga cuando una ruta lazy no puede cargar su chunk tras un despliegue.
 *
 * **El problema.** Todas las rutas son `loadComponent`, y `outputHashing: all`
 * mete el hash del contenido en el nombre del archivo: el `main.js` que el
 * navegador ya tiene cargado conoce los nombres de chunk de SU build. Un
 * despliegue los sustituye por otros, así que el archivo viejo no está
 * desactualizado — **no existe**. La pestaña que siga abierta pedirá un 404 en
 * cuanto navegue a una sección que aún no había visitado.
 *
 * **Y por defecto eso no se ve.** El router emite `NavigationError`, nadie lo
 * escucha y la navegación se aborta: el usuario pulsa "Finanzas" y la app se
 * queda donde estaba, sin error, sin aviso y sin pista. No es una pantalla
 * rota, es una app que deja de responder a la navegación.
 *
 * **Por qué es raro y aun así hace falta.** Con el Service Worker sano esto no
 * pasa: fija cada cliente a su versión y le sirve SUS chunks desde caché aunque
 * el servidor ya los haya borrado. Queda descubierto cuando el SW todavía no
 * controla la página, cuando el navegador desalojó su caché, cuando entró en
 * modo seguro tras una instalación fallida, o cuando no hay SW en absoluto.
 * Es la red de seguridad de la red de seguridad: poco probable, caro cuando
 * ocurre —la app enmudece— y barato de cubrir.
 *
 * Se registra con `withNavigationErrorHandler()` en `app.config.ts`.
 */
export function reloadOnStaleChunk(event: NavigationError): void {
  const message = String((event.error as Error | undefined)?.message ?? event.error);
  if (!STALE_CHUNK.test(message)) return;

  // Una recarga limpia trae el index.html nuevo, y con él los nombres de chunk
  // nuevos. `assign(event.url)` y NO `reload()`: el usuario pidió ir a otra
  // pantalla, y recargar repetiría la actual — o sea, "no pasó nada" otra vez,
  // ahora con un parpadeo.
  if (sessionStorage.getItem(RELOAD_KEY) === event.url) {
    // Ya se recargó por esta misma URL y ha vuelto a fallar: no era un
    // despliegue, es que el chunk no se puede traer (sin red, o un despliegue a
    // medias). Reintentar sería un bucle de recargas, que es peor que la
    // navegación muerta que esto viene a arreglar.
    return;
  }

  sessionStorage.setItem(RELOAD_KEY, event.url);
  location.assign(event.url);
}

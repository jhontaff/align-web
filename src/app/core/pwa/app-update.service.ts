import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Cada cuánto se pregunta por una versión nueva estando la app abierta.
 *
 * Seis horas y no seis minutos: el disparador que de verdad importa es volver
 * a la app desde segundo plano (ver `listen()`), y este intervalo solo cubre
 * el caso raro de una pestaña que lleva medio día abierta sin tocarse.
 */
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Detecta que hay un despliegue nuevo y lo activa cuando el usuario acepta.
 *
 * **El problema que resuelve, porque no es evidente.** El Service Worker de
 * Angular fija cada cliente a la versión con la que arrancó y le sirve esos
 * archivos hasta que el documento se vuelve a cargar: descubre la versión
 * nueva en una carga y la pinta en la SIGUIENTE. En una pestaña del navegador
 * eso pasa solo, porque se cierra y se abre a diario. En una PWA instalada en
 * Android **no**: salir con el botón de inicio no mata el documento, al volver
 * se reanuda el mismo, y sin una carga nueva no hay ni descubrimiento ni
 * activación. La app instalada se queda en la versión del día que se instaló.
 *
 * De ahí las dos mitades de este servicio: preguntar en los momentos en que la
 * app instalada "reaparece" sin recargar, y ofrecer la recarga explícitamente.
 *
 * **Excepción al servicio stateless**, igual que `PushService` y `ChatStore`:
 * hay una versión pendiente o no la hay, y eso es estado del navegador, no de
 * una pantalla. Con una copia por componente, dos avisos podrían contradecirse.
 *
 * Con `ng serve` todo esto es un no-op: `provideServiceWorker` corre con
 * `enabled: !isDevMode()`, así que `isEnabled` es `false` y `listen()` sale por
 * la primera línea. Para probarlo hace falta servir el build (`npm run serve:pwa`).
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _ready = signal(false);

  /** Hay una versión nueva ya descargada, esperando a que se active. */
  readonly ready = this._ready.asReadonly();

  private started = false;

  /**
   * Engancha la detección. Lo llama `App` una sola vez, igual que `push.listen()`:
   * el shell está montado siempre, que es la única condición que esto pide.
   */
  listen(): void {
    if (!this.updates.isEnabled || this.started) return;
    this.started = true;

    // `VERSION_READY` y no `VERSION_DETECTED`: detectada significa que el
    // manifiesto es nuevo, no que los archivos estén descargados. Ofrecer la
    // recarga antes de tiempo dejaría al usuario esperando —o peor, sin red a
    // mitad de descarga— con la app ya recargada.
    this.updates.versionUpdates
      .pipe(
        filter(event => event.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this._ready.set(true));

    // El SW puede quedar en un estado del que no sabe salir (un archivo que
    // tiene cacheado ya no existe en el servidor, por ejemplo). Recargar es la
    // única salida, y sin esto la app se queda rota sin decir nada.
    this.updates.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());

    // Volver a primer plano es el ÚNICO momento fiable en que una PWA instalada
    // reaparece sin recargar, así que es donde hay que preguntar. Es también lo
    // que hace que el aviso llegue a los pocos segundos de un despliegue en vez
    // de al siguiente arranque en frío, que puede no llegar nunca.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') this.check();
    };

    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisible));

    // Fuera de la zona: con Zone.js un intervalo vivo deja la zona inestable de
    // forma permanente y cuelga cualquier `whenStable()` de las pruebas. No
    // hace falta estar dentro: lo único que se repinta sale de un signal, y
    // los signals programan detección de cambios por su cuenta.
    this.zone.runOutsideAngular(() => {
      const id = setInterval(() => this.check(), POLL_INTERVAL_MS);
      this.destroyRef.onDestroy(() => clearInterval(id));
    });

    this.check();
  }

  /**
   * Activa la versión descargada y recarga.
   *
   * **Las dos cosas van juntas, siempre.** Activar sin recargar deja la página
   * vieja en ejecución mientras el SW ya sirve los archivos nuevos: el primer
   * `import()` de una ruta lazy pediría un chunk cuyo hash ya no existe y
   * fallaría con un "Failed to fetch dynamically imported module". Con todas
   * las rutas de esta app en `loadComponent`, eso no es hipotético.
   *
   * `reloadOnStaleChunk` cubre ese mismo fallo cuando llega por otra vía (un
   * despliegue con la pestaña abierta y el SW sin controlarla); aquí se evita
   * en origen, que es mejor que recuperarse de él.
   */
  async apply(): Promise<void> {
    if (!this.updates.isEnabled) return;

    try {
      await this.updates.activateUpdate();
    } catch {
      // Si la activación falla, recargar igualmente es la única vía de
      // recuperación: una carga limpia vuelve a intentar la instalación.
    }

    this.reload();
  }

  /**
   * Pregunta al servidor si hay versión nueva.
   *
   * El `catch` no se traga un fallo del código: `checkForUpdate()` rechaza
   * cuando no hay red, que es el caso normal en una app instalada que se abre
   * sin conexión. Dejarlo sin capturar lo convertiría en un error global de los
   * que `provideBrowserGlobalErrorListeners()` saca por consola.
   */
  private check(): void {
    this.updates.checkForUpdate().catch(() => undefined);
  }

  /** Aislado en un método para que el resto de la clase no toque `location`. */
  private reload(): void {
    document.location.reload();
  }
}

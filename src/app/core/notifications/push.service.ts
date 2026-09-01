import { DestroyRef, Injectable, computed, inject, isDevMode, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { DataRefreshService } from '../data/data-refresh.service';
import { extractErrorMessage } from '../http/extract-error-message';
import { toRequest } from './push.model';

/**
 * Los cuatro estados del PERMISO del navegador. No dicen si hay suscripcion
 * activa: para eso esta `subscribed`, y son cosas distintas —darse de baja no
 * revoca el permiso—.
 *
 * `denied` no es "todavia no": el navegador **no deja volver a preguntar** desde
 * la pagina, asi que la unica salida es el candado de la barra de direcciones.
 * Pintar un boton "Activar" en ese estado seria un boton que no puede funcionar.
 */
export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied';

/** A donde lleva la notificacion de prueba al pulsarla. */
const TEST_NOTIFICATION_URL = '/habits';

/**
 * Suscripcion a Web Push, alta y baja del dispositivo, y notificacion de prueba.
 *
 * **Excepcion al servicio stateless**, por el mismo motivo que `ChatStore`: el
 * permiso y la suscripcion son estado global del navegador, no de una pantalla.
 * Con una copia por componente, el boton de Habitos y el de una futura pantalla
 * de Ajustes se contradirian sin que ninguno de los dos estuviera mal.
 *
 * ---
 *
 * **Web Push es una API del Service Worker, no de la pagina.** Y en este repo
 * `provideServiceWorker` corre con `enabled: !isDevMode()`, ademas de que
 * `ng serve` ni siquiera genera `ngsw-worker.js`. Consecuencia que hay que
 * tener presente antes de dudar del codigo: **con `ng serve` esto no funciona
 * nunca**, `supported()` es `false` y la UI no se pinta. Para probarlo hace
 * falta servir el build (`npm run serve:pwa`).
 *
 * `localhost` cuenta como contexto seguro; `http://<ip-local>:puerto` desde el
 * movil **no**, y ahi el sintoma es el mismo que ya documenta el dictado por
 * voz: el boton aparece y no pasa nada.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _status = signal<PushStatus>(this.readStatus());
  private readonly _subscribed = signal(false);
  private readonly _busy = signal(false);
  private readonly _error = signal<string | null>(null);

  /** El permiso tal y como lo ve el navegador ahora mismo. */
  readonly status = this._status.asReadonly();

  /**
   * Si este navegador tiene una suscripcion viva.
   *
   * **Separado del permiso a proposito**: darse de baja NO revoca el permiso,
   * asi que tras un `disable()` el estado queda en `granted` + `subscribed`
   * falso. Con un solo booleano, la pantalla seguiria diciendo "activado"
   * despues de desactivar.
   */
  readonly subscribed = this._subscribed.asReadonly();

  /** Una operacion en vuelo. Los botones se deshabilitan, no se ocultan. */
  readonly busy = this._busy.asReadonly();

  readonly error = this._error.asReadonly();

  /**
   * Si tiene sentido pintar la UI de notificaciones.
   *
   * Se oculta entera cuando no se soporta, igual que el boton de microfono en
   * Firefox: prometer un control que no puede hacer nada es peor que no
   * ofrecerlo. El aviso para quien desarrolla va por consola, que es donde se
   * mira cuando algo "no aparece".
   */
  readonly supported = computed(() => this._status() !== 'unsupported');

  /**
   * La clave VAPID **la sirve el backend** (`GET /api/notifications/vapid-public-key`),
   * no una constante compilada aqui.
   *
   * Importa mas de lo que parece: si el backend rota el par de claves, el
   * navegador rechaza un `subscribe()` con una clave distinta de la que uso la
   * primera vez. Con la clave en el bundle, esa rotacion exige un despliegue
   * del frontend coordinado con el del backend; pidiendola, el frontend se
   * entera solo.
   *
   * Se cachea en memoria —es la misma durante toda la sesion— y la promesa se
   * descarta si falla, para que un fallo de red no deje el error cacheado para
   * siempre. Requiere sesion: el endpoint responde 401 sin token.
   */
  private serverPublicKey: Promise<string> | null = null;

  constructor() {
    if (!this.swPush.isEnabled) {
      if (isDevMode()) {
        console.info(
          '[push] Service Worker desactivado en desarrollo: Web Push no funciona con `ng serve`. ' +
            'Para probarlo: npm run serve:pwa'
        );
      }

      return;
    }

    // El estado de suscripcion lo tiene el navegador, no la app: hay que
    // preguntarselo en cada arranque en vez de recordarlo en `localStorage`.
    // El usuario pudo borrar los datos del sitio o revocar el permiso desde la
    // configuracion, y ahi no hay ningun evento que avise.
    this.swPush.subscription
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(subscription => this._subscribed.set(subscription !== null));
  }

  /**
   * Empieza a escuchar los dos streams del Service Worker. **Lo llama el shell
   * (`App`) una sola vez**, no una pantalla.
   *
   * Que sea explicito y no el constructor no es ceremonia: un servicio `root`
   * se instancia la primera vez que alguien lo inyecta, y quien lo inyecta
   * ademas del shell es `HabitList`. Con esto en el constructor, llegar a la
   * app desde una notificacion cayendo en Inicio no engancharia nada —el
   * servicio ni existiria— y el clic no llevaria a ningun sitio. `App` esta
   * montado siempre; esa es la diferencia.
   *
   * Ninguno de los dos observables completa, asi que `takeUntilDestroyed` es
   * obligatorio — el mismo motivo que en el `Subject` de `DataRefreshService`.
   */
  listen(): void {
    if (!this.swPush.isEnabled) {
      return;
    }

    // El clic ya trajo la pestana al frente (`focusLastFocusedOrOpen`); aqui
    // solo queda ir a la pantalla, y con el Router, que no recarga la app.
    this.swPush.notificationClicks
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ notification }) => {
        const url = (notification.data as { url?: string } | undefined)?.url;

        if (url) {
          void this.router.navigateByUrl(url);
        }
      });

    // Un push que llega con la app abierta suele significar que algo cambio en
    // el servidor. Se reutiliza el canal que ya existe para el agente en vez de
    // inventar otro: cada pantalla montada vuelve a pedir lo suyo y no hay que
    // saber aqui a quien afecta.
    this.swPush.messages
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.dataRefresh.invalidate());
  }

  /**
   * Pide el permiso, se suscribe y registra el dispositivo en el backend.
   *
   * **Tiene que llamarse desde un gesto del usuario.** Disparar esto en el
   * arranque de la app es como se consigue que la gente pulse "Bloquear" sin
   * leer, y `denied` no tiene vuelta atras desde la pagina.
   *
   * Es reintentable a proposito: si el permiso ya esta concedido,
   * `requestSubscription()` devuelve la suscripcion existente en vez de crear
   * otra, asi que volver a llamarlo solo reenvia el registro al backend.
   */
  async enable(): Promise<void> {
    if (this._busy() || this._status() === 'unsupported') {
      return;
    }

    this._busy.set(true);
    this._error.set(null);

    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: await this.vapidKey()
      });

      await firstValueFrom(
        this.http.post<void>('/api/notifications/subscribe', toRequest(subscription))
      );

      this._status.set('granted');
      this._subscribed.set(true);
    } catch (err) {
      // El permiso y el registro son dos cosas distintas: el usuario pudo
      // conceder y fallar el POST. Se relee el permiso del navegador en vez de
      // asumir que el fallo fue un rechazo, para no pintar "bloqueado" ante un
      // 500 del backend.
      this._status.set(this.readStatus());
      this._error.set(this.describe(err));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Baja del dispositivo: lo borra del backend
   * (`DELETE /api/notifications/subscribe?endpoint=`) y luego cancela la
   * suscripcion en el navegador.
   *
   * **Ese orden y no el contrario.** El `endpoint` es la clave con la que el
   * backend identifica la fila, y cancelar primero en el navegador destruye el
   * objeto que lo lleva: quedaria una suscripcion muerta en el servidor sin
   * forma de nombrarla desde aqui. Si el DELETE falla, la baja se aborta entera
   * y el navegador conserva la suya — un estado consistente, aunque no sea el
   * que el usuario pidio.
   *
   * **No revoca el permiso**, porque no hay API que lo haga: el estado queda en
   * `granted` con `subscribed` en falso, y volver a activar ya no vuelve a
   * preguntar nada.
   */
  async disable(): Promise<void> {
    if (this._busy() || !this._subscribed()) {
      return;
    }

    this._busy.set(true);
    this._error.set(null);

    try {
      const subscription = await firstValueFrom(this.swPush.subscription);

      if (subscription) {
        await firstValueFrom(
          this.http.delete<void>('/api/notifications/subscribe', {
            // `HttpParams` y no interpolar en la URL: el endpoint es una URL
            // completa con `://`, `?` y `/`, y sin codificar romperia la query
            // de la peticion.
            params: new HttpParams().set('endpoint', subscription.endpoint)
          })
        );
      }

      await this.swPush.unsubscribe();
      this._subscribed.set(false);
    } catch (err) {
      this._error.set(this.describe(err));
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Notificacion de prueba, **generada en local**: no pasa por el backend ni
   * por el servicio de push del navegador.
   *
   * Sirve para separar dos fallos que desde fuera se parecen mucho: "el Service
   * Worker y el permiso estan bien pero el backend no manda nada" y "no llega
   * porque el canal no esta montado". Si esta se ve y un push real no, el
   * problema esta del lado del servidor.
   *
   * La pinta el Service Worker (`registration.showNotification`) y no
   * `new Notification(...)`: el constructor no existe en Chrome Android, donde
   * toda notificacion tiene que venir de un SW.
   */
  async showTest(): Promise<void> {
    if (this._status() !== 'granted') {
      return;
    }

    this._error.set(null);

    try {
      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification('Align', {
        body: 'Notificación de prueba. El canal está montado.',
        icon: '/icons/icon-192x192.png',

        // Reemplaza la anterior en vez de apilar una por cada clic.
        tag: 'align-test',

        // Lo que lee ngsw al recibir el clic. Sin este `data` la notificacion
        // se cierra y no pasa nada mas.
        //
        // `focusLastFocusedOrOpen` y NO `navigateLastFocusedOrOpen`: la segunda
        // navega con la API de Clients del Service Worker, que es una recarga
        // completa de la app. Esta solo trae la pestana al frente —o abre una
        // si no habia ninguna— y de la navegacion se encarga `listen()` con el
        // Router, sin recargar. `url` sigue haciendo falta para el caso de que
        // no hubiera pestana abierta.
        data: {
          url: TEST_NOTIFICATION_URL,
          onActionClick: {
            default: { operation: 'focusLastFocusedOrOpen', url: TEST_NOTIFICATION_URL }
          }
        }
      });
    } catch (err) {
      this._error.set(this.describe(err));
    }
  }

  /** Ver `serverPublicKey`. El `unwrapInterceptor` deja la cadena pelada. */
  private vapidKey(): Promise<string> {
    this.serverPublicKey ??= firstValueFrom(
      this.http.get<string>('/api/notifications/vapid-public-key')
    ).catch(err => {
      this.serverPublicKey = null;
      throw err;
    });

    return this.serverPublicKey;
  }

  /**
   * `Notification.permission` no existe en todos los contextos —Safari en iOS
   * solo lo expone con la app instalada en la pantalla de inicio—, asi que se
   * comprueba en vez de leerlo a pelo.
   *
   * Que el SW este habilitado manda sobre el permiso: sin SW no hay a que
   * suscribirse, por mucho que el permiso siga concedido de otra visita.
   */
  private readStatus(): PushStatus {
    if (!this.swPush.isEnabled || typeof Notification === 'undefined') {
      return 'unsupported';
    }

    return Notification.permission as PushStatus;
  }

  /**
   * Un mensaje por causa, porque cada una pide algo distinto del usuario:
   * reabrir el permiso desde el navegador, reintentar, o avisar a quien lleva
   * el backend. Un "algo salió mal" unico las esconde todas.
   */
  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      return extractErrorMessage(err);
    }

    if (err instanceof DOMException) {
      switch (err.name) {
        case 'NotAllowedError':
          return 'Bloqueaste las notificaciones. Para activarlas hay que permitirlas desde el candado de la barra de direcciones.';
        case 'InvalidStateError':
          return 'Este navegador ya está suscrito con otra clave. Desactiva y vuelve a activar.';
        case 'NotSupportedError':
          return 'Este navegador no admite notificaciones push.';
      }
    }

    if (err instanceof Error) {
      return err.message;
    }

    return 'No se pudieron activar las notificaciones.';
  }
}

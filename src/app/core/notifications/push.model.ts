/**
 * Contratos de Web Push, contra `/api/notifications/*`. **Verificados contra
 * `/v3/api-docs` el 2026-09-01**, no contra el resumen de CLAUDE.md.
 *
 * Viven en `core/` y no en `features/habits/` **porque la suscripcion no es de
 * Habitos**: es una credencial por dispositivo y usuario, la misma que servira
 * para recordatorios de Tareas o avisos de Finanzas. Habitos es solo el primer
 * motivo para notificar, no el dueno del canal.
 */

/**
 * Cuerpo de `POST /api/notifications/subscribe` (`SubscribeRequest` en la spec).
 *
 * Es un subconjunto de lo que devuelve `PushSubscription.toJSON()`: el backend
 * declara **solo** `endpoint` y `keys`. En particular **no tiene
 * `expirationTime`**, que si forma parte del JSON estandar del navegador — por
 * eso `toRequest()` lo descarta en vez de reenviar el objeto tal cual.
 */
export interface SubscribeRequest {
  /** URL del servicio de push del navegador. Es el identificador del dispositivo. */
  endpoint: string;

  /**
   * Las dos claves con las que el servidor cifra el payload. **Sin ellas el
   * push no se puede mandar**, asi que `toRequest()` falla en vez de enviar una
   * suscripcion a medias que el backend guardaria como valida.
   */
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Convierte la suscripcion del navegador al cuerpo de la peticion.
 *
 * `toJSON()` y no `JSON.stringify(sub)`: `PushSubscription` no es un objeto
 * plano, y aunque el navegador implemente `toJSON` internamente, pasar la
 * instancia por `HttpClient` depende de ese detalle en vez de declararlo.
 *
 * Los campos son opcionales en el tipo `PushSubscriptionJSON` del DOM porque la
 * firma cubre tambien suscripciones sin cifrado. En una suscripcion VAPID real
 * siempre vienen; si faltaran, el fallo aqui es preferible a un 200 del backend
 * guardando algo con lo que nunca podra mandar nada.
 */
export function toRequest(subscription: PushSubscription): SubscribeRequest {
  const json = subscription.toJSON();
  const p256dh = json.keys?.['p256dh'];
  const auth = json.keys?.['auth'];

  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('La suscripción del navegador llegó incompleta.');
  }

  return {
    endpoint: json.endpoint,
    keys: { p256dh, auth }
  };
}

/**
 * Contratos de Habitos, contra `/api/habits`.
 *
 * El dominio mas pequeno de los tres: el backend no pagina este recurso y no
 * tiene filtros. Los dos campos editables (`name`, `scheduledTime`) tienen las
 * mismas reglas al crear que al editar, asi que no existe un
 * `HabitUpdateRequest` — crear y editar comparten `HabitRequest`.
 */

export interface HabitRequest {
  /** `maxLength: 100` en la spec viva. El formulario valida ese tope en cliente. */
  name: string;
  /**
   * Hora del dia a la que se planea hacer el habito, `"HH:mm"` — exactamente lo
   * que emite un `<input type="time">`. En el backend es un `LocalTime`
   * (`V15__add_scheduled_time_to_habits.sql`), e `ISO_LOCAL_TIME` acepta
   * `"09:00"` sin segundos, asi que no hay que rellenarlos.
   *
   * **Opcional de verdad**: un habito sin hora es valido y se hace cuando se
   * pueda. Lo unico que pierde es el recordatorio.
   *
   * **Con hora, el backend manda un push A esa hora** (`HabitReminderJob`, que
   * hace poll por minuto y dispara cuando la hora ya paso, el habito no esta
   * marcado hoy y no se ha avisado ya hoy). Es una intencion distinta del aviso
   * de las 20:00 por racha en riesgo, que sigue existiendo: un habito de las
   * 09:00 sin marcar a las 20:00 recibe los dos.
   *
   * **Omitirlo en un `PUT` la BORRA.** El endpoint REST es un reemplazo, no un
   * parche —el mapper del backend automapea los dos campos—, asi que vaciar el
   * campo en el formulario es como se quita una hora ya guardada. (La tool
   * `update_habit` del agente si hace merge, pero eso no pasa por aqui.) Por
   * eso el valor se construye siempre con `optional()` y nunca se manda `''`,
   * que el backend rechazaria con un 400 al no poder parsearlo.
   */
  scheduledTime?: string;
}

export interface HabitResponse {
  /** UUID `string`, igual que `TaskResponse.id` y `TransactionResponse.id`. */
  id: string;
  name: string;
  /**
   * La hora planificada, o `null` si el habito no tiene ninguna.
   *
   * Llega como `"HH:mm"` o `"HH:mm:ss"`: Jackson serializa `LocalTime` en ISO y
   * recorta los segundos cuando son cero. Un `<input type="time">` acepta las
   * dos formas, asi que se puede volcar tal cual al formulario; para PINTARLA
   * hay que recortar a los cinco primeros caracteres, porque `"09:00:00"` en
   * una tarjeta se lee como una precision que el dato no tiene.
   *
   * **Tipado `string`, no `Date`**, igual que `TaskResponse.dueTime`: es una
   * hora del reloj sin fecha ni zona, y meterla en un `Date` obligaria a
   * inventarle un dia para poder construirlo.
   */
  scheduledTime: string | null;
  /**
   * Racha actual en dias, **calculada por el servidor en cada lectura**.
   *
   * No se recalcula en cliente ni se incrementa a mano tras marcar una
   * completacion: la fecha de corte la decide el backend con su propio reloj y
   * su propia zona, y una segunda version del calculo aqui divergiria de la
   * suya a la primera medianoche.
   */
  currentStreak: number;
  /**
   * Racha mas larga alcanzada. Verificado en `/v3/api-docs` el 2026-08-31 —
   * CLAUDE.md no lo listaba, y por eso no se estaba usando.
   *
   * Todavia no se pinta en ninguna pantalla. Esta declarado porque el modelo es
   * el contrato con el backend y omitir un campo que existe hace creer que no
   * lo hay.
   */
  longestStreak: number;
  /**
   * Si la completacion de HOY ya esta registrada, segun el reloj del servidor.
   *
   * **El nombre del campo es `isCompletedToday`, con el prefijo `is`, y no
   * `completedToday`.** No es un capricho de estilo: es como lo serializa el
   * backend, verificado en `/v3/api-docs` el 2026-08-31. Escribirlo sin el
   * prefijo compilaria igual y fallaria en silencio — la propiedad llegaria
   * `undefined`, que es falsy, y todos los checks se quedarian grises para
   * siempre sin un solo error en consola. Es el mismo tipo de fallo mudo que el
   * `id` de `TaskResponse` tipado como `number`.
   *
   * Lo decide el servidor y no el cliente **a proposito**: es la misma frontera
   * del dia que usa para calcular `currentStreak`. Derivarla aqui a partir de
   * una fecha abriria la puerta a que el check y la racha se contradigan dentro
   * de la misma tarjeta.
   */
  isCompletedToday: boolean;
  createdAt: string;
  updatedAt: string;
}

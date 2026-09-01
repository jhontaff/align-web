/**
 * Contratos de Habitos, contra `/api/habits`.
 *
 * El dominio mas pequeno de los tres: el backend no pagina este recurso, no
 * tiene filtros y solo hay un campo editable, asi que no existe un
 * `HabitUpdateRequest` — crear y editar comparten `HabitRequest`.
 */

export interface HabitRequest {
  /** `maxLength: 100` en la spec viva. El formulario valida ese tope en cliente. */
  name: string;
}

export interface HabitResponse {
  /** UUID `string`, igual que `TaskResponse.id` y `TransactionResponse.id`. */
  id: string;
  name: string;
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

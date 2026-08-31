/**
 * Contratos de Habitos, contra `/api/habits`.
 *
 * El dominio mas pequeno de los tres: el backend no pagina este recurso, no
 * tiene filtros y solo hay un campo editable, asi que no existe un
 * `HabitUpdateRequest` — crear y editar comparten `HabitRequest`.
 */

export interface HabitRequest {
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
  createdAt: string;
  updatedAt: string;
}

/**
 * `startAt`/`endAt` son `LocalDateTime` del backend, sin zona: cadenas
 * "yyyy-MM-ddTHH:mm:ss" que representan la hora LOCAL de Align
 * (`align.timezone`), no un instante UTC. Es una desviación deliberada del
 * resto del backend (verificado contra `EventResponse.java`) — `createdAt`/
 * `updatedAt` sí son instantes UTC reales (`Instant`), así que no se leen ni
 * se escriben igual. Ver `calendar-date.ts` para las conversiones: nunca
 * `toISOString()` para mandarlas ni `new Date(iso)` a secas asumiendo que
 * hace falta forzar nada — sin zona en la cadena, el motor ya las lee como
 * hora local.
 */
export interface EventResponse {
  /** UUID, igual que el resto de ids del backend. */
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
  reminderMinutesBefore: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Un solo DTO para crear y editar — mismo criterio que `HabitRequest` en el
 * backend: las reglas de `Event` no divergen entre alta y edición (sin
 * `status` ni ningún campo exclusivo de una de las dos), así que un
 * `EventUpdateRequest` aparte sería una distinción sin diferencia.
 */
export interface EventRequest {
  title: string;
  description?: string;
  startAt: string;
  endAt?: string;
  location?: string;
  reminderMinutesBefore?: number;
}

/**
 * Filtro de `GET /api/calendar/events`. `from`/`to` son `LocalDateTime`, no
 * las fechas `yyyy-MM-dd` de `core/date/date-range.ts` — y `to` es un límite
 * EXCLUSIVO en el backend (`startAt < to`, no `<=`; verificado en
 * `EventServiceImpl.list`). Sin ninguno de los dos, el backend devuelve TODO
 * el historial del usuario sin acotar a ningún mes — no hay default de "mes
 * en curso" como sí tiene Finanzas. Construir estos límites es cosa de
 * `calendar-date.ts`, nunca a mano en quien llama al servicio.
 */
export interface EventFilter {
  from?: string;
  to?: string;
}

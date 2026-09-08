/**
 * Conversión entre el `LocalDateTime` sin zona del backend y el `Date` del
 * navegador, más los límites de un mes ya listos para `EventFilter`.
 *
 * Vive en la feature y no en `core/date/date-range.ts` porque ese archivo
 * trabaja con fechas `yyyy-MM-dd` (sin hora) — el contrato transversal que
 * usa `DateRangePicker`. `Event` necesita hora, así que es un formato
 * distinto con sus propias trampas, no una extensión del mismo.
 */

/**
 * `yyyy-MM-ddTHH:mm:ss` en hora LOCAL, tal como lo espera `EventRequest`.
 *
 * Nunca `toISOString()`: convierte a UTC antes de formatear, así que un
 * evento de las 22:00 en horarios al oeste de Greenwich se guardaría con la
 * fecha del día siguiente — el mismo motivo por el que `date-range.ts`
 * evita `toISOString()` para las fechas sin hora.
 */
export function toLocalDateTime(date: Date): string {
  const pad = (n: number): string => `${n}`.padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * El inverso. Al contrario que `parseIsoDate` en `date-range.ts`, aquí no
 * hace falta forzar nada añadiendo una hora: la cadena YA trae hora y no
 * lleva `Z` ni offset, así que el motor la lee como local por su cuenta —
 * es el caso "fecha con hora, sin zona" de la propia spec de `Date`.
 */
export function parseLocalDateTime(localDateTime: string): Date {
  return new Date(localDateTime);
}

/**
 * Límites `LocalDateTime` del mes que contiene `reference`, listos para
 * `EventFilter`.
 *
 * `to` es el primer instante del mes SIGUIENTE, no el último segundo de
 * este: el backend filtra con `startAt < to` (exclusivo), así que un límite
 * inclusivo mal puesto en "23:59:59" dejaría fuera cualquier evento que
 * empezara justo en el último segundo del mes. `Date` normaliza solo el
 * desbordamiento de diciembre a enero del año siguiente.
 */
export function monthBounds(reference: Date): { from: string; to: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  return {
    from: toLocalDateTime(new Date(year, month, 1)),
    to: toLocalDateTime(new Date(year, month + 1, 1))
  };
}

/**
 * Junta lo que salen de `<input type="date">` ("yyyy-MM-dd") y
 * `<input type="time">` ("HH:mm") en un `LocalDateTime`.
 *
 * Concatenación de cadenas, no un `Date` de por medio: los dos formatos ya
 * son exactamente los trozos que pide `EventRequest`, así que pasarlos por
 * un `Date` sería un rodeo que además podría reinterpretar algo. `date` es
 * obligatorio; `time` con valor por defecto "00:00" para el caso en que el
 * campo de hora se deje vacío en un `<input type="date">` que sí se rellenó.
 */
export function combineDateTime(date: string, time: string): string {
  return `${date}T${time || '00:00'}:00`;
}

/**
 * El inverso de `combineDateTime`, para precargar el formulario al editar.
 *
 * También por corte de cadena y no por `Date`: `startAt`/`endAt` ya vienen
 * en el formato exacto, así que partirlos en las posiciones fijas evita
 * cualquier redondeo o reinterpretación que un `Date` de por medio podría
 * introducir.
 */
export function splitLocalDateTime(localDateTime: string): { date: string; time: string } {
  return { date: localDateTime.slice(0, 10), time: localDateTime.slice(11, 16) };
}

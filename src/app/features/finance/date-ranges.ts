/**
 * Rangos de fechas para los filtros de Finanzas.
 *
 * Existe porque `GET /api/transactions/summary` sin filtro devuelve el
 * **histórico completo**, y en una app de finanzas personales ese número solo
 * crece y no responde a ninguna pregunta que el usuario se haga: la pregunta
 * real es "¿cuánto llevo gastado este mes?". El endpoint ya acepta `from`/`to`,
 * así que arrancar en el mes en curso no cuesta nada.
 *
 * Lo consumen el resumen y el listado de movimientos, así que no puede vivir
 * dentro de ninguno de los dos. Funciones puras, sin DI: mismo tipo de módulo
 * que `transaction-labels.ts`.
 */

export interface DateRange {
  /** ISO `yyyy-MM-dd`, inclusivo. */
  from: string;
  /** ISO `yyyy-MM-dd`, inclusivo. */
  to: string;
}

/**
 * Formatea una fecha **local** como `yyyy-MM-dd`.
 *
 * No usa `toISOString()`, que es la trampa clásica: convierte a UTC antes de
 * formatear, así que a partir de las 22:00 en España (23:00 en verano) devuelve
 * el día siguiente. Un gasto registrado por la noche acabaría fuera del rango
 * "este mes" el último día del mes, que es justo cuando se mira.
 */
export function toIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function today(): string {
  return toIsoDate(new Date());
}

/**
 * El día 0 del mes siguiente es el último del mes pedido, y el `Date` se ajusta
 * solo en diciembre (mes 12 → enero del año siguiente). No hace falta tratar
 * los meses de 28/30/31 días por separado ni saber si el año es bisiesto.
 */
function monthRange(year: number, month: number): DateRange {
  return {
    from: toIsoDate(new Date(year, month, 1)),
    to: toIsoDate(new Date(year, month + 1, 0))
  };
}

export function currentMonth(reference: Date = new Date()): DateRange {
  return monthRange(reference.getFullYear(), reference.getMonth());
}

export function lastMonth(reference: Date = new Date()): DateRange {
  return monthRange(reference.getFullYear(), reference.getMonth() - 1);
}

export function currentYear(reference: Date = new Date()): DateRange {
  const year = reference.getFullYear();
  return {
    from: toIsoDate(new Date(year, 0, 1)),
    to: toIsoDate(new Date(year, 11, 31))
  };
}

export type DateRangePresetId = 'currentMonth' | 'lastMonth' | 'currentYear';

export interface DateRangePreset {
  readonly id: DateRangePresetId;
  readonly label: string;
  readonly range: (reference?: Date) => DateRange;
}

/**
 * Los atajos que ofrecen resumen y movimientos.
 *
 * No incluye "Todo": un rango abierto no es un preset más, es la ausencia de
 * filtro — se expresa quitando `from`/`to`, y meterlo aquí obligaría a que
 * `range()` pudiera devolver `undefined` y a que cada consumidor tratara ese
 * caso. La acción existe igual en la interfaz, como "Limpiar filtros".
 */
export const DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  { id: 'currentMonth', label: 'Este mes', range: currentMonth },
  { id: 'lastMonth', label: 'Mes pasado', range: lastMonth },
  { id: 'currentYear', label: 'Este año', range: currentYear }
];

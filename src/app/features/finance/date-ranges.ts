import { DateRange, DateRangePreset, parseIsoDate, toIsoDate } from '../../core/date/date-range';

/**
 * Los periodos que ofrece Finanzas.
 *
 * Existe porque `GET /api/transactions/summary` sin filtro devuelve el
 * **histórico completo**, y en una app de finanzas personales ese número solo
 * crece y no responde a ninguna pregunta que el usuario se haga: la pregunta
 * real es "¿cuánto llevo gastado este mes?". El endpoint ya acepta `from`/`to`,
 * así que arrancar en el mes en curso no cuesta nada.
 *
 * `DateRange`, `toIsoDate` y `DateRangePreset` se fueron a `core/date/` cuando
 * `shared/ui/date-range-picker/` los necesitó: `shared/` no importa de una
 * feature. Lo que queda aquí es lo que sí es una decisión de Finanzas — qué
 * periodos se ofrecen y cómo se llaman.
 *
 * Funciones puras, sin DI: mismo tipo de módulo que `transaction-labels.ts`.
 */

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

// -----------------------------------------------------------------------------
// Meses
// -----------------------------------------------------------------------------
// `GET /api/transactions/summary/monthly` habla en `YearMonth` (`yyyy-MM`), no
// en fechas, así que necesita sus propias conversiones. Se quedan aquí y no
// suben a `core/date/` junto a `toIsoDate`/`parseIsoDate` por la regla del
// segundo consumidor: hoy el único que cuenta por meses es Finanzas. Suben el
// día que otra feature los pida, igual que subió `toHttpParams`.

/** Una ventana de meses, inclusiva por los dos extremos. ISO `yyyy-MM`. */
export interface MonthWindow {
  from: string;
  to: string;
}

/**
 * Formatea un `Date` **local** como `yyyy-MM`.
 *
 * Misma trampa que evita `toIsoDate`, un escalón más arriba: `toISOString()`
 * convierte a UTC antes de formatear, así que el 31 de agosto a las 22:00 en
 * Bogotá saldría como septiembre.
 */
export function toIsoMonth(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

/**
 * Convierte `yyyy-MM` en el primer día de ese mes, en hora **local**.
 *
 * Se parte la cadena a mano en vez de usar `new Date(iso)`, que es lo que
 * parece que debería funcionar: `new Date('2026-09')` es válido y devuelve
 * medianoche **UTC** del día 1, así que al oeste de Greenwich el mes que sale
 * es el anterior. Es exactamente el mismo fallo que documenta `parseIsoDate`,
 * y aquí duele más porque el resultado es la etiqueta del eje: un gráfico
 * rotulado con el mes equivocado no se lee como un bug, se lee como datos
 * malos.
 */
export function parseIsoMonth(isoMonth: string): Date {
  const [year, month] = isoMonth.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * La ventana de meses que se pide para el gráfico de flujo: `count` meses
 * consecutivos terminando en el mes del rango seleccionado.
 *
 * **Es el único bloque de la pantalla que mira más allá del periodo elegido, y
 * eso es deliberado.** El resto sale del rango tal cual, pero una tendencia
 * necesita historia: con "Este mes" seleccionado, acotar el gráfico al rango
 * dejaría una sola barra, que no es un gráfico de líneas ni de tendencia — es
 * la misma cifra que ya está escrita arriba, dibujada. Lo que sí respeta del
 * rango es dónde **termina**: cambiar a "Mes pasado" mueve la ventana entera,
 * así que el selector sigue mandando.
 *
 * **El final se recorta al mes en curso.** Sin ese tope, el preset "Este año"
 * (que llega hasta el 31 de diciembre) pediría meses futuros: son legales para
 * el backend y vuelven en cero, así que el gráfico acabaría con tres columnas
 * vacías que se leen como "dejé de ingresar" en vez de como "todavía no ha
 * pasado".
 *
 * Los meses se restan con `new Date(año, mes - n, 1)`: el `Date` normaliza los
 * índices negativos por su cuenta, así que cruzar a diciembre del año anterior
 * no necesita ningún caso aparte.
 */
export function monthWindow(range: DateRange, count: number, reference: Date = new Date()): MonthWindow {
  const rangeEnd = parseIsoDate(range.to);
  const end = rangeEnd < reference ? rangeEnd : reference;

  return {
    from: toIsoMonth(new Date(end.getFullYear(), end.getMonth() - (count - 1), 1)),
    to: toIsoMonth(end)
  };
}

/**
 * El rango de fechas como contrato transversal, y las dos conversiones entre
 * `Date` y la cadena ISO que usa el backend.
 *
 * Vive en `core/` y no en `features/finance/` por una razón estructural, no por
 * previsión: `shared/ui/date-range-picker/` necesita este tipo, y `shared/` no
 * puede importar de una feature — esa flecha no existe en el árbol canónico. La
 * pieza compartida sube, igual que subió `toHttpParams` cuando lo pidió su
 * segundo consumidor.
 *
 * Lo que **no** sube: los rangos concretos (`currentMonth`, `lastMonth`,
 * `currentYear`) ni la lista de atajos. Eso es qué periodos ofrece Finanzas, y
 * sigue en `features/finance/date-ranges.ts`. Aquí solo está lo que el
 * componente necesita para no saber nada de dominio.
 */

export interface DateRange {
  /** ISO `yyyy-MM-dd`, inclusivo. */
  from: string;
  /** ISO `yyyy-MM-dd`, inclusivo. */
  to: string;
}

/**
 * Un atajo con nombre a un rango.
 *
 * El tipo está aquí porque el picker lo recibe por `input()`, pero la lista
 * concreta la aporta quien lo monta: así el componente ofrece "Este mes" sin
 * saber que existe Finanzas, y otra pantalla puede pasarle otros atajos sin
 * tocarlo.
 */
export interface DateRangePreset {
  readonly id: string;
  readonly label: string;
  readonly range: (reference?: Date) => DateRange;
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

/**
 * El inverso, y la otra mitad del mismo problema de zonas horarias.
 *
 * `new Date('2026-08-12')` se interpreta como medianoche **UTC**, no local: en
 * cualquier zona al oeste de Greenwich la fecha resultante es la del día
 * anterior. Añadir la hora fuerza la lectura local, que es lo que quiere decir
 * una fecha sin hora.
 *
 * Estaba duplicado como método privado en `overview.ts` y, en versión suelta,
 * dentro de `dueLabel()` en `task-list.ts`. Aquí es un sitio solo.
 */
export function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

/** Mismo día del mismo mes del mismo año. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * El día 0 del mes siguiente es el último del mes pedido, y el `Date` se ajusta
 * solo en diciembre (mes 12 → enero del año siguiente). No hace falta tratar
 * los meses de 28/30/31 días por separado ni saber si el año es bisiesto.
 */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Suma días (o los resta, con un delta negativo). El `Date` se ajusta solo. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Devuelve `[desde, hasta]` ordenado.
 *
 * Existe porque en el calendario el segundo clic puede caer **antes** que el
 * primero, y el resultado tiene que ser el rango entre ambos, no un rango
 * invertido que el backend interpretaría como vacío.
 */
export function orderedRange(a: string, b: string): DateRange {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/**
 * Etiqueta legible de un rango, para el botón y para los encabezados.
 *
 * Las cuatro ramas no son adorno: la primera es el caso por defecto de la app
 * (el mes en curso), y sin ella el botón diría "1 – 30 sep 2026" donde
 * "septiembre de 2026" dice lo mismo más corto y se lee de un vistazo. Las
 * otras van quitando lo que se repite — el año cuando es el mismo, el mes
 * cuando es el mismo — porque un rango con la fecha completa dos veces obliga
 * a compararlas carácter a carácter para ver en qué se diferencian.
 */
export function formatDateRange(range: DateRange, locale: string): string {
  const from = parseIsoDate(range.from);
  const to = parseIsoDate(range.to);

  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();

  // Un año natural completo.
  if (
    sameYear &&
    from.getMonth() === 0 &&
    from.getDate() === 1 &&
    to.getMonth() === 11 &&
    to.getDate() === 31
  ) {
    return `${from.getFullYear()}`;
  }

  // Un mes natural completo.
  if (
    sameMonth &&
    from.getDate() === 1 &&
    to.getDate() === lastDayOfMonth(to.getFullYear(), to.getMonth())
  ) {
    return capitalize(from.toLocaleDateString(locale, { month: 'long', year: 'numeric' }), locale);
  }

  const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

  if (isSameDay(from, to)) {
    return from.toLocaleDateString(locale, full);
  }

  if (sameMonth) {
    return `${from.getDate()} – ${to.toLocaleDateString(locale, full)}`;
  }

  if (sameYear) {
    const start = from.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return `${start} – ${to.toLocaleDateString(locale, full)}`;
  }

  return `${from.toLocaleDateString(locale, full)} – ${to.toLocaleDateString(locale, full)}`;
}

/**
 * `Intl` devuelve los meses en minúscula en español ("septiembre de 2026"), y
 * esta cadena encabeza un botón y un `h2`. `toLocaleUpperCase` con el locale y
 * no `toUpperCase`: en turco la `i` mayúscula no es la misma letra.
 */
function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

import { DateRange, lastDayOfMonth, parseIsoDate, toIsoDate } from '../../core/date/date-range';
import { Page } from '../../core/models/page.model';
import { currentMonth, lastMonth } from './date-ranges';
import { TransactionResponse } from './models/transaction.model';

/**
 * El ritmo de gasto del mes en curso: la aritmética, sin nada de Angular.
 *
 * Existe como módulo suelto y no dentro del componente por dos razones. La
 * primera es la de siempre en este repo: `SpendingPace` recibe datos ya
 * formados, igual que `MonthlyFlow` recibe `MonthlyPoint[]` y
 * `ExpenseByCategory` recibe `CategoryAmount[]`; un componente que además
 * agregara transacciones crudas dejaría de ser tonto. La segunda es que aquí
 * está todo lo que puede estar mal —el acumulado, la ventana, la comparación— y
 * así se prueba sin `TestBed`.
 *
 * **Por qué se agrega en el cliente y no en el backend.** No hay endpoint con
 * granularidad diaria: `/summary` da un total por rango, `/summary/by-category`
 * agrega por categoría y `/summary/monthly` por mes. La curva de esta tarjeta es
 * acumulado *por día*, así que la única fuente posible hoy es
 * `GET /api/transactions` fila a fila. El día que exista un
 * `GET /api/transactions/summary/daily` —que es `MonthlySummaryService` un
 * escalón más abajo, `LocalDate` en vez de `YearMonth`— lo que cambia es de
 * dónde sale `daily`, y `buildDailySeries` desaparece sin que se entere nadie
 * más. Es la misma historia que ya vivió `categoryBreakdown()`.
 *
 * Funciones puras, sin DI, igual que `transaction-labels.ts` y `date-ranges.ts`.
 * Nada de formateo: el locale y las etiquetas los pone el componente.
 */

// -----------------------------------------------------------------------------
// Las dos ventanas
// -----------------------------------------------------------------------------

export interface PaceWindows {
  /** Del día 1 del mes en curso a **hoy**, no a fin de mes. */
  readonly current: DateRange;
  /** El mes anterior completo. */
  readonly previous: DateRange;
}

/**
 * Las dos ventanas que pide la tarjeta.
 *
 * **La actual se corta en hoy y no en fin de mes**, que es la diferencia con
 * `currentMonth()` y la razón de que esto no sea un preset más. Pedir el mes
 * entero traería los movimientos con fecha futura —el backend los acepta— y la
 * curva seguiría subiendo a la derecha del marcador de hoy, que es justo lo que
 * un gráfico de ritmo no puede hacer: afirmar gasto que todavía no ha ocurrido.
 *
 * **La anterior se pide completa** aunque la comparación se haga a mitad de mes:
 * la curva punteada llega hasta el final y el valor del día que se compara se
 * lee del acumulado, así que no hace falta una tercera petición recortada.
 */
export function paceWindows(reference: Date = new Date()): PaceWindows {
  return {
    current: { ...currentMonth(reference), to: toIsoDate(reference) },
    previous: lastMonth(reference)
  };
}

// -----------------------------------------------------------------------------
// La serie diaria
// -----------------------------------------------------------------------------

export interface DailySeries {
  /** ISO `yyyy-MM`. El componente lo convierte en "septiembre". */
  readonly month: string;
  /** Días que tiene el mes: 28, 29, 30 o 31. Es el eje X. */
  readonly daysInMonth: number;
  /**
   * Hasta qué día llegan los datos, inclusive. Igual a `daysInMonth` en un mes
   * ya cerrado; el día de hoy en el mes en curso.
   */
  readonly throughDay: number;
  /** Gasto de cada día. Índice 0 = día 1. Longitud `throughDay`. */
  readonly daily: readonly number[];
  /** Prefijo de `daily`, misma longitud. Monótono no decreciente. */
  readonly cumulative: readonly number[];
  /** El último acumulado, o 0 si la ventana está vacía. */
  readonly total: number;
  /** Días distintos con al menos un gasto. */
  readonly daysWithSpending: number;
  /**
   * La página traía todos los movimientos del periodo.
   *
   * **Es el guard que hace honesta a toda la tarjeta.** Con la agregación en el
   * cliente, un periodo que no quepa en una página no falla: devuelve los
   * primeros N movimientos y la curva se aplana a media anchura. Un gráfico
   * truncado no se lee como un error, se lee como "dejé de gastar el día 22", y
   * las cifras de abajo saldrían por debajo de las reales sin que nada lo
   * indique. Con esto, quien monta la tarjeta puede negarse a pintarla.
   */
  readonly complete: boolean;
}

/**
 * Reparte los movimientos de la página por día del mes y acumula.
 *
 * **El día se saca de la cadena (`date.slice(8, 10)`), no de un `Date`.** `date`
 * es `yyyy-MM-dd` sin hora, así que la cadena ya es la clave exacta; pasarla por
 * `new Date(...)` para leer `getDate()` reintroduce el desfase de zona que
 * documentan `parseIsoDate` y `parseIsoMonth`, y aquí el síntoma sería que cada
 * gasto se cuenta un día antes y el día 1 desaparece del mes.
 *
 * Se conservan `daily` y `cumulative`, no solo el acumulado: "días con gasto" es
 * la cuenta de entradas distintas de cero **antes** del prefijo, y sobre el
 * acumulado habría que reconstruirla comparando vecinos.
 *
 * Los movimientos fuera de la ventana se ignoran en vez de dar por hecho que no
 * llegan. La petición ya filtra por `from`/`to`, así que no debería haber
 * ninguno; el guard cuesta una comparación y evita un `daily[-1] += …` que en
 * JavaScript no falla, solo añade una propiedad que nadie vuelve a mirar.
 */
export function buildDailySeries(range: DateRange, page: Page<TransactionResponse>): DailySeries {
  const from = parseIsoDate(range.from);
  const throughDay = Number(range.to.slice(8, 10));
  const daily = new Array<number>(throughDay).fill(0);

  for (const movement of page.content) {
    const day = Number(movement.date.slice(8, 10));
    if (day >= 1 && day <= throughDay) {
      daily[day - 1] += movement.amount;
    }
  }

  const cumulative: number[] = [];
  let running = 0;
  let daysWithSpending = 0;

  for (const amount of daily) {
    running += amount;
    cumulative.push(running);
    if (amount > 0) {
      daysWithSpending++;
    }
  }

  return {
    month: range.from.slice(0, 7),
    daysInMonth: lastDayOfMonth(from.getFullYear(), from.getMonth()),
    throughDay,
    daily,
    cumulative,
    total: running,
    daysWithSpending,
    complete: page.content.length >= page.totalElements
  };
}

// -----------------------------------------------------------------------------
// Las cifras
// -----------------------------------------------------------------------------

/**
 * Días transcurridos por debajo de los cuales no se enseña la proyección.
 *
 * Con dos días de mes, `media × 30` se mueve un 50 % con una sola compra: el
 * número es correcto y no significa nada. El usuario aprende en dos meses a no
 * creerse esa cifra, y a partir de ahí deja de mirarla también el día 25, que es
 * cuando sí vale. Cinco días es donde una compra suelta deja de mover la
 * proyección más de un 20 %.
 *
 * Se oculta en lugar de marcarla como poco fiable porque una cifra con asterisco
 * sigue siendo una cifra: se lee primero y se descuenta después, si es que se
 * descuenta. El hueco no se colapsa —la tarjeta pinta un guion, igual que las
 * tres cifras del resumen mientras cargan— para que la fila no cambie de forma
 * el día 5.
 */
export const PROJECTION_MIN_DAYS = 5;

export interface PaceStats {
  readonly spent: number;
  readonly elapsedDays: number;
  readonly daysInMonth: number;
  readonly daysWithSpending: number;
  /** Sobre días **transcurridos**, no sobre días con gasto. */
  readonly dailyAverage: number;
  /** `null` antes de `PROJECTION_MIN_DAYS`. */
  readonly projection: number | null;
}

/**
 * Las tres cifras del pie de la tarjeta.
 *
 * **El promedio se divide entre días transcurridos, no entre días con gasto.**
 * Son dos preguntas distintas y solo una sirve para proyectar: dividir entre los
 * días en que hubo gasto responde "cuánto gasto cuando gasto", y multiplicar eso
 * por los días del mes da por hecho que se gasta a diario. Los días en blanco
 * son parte del ritmo, no huecos que descontar. "Días con gasto" se enseña al
 * lado justamente para que esa distinción se vea.
 */
export function paceStats(series: DailySeries): PaceStats {
  const elapsedDays = series.throughDay;
  const dailyAverage = elapsedDays > 0 ? series.total / elapsedDays : 0;

  return {
    spent: series.total,
    elapsedDays,
    daysInMonth: series.daysInMonth,
    daysWithSpending: series.daysWithSpending,
    dailyAverage,
    projection: elapsedDays >= PROJECTION_MIN_DAYS ? dailyAverage * series.daysInMonth : null
  };
}

// -----------------------------------------------------------------------------
// La comparación
// -----------------------------------------------------------------------------

export interface PaceComparison {
  /** El día en el que se comparan las dos series. */
  readonly day: number;
  readonly current: number;
  readonly previous: number;
  /** `current - previous`. Negativo es gastar menos, o sea ir mejor. */
  readonly difference: number;
}

/**
 * Cuánto se lleva gastado frente al mes anterior **a la misma altura del mes**.
 *
 * Comparar contra el mes anterior entero diría "vas 800.000 por debajo" el día 2
 * de cada mes: verdad y ruido. La comparación útil es al mismo día ordinal.
 *
 * **Los dos lados se recortan al mismo día**, y no solo el anterior. Con hoy a
 * 30 de marzo y febrero de 28 días, comparar los 30 de marzo contra los 28 de
 * febrero mete dos días de diferencia dentro de la resta y puede darle la vuelta
 * al signo. Tomando `min(...)` los dos acumulados hablan del mismo número de
 * días, que es la única forma de que la resta signifique algo. Solo se nota en
 * los últimos días de un mes más largo que el anterior; el resto del tiempo
 * `day` es el día de hoy.
 *
 * `null` cuando el mes anterior no tiene ni un gasto registrado: la resta
 * existiría, pero diría "vas 720.000 por encima de agosto" cuando lo que pasa es
 * que agosto no está en la app. Un dato ausente no es un cero.
 */
export function paceComparison(current: DailySeries, previous: DailySeries): PaceComparison | null {
  if (previous.total === 0) {
    return null;
  }

  const day = Math.min(current.throughDay, previous.throughDay);
  if (day < 1) {
    return null;
  }

  const currentSpent = current.cumulative[day - 1] ?? 0;
  const previousSpent = previous.cumulative[day - 1] ?? 0;

  return {
    day,
    current: currentSpent,
    previous: previousSpent,
    difference: currentSpent - previousSpent
  };
}

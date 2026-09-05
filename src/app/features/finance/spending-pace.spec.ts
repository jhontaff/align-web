import { DateRange } from '../../core/date/date-range';
import { Page } from '../../core/models/page.model';
import { TransactionResponse } from './models/transaction.model';
import {
  buildDailySeries,
  paceComparison,
  paceStats,
  paceWindows,
  PROJECTION_MIN_DAYS
} from './spending-pace';

/**
 * Pruebas del módulo puro del ritmo de gasto.
 *
 * Sin `TestBed` a propósito: aquí está toda la aritmética de la tarjeta y nada
 * de Angular, que es justamente la razón de que viva fuera del componente.
 */

/** Un movimiento con lo mínimo que mira `buildDailySeries`. */
function movement(date: string, amount: number): TransactionResponse {
  return {
    id: `id-${date}-${amount}`,
    type: 'EXPENSE',
    amount,
    category: 'FOOD',
    description: null,
    date,
    createdAt: `${date}T10:00:00`,
    updatedAt: `${date}T10:00:00`
  };
}

/**
 * `totalElements` por defecto es el número de filas, o sea una página completa.
 * Se pasa distinto solo en la prueba del truncamiento.
 */
function page(content: TransactionResponse[], totalElements = content.length): Page<TransactionResponse> {
  return {
    content,
    totalElements,
    totalPages: 1,
    number: 0,
    size: content.length,
    first: true,
    last: true
  };
}

const SEPTEMBER_TO_15: DateRange = { from: '2026-09-01', to: '2026-09-15' };

describe('paceWindows', () => {
  it('corta la ventana actual en hoy, no a fin de mes', () => {
    const { current } = paceWindows(new Date(2026, 8, 15));

    expect(current).toEqual({ from: '2026-09-01', to: '2026-09-15' });
  });

  it('pide el mes anterior completo', () => {
    const { previous } = paceWindows(new Date(2026, 8, 15));

    expect(previous).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('cruza a diciembre del año anterior en enero', () => {
    const { current, previous } = paceWindows(new Date(2026, 0, 3));

    expect(current).toEqual({ from: '2026-01-01', to: '2026-01-03' });
    expect(previous).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('el último día del mes deja la ventana actual igual al mes natural', () => {
    const { current } = paceWindows(new Date(2026, 8, 30));

    expect(current).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
});

describe('buildDailySeries', () => {
  it('reparte los movimientos por día y acumula', () => {
    const series = buildDailySeries(
      SEPTEMBER_TO_15,
      page([movement('2026-09-01', 100), movement('2026-09-03', 50), movement('2026-09-03', 25)])
    );

    expect(series.daily.slice(0, 4)).toEqual([100, 0, 75, 0]);
    expect(series.cumulative.slice(0, 4)).toEqual([100, 100, 175, 175]);
    expect(series.total).toBe(175);
  });

  it('cuenta días distintos con gasto, no movimientos', () => {
    const series = buildDailySeries(
      SEPTEMBER_TO_15,
      page([movement('2026-09-03', 10), movement('2026-09-03', 20), movement('2026-09-09', 30)])
    );

    expect(series.daysWithSpending).toBe(2);
  });

  it('las series tienen exactamente `throughDay` entradas', () => {
    const series = buildDailySeries(SEPTEMBER_TO_15, page([]));

    expect(series.throughDay).toBe(15);
    expect(series.daily.length).toBe(15);
    expect(series.cumulative.length).toBe(15);
    expect(series.total).toBe(0);
  });

  it('el día 1 cuenta en su propio día — la fecha se lee de la cadena, no de un Date', () => {
    // La regresión que vigila: parsear `'2026-09-01'` con `new Date(...)` da
    // medianoche UTC y al oeste de Greenwich `getDate()` devuelve 31 de agosto,
    // así que el primer día del mes desaparecería de la curva.
    const series = buildDailySeries(SEPTEMBER_TO_15, page([movement('2026-09-01', 500)]));

    expect(series.daily[0]).toBe(500);
    expect(series.total).toBe(500);
  });

  it('saca los días del mes del calendario, incluido febrero bisiesto', () => {
    const leap = buildDailySeries({ from: '2028-02-01', to: '2028-02-10' }, page([]));
    const common = buildDailySeries({ from: '2026-02-01', to: '2026-02-10' }, page([]));

    expect(leap.daysInMonth).toBe(29);
    expect(common.daysInMonth).toBe(28);
  });

  it('ignora los movimientos fuera de la ventana', () => {
    const series = buildDailySeries(
      SEPTEMBER_TO_15,
      page([movement('2026-09-02', 10), movement('2026-09-20', 999)])
    );

    expect(series.total).toBe(10);
    expect(series.daily.length).toBe(15);
  });

  it('marca la serie incompleta cuando la página no trae todo el periodo', () => {
    const truncated = buildDailySeries(SEPTEMBER_TO_15, page([movement('2026-09-02', 10)], 240));
    const whole = buildDailySeries(SEPTEMBER_TO_15, page([movement('2026-09-02', 10)]));

    expect(truncated.complete).toBeFalse();
    expect(whole.complete).toBeTrue();
  });
});

describe('paceStats', () => {
  it('promedia sobre días transcurridos y proyecta al mes completo', () => {
    // 720.000 en quince días de un mes de treinta: los números del diseño.
    const series = buildDailySeries(SEPTEMBER_TO_15, page([movement('2026-09-10', 720_000)]));
    const stats = paceStats(series);

    expect(stats.dailyAverage).toBe(48_000);
    expect(stats.projection).toBe(1_440_000);
    expect(stats.daysInMonth).toBe(30);
  });

  it('no promedia sobre los días con gasto', () => {
    // Un único día con 300 en diez transcurridos: 30 al día, no 300.
    const series = buildDailySeries(
      { from: '2026-09-01', to: '2026-09-10' },
      page([movement('2026-09-04', 300)])
    );

    expect(paceStats(series).dailyAverage).toBe(30);
    expect(paceStats(series).daysWithSpending).toBe(1);
  });

  it('oculta la proyección antes del quinto día', () => {
    const early = buildDailySeries(
      { from: '2026-09-01', to: `2026-09-0${PROJECTION_MIN_DAYS - 1}` },
      page([movement('2026-09-01', 100)])
    );
    const onThreshold = buildDailySeries(
      { from: '2026-09-01', to: `2026-09-0${PROJECTION_MIN_DAYS}` },
      page([movement('2026-09-01', 100)])
    );

    expect(early.throughDay).toBe(PROJECTION_MIN_DAYS - 1);
    expect(paceStats(early).projection).toBeNull();
    expect(paceStats(onThreshold).projection).not.toBeNull();
  });

  it('una ventana sin gasto da media cero sin dividir por cero', () => {
    const stats = paceStats(buildDailySeries(SEPTEMBER_TO_15, page([])));

    expect(stats.dailyAverage).toBe(0);
    expect(stats.projection).toBe(0);
  });
});

describe('paceComparison', () => {
  const current = buildDailySeries(SEPTEMBER_TO_15, page([movement('2026-09-05', 720_000)]));

  it('compara al mismo día ordinal, no contra el mes anterior entero', () => {
    const previous = buildDailySeries(
      { from: '2026-08-01', to: '2026-08-31' },
      page([movement('2026-08-05', 900_000), movement('2026-08-25', 1_000_000)])
    );

    const result = paceComparison(current, previous)!;

    expect(result.day).toBe(15);
    expect(result.previous).toBe(900_000);
    // El gasto del día 25 de agosto queda fuera: a día 15 todavía no existía.
    expect(result.difference).toBe(-180_000);
  });

  it('recorta LOS DOS lados al mismo día cuando el mes anterior es más corto', () => {
    // 30 de marzo contra febrero, que solo tiene 28: la resta se hace a día 28
    // por los dos lados, así que los dos días de más de marzo no cuentan.
    const march = buildDailySeries(
      { from: '2026-03-01', to: '2026-03-30' },
      page([movement('2026-03-10', 400), movement('2026-03-29', 500)])
    );
    const february = buildDailySeries(
      { from: '2026-02-01', to: '2026-02-28' },
      page([movement('2026-02-10', 300)])
    );

    const result = paceComparison(march, february)!;

    expect(result.day).toBe(28);
    expect(result.current).toBe(400);
    expect(result.difference).toBe(100);
  });

  it('no compara contra un mes sin datos', () => {
    const empty = buildDailySeries({ from: '2026-08-01', to: '2026-08-31' }, page([]));

    expect(paceComparison(current, empty)).toBeNull();
  });
});

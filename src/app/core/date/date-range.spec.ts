import { addDays, formatDateRange, orderedRange, parseIsoDate, toIsoDate } from './date-range';

describe('toIsoDate / parseIsoDate — la ida y la vuelta sin pasar por UTC', () => {
  it('formatea la fecha LOCAL, no la UTC', () => {
    // 23:30 local del 12 de agosto. `toISOString()` daría el 13 en cualquier
    // zona al este de Greenwich y el 12 al oeste: el bug clásico que hace que
    // un gasto registrado de noche caiga fuera del rango "este mes" justo el
    // último día del mes.
    expect(toIsoDate(new Date(2026, 7, 12, 23, 30))).toBe('2026-08-12');
  });

  it('rellena mes y día con cero', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('parsea a medianoche LOCAL, no UTC', () => {
    const date = parseIsoDate('2026-08-12');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    // Sin el `T00:00:00`, al oeste de Greenwich esto sería 11.
    expect(date.getDate()).toBe(12);
  });

  it('ida y vuelta es la identidad', () => {
    expect(toIsoDate(parseIsoDate('2026-02-29'))).toBe('2026-03-01');
    expect(toIsoDate(parseIsoDate('2024-02-29'))).toBe('2024-02-29');
  });
});

describe('addDays', () => {
  it('cruza el fin de mes', () => {
    expect(toIsoDate(addDays(parseIsoDate('2026-01-31'), 1))).toBe('2026-02-01');
  });

  it('cruza el fin de año hacia atrás', () => {
    expect(toIsoDate(addDays(parseIsoDate('2026-01-01'), -1))).toBe('2025-12-31');
  });

  it('respeta el año bisiesto', () => {
    expect(toIsoDate(addDays(parseIsoDate('2024-02-28'), 1))).toBe('2024-02-29');
    expect(toIsoDate(addDays(parseIsoDate('2026-02-28'), 1))).toBe('2026-03-01');
  });
});

describe('orderedRange', () => {
  it('deja el rango como está cuando ya viene ordenado', () => {
    expect(orderedRange('2026-09-01', '2026-09-30')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30'
    });
  });

  it('INTERCAMBIA cuando el segundo extremo es anterior', () => {
    // Es el caso del segundo clic hacia atrás en el calendario. Sin esto el
    // rango saldría invertido y el backend lo interpretaría como vacío.
    expect(orderedRange('2026-09-30', '2026-09-01')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30'
    });
  });

  it('admite un rango de un solo día', () => {
    expect(orderedRange('2026-09-05', '2026-09-05')).toEqual({
      from: '2026-09-05',
      to: '2026-09-05'
    });
  });
});

describe('formatDateRange — cada rama quita lo que se repite', () => {
  const es = 'es-ES';

  it('un mes natural completo se dice por su nombre', () => {
    // La rama que importa: es el rango por defecto de la app.
    expect(formatDateRange({ from: '2026-09-01', to: '2026-09-30' }, es)).toBe(
      'Septiembre de 2026'
    );
  });

  it('reconoce febrero bisiesto como mes completo', () => {
    expect(formatDateRange({ from: '2024-02-01', to: '2024-02-29' }, es)).toBe(
      'Febrero de 2024'
    );
  });

  it('febrero al día 28 en año bisiesto NO es el mes completo', () => {
    expect(formatDateRange({ from: '2024-02-01', to: '2024-02-28' }, es)).not.toBe(
      'Febrero de 2024'
    );
  });

  it('un año natural completo es solo el año', () => {
    expect(formatDateRange({ from: '2026-01-01', to: '2026-12-31' }, es)).toBe('2026');
  });

  it('un solo día se dice una vez, no dos', () => {
    const label = formatDateRange({ from: '2026-09-05', to: '2026-09-05' }, es);
    expect(label).not.toContain('–');
  });

  it('dentro del mismo mes no repite el mes en el extremo inicial', () => {
    const label = formatDateRange({ from: '2026-09-05', to: '2026-09-20' }, es);
    expect(label).toContain('5 –');
    expect(label).toContain('2026');
  });

  it('cruzando el año escribe el año en los dos extremos', () => {
    const label = formatDateRange({ from: '2025-12-20', to: '2026-01-10' }, es);
    expect(label).toContain('2025');
    expect(label).toContain('2026');
  });
});

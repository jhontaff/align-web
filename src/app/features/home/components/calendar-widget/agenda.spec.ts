import { EventResponse } from '../../../calendar/models/event.model';
import { TaskResponse } from '../../../tasks/models/task.model';
import { TransactionResponse } from '../../../finance/models/transaction.model';
import {
  eventToAgendaItem,
  groupAgendaByDay,
  groupItemsByKind,
  monthDateBounds,
  taskToAgendaItem,
  transactionToAgendaItem,
  weekDateBounds
} from './agenda';

function event(id: string, startAt: string, title = 'Reunión'): EventResponse {
  return {
    id,
    title,
    description: null,
    startAt,
    endAt: null,
    location: null,
    reminderMinutesBefore: null,
    createdAt: startAt,
    updatedAt: startAt
  };
}

function task(id: string, dueDate: string | null, status: TaskResponse['status'] = 'PENDING', dueTime: string | null = null): TaskResponse {
  return {
    id,
    title: 'Tarea',
    description: null,
    status,
    priority: 'MEDIUM',
    dueDate,
    dueTime,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  };
}

function transaction(
  id: string,
  date: string,
  type: TransactionResponse['type'] = 'EXPENSE',
  description: string | null = null
): TransactionResponse {
  return {
    id,
    type,
    amount: 10,
    category: type === 'INCOME' ? 'SALARY' : 'FOOD',
    description,
    date,
    createdAt: `${date}T00:00:00Z`,
    updatedAt: `${date}T00:00:00Z`
  };
}

describe('eventToAgendaItem', () => {
  it('saca la fecha y la hora de startAt, tono primary', () => {
    const { dateIso, item } = eventToAgendaItem(event('e1', '2026-09-15T14:30:00'));

    expect(dateIso).toBe('2026-09-15');
    expect(item).toEqual({ id: 'e1', kind: 'event', title: 'Reunión', time: '14:30', tone: 'primary' });
  });
});

describe('taskToAgendaItem', () => {
  it('sin dueDate no genera ítem', () => {
    expect(taskToAgendaItem(task('t1', null))).toBeNull();
  });

  // `CANCELLED`/`EXPIRED` existen en el backend pero no en `TaskStatus` de
  // esta rama (viven en `bugfix`, sin mezclar) — `ACTIONABLE_TASK_STATUSES`
  // ya los cubre por construcción (solo entran PENDING/IN_PROGRESS), pero
  // aquí solo se puede probar con lo que el tipo admite hoy.
  it('COMPLETED no genera ítem — ya no es "algo que pasa ese día"', () => {
    expect(taskToAgendaItem(task('t1', '2026-09-15', 'COMPLETED'))).toBeNull();
  });

  it('PENDING/IN_PROGRESS sí generan ítem, tono warning', () => {
    expect(taskToAgendaItem(task('t1', '2026-09-15', 'PENDING'))?.item.tone).toBe('warning');
    expect(taskToAgendaItem(task('t1', '2026-09-15', 'IN_PROGRESS'))?.item.tone).toBe('warning');
  });

  it('dueTime con segundos se recorta a HH:mm', () => {
    const result = taskToAgendaItem(task('t1', '2026-09-15', 'PENDING', '09:00:00'));
    expect(result?.item.time).toBe('09:00');
  });

  it('sin dueTime, el ítem no tiene hora', () => {
    const result = taskToAgendaItem(task('t1', '2026-09-15', 'PENDING', null));
    expect(result?.item.time).toBeNull();
  });
});

describe('transactionToAgendaItem', () => {
  it('sin hora, siempre', () => {
    expect(transactionToAgendaItem(transaction('x1', '2026-09-15')).item.time).toBeNull();
  });

  it('el título es la descripción cuando existe', () => {
    const { item } = transactionToAgendaItem(transaction('x1', '2026-09-15', 'EXPENSE', 'Supermercado'));
    expect(item.title).toBe('Supermercado');
  });

  it('sin descripción, el título cae a la etiqueta de categoría', () => {
    const { item } = transactionToAgendaItem(transaction('x1', '2026-09-15', 'EXPENSE', null));
    expect(item.title).toBe('Alimentación');
  });

  it('ingreso → success, gasto → danger', () => {
    expect(transactionToAgendaItem(transaction('x1', '2026-09-15', 'INCOME')).item.tone).toBe('success');
    expect(transactionToAgendaItem(transaction('x1', '2026-09-15', 'EXPENSE')).item.tone).toBe('danger');
  });
});

describe('groupAgendaByDay', () => {
  it('agrupa los tres orígenes por su propia fecha (startAt, dueDate, date)', () => {
    const map = groupAgendaByDay(
      [event('e1', '2026-09-15T10:00:00')],
      [task('t1', '2026-09-15')],
      [transaction('x1', '2026-09-16')]
    );

    expect(map.get('2026-09-15')!.map(i => i.id)).toEqual(['e1', 't1']);
    expect(map.get('2026-09-16')!.map(i => i.id)).toEqual(['x1']);
  });

  it('descarta tareas no accionables al fusionar', () => {
    const map = groupAgendaByDay([], [task('t1', '2026-09-15', 'COMPLETED')], []);
    expect(map.has('2026-09-15')).toBeFalse();
  });

  it('ordena cada día por hora, y los ítems sin hora van al final', () => {
    const map = groupAgendaByDay(
      [event('e1', '2026-09-15T14:00:00'), event('e2', '2026-09-15T09:00:00')],
      [task('t1', '2026-09-15', 'PENDING', null)],
      [transaction('x1', '2026-09-15')]
    );

    // e2 (09:00) antes que e1 (14:00); los dos sin hora (tarea, transacción) al final.
    expect(map.get('2026-09-15')!.map(i => i.id)).toEqual(['e2', 'e1', 't1', 'x1']);
  });
});

describe('groupItemsByKind', () => {
  it('reparte en orden fijo evento → tarea → transacción, y omite los grupos vacíos', () => {
    const map = groupAgendaByDay(
      [event('e1', '2026-09-15T10:00:00')],
      [],
      [transaction('x1', '2026-09-15')]
    );

    const groups = groupItemsByKind(map.get('2026-09-15')!);

    expect(groups.map(g => g.kind)).toEqual(['event', 'transaction']);
    expect(groups.map(g => g.label)).toEqual(['Eventos', 'Transacciones']);
  });

  it('lista vacía → sin grupos', () => {
    expect(groupItemsByKind([])).toEqual([]);
  });
});

describe('monthDateBounds', () => {
  it('primer y último día del mes de la fecha dada', () => {
    expect(monthDateBounds(new Date(2026, 1, 15))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('weekDateBounds', () => {
  it('del lunes dado al domingo, 6 días después', () => {
    expect(weekDateBounds(new Date(2026, 8, 7))).toEqual({ from: '2026-09-07', to: '2026-09-13' });
  });
});

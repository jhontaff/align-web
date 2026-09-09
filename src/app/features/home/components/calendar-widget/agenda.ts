/**
 * Fusión de tres dominios en una sola línea de tiempo: eventos de Calendario, tareas con vencimiento y transacciones.
 * Vive junto a `calendar-widget.ts`, no en `core/` ni en las features de origen: es una vista compuesta de un solo widget.
 * Funciones puras, sin DI — mismo criterio que `calendar-date.ts`.
 */

import { addDays, lastDayOfMonth, toIsoDate } from '../../../../core/date/date-range';
import { splitLocalDateTime } from '../../../calendar/calendar-date';
import { EventResponse } from '../../../calendar/models/event.model';
import { TaskResponse } from '../../../tasks/models/task.model';
import { TransactionResponse } from '../../../finance/models/transaction.model';
import { CATEGORY_LABELS } from '../../../finance/transaction-labels';

export type AgendaKind = 'event' | 'task' | 'transaction';

/** Tono semántico por dominio, no posicional: evento → primary, tarea → warning, transacción ingreso → success, gasto → danger. */
export type AgendaTone = 'primary' | 'success' | 'warning' | 'danger';

export interface AgendaItem {
  readonly id: string;
  readonly kind: AgendaKind;
  readonly title: string;
  /** `null` = sin hora — transacciones (no la tienen) o tareas sin `dueTime`. */
  readonly time: string | null;
  readonly tone: AgendaTone;
}

/** Un grupo de `groupItemsByKind()`. */
export interface AgendaGroup {
  readonly kind: AgendaKind;
  readonly label: string;
  readonly items: readonly AgendaItem[];
}

/** Encabezado de grupo ("Eventos", "Tareas", "Transacciones"). */
export const AGENDA_KIND_LABELS: Record<AgendaKind, string> = {
  event: 'Eventos',
  task: 'Tareas',
  transaction: 'Transacciones'
};

/** Singular, para nombrar UN ítem — prefijo accesible junto al color de cada fila. */
export const AGENDA_KIND_LABELS_SINGULAR: Record<AgendaKind, string> = {
  event: 'Evento',
  task: 'Tarea',
  transaction: 'Transacción'
};

/** Orden fijo, no el de llegada: evento primero (lo más propio de un calendario), transacción al final (lo más ajeno). */
const GROUP_ORDER: readonly AgendaKind[] = ['event', 'task', 'transaction'];

/** Reparte una lista de agenda de UN día (ya ordenada por hora) en sus tres dominios; omite los grupos vacíos. */
export function groupItemsByKind(items: readonly AgendaItem[]): AgendaGroup[] {
  return GROUP_ORDER.map(kind => ({
    kind,
    label: AGENDA_KIND_LABELS[kind],
    items: items.filter(item => item.kind === kind)
  })).filter(group => group.items.length > 0);
}

/** Solo lo accionable — una tarea `COMPLETED`/`CANCELLED`/`EXPIRED` ya no es "algo que pasa ese día". */
const ACTIONABLE_TASK_STATUSES: ReadonlySet<string> = new Set(['PENDING', 'IN_PROGRESS']);

export function eventToAgendaItem(event: EventResponse): { readonly dateIso: string; readonly item: AgendaItem } {
  const { date, time } = splitLocalDateTime(event.startAt);
  return { dateIso: date, item: { id: event.id, kind: 'event', title: event.title, time, tone: 'primary' } };
}

/** `null` cuando la tarea no tiene `dueDate` o no está en un estado accionable. */
export function taskToAgendaItem(task: TaskResponse): { readonly dateIso: string; readonly item: AgendaItem } | null {
  if (!task.dueDate || !ACTIONABLE_TASK_STATUSES.has(task.status)) {
    return null;
  }
  return {
    dateIso: task.dueDate,
    item: {
      id: task.id,
      kind: 'task',
      title: task.title,
      // Jackson recorta los segundos cuando son cero; los 5 primeros caracteres cubren las dos formas.
      time: task.dueTime ? task.dueTime.slice(0, 5) : null,
      tone: 'warning'
    }
  };
}

export function transactionToAgendaItem(transaction: TransactionResponse): {
  readonly dateIso: string;
  readonly item: AgendaItem;
} {
  return {
    dateIso: transaction.date,
    item: {
      id: transaction.id,
      kind: 'transaction',
      // Sin descripción, la categoría identifica la transacción — igual que en `transaction-row`.
      title: transaction.description || CATEGORY_LABELS[transaction.category],
      time: null,
      tone: transaction.type === 'INCOME' ? 'success' : 'danger'
    }
  };
}

/** Agrupa los tres orígenes por día; ordena cada grupo por hora, con los ítems sin hora al final. */
export function groupAgendaByDay(
  events: readonly EventResponse[],
  tasks: readonly TaskResponse[],
  transactions: readonly TransactionResponse[]
): Map<string, AgendaItem[]> {
  const map = new Map<string, AgendaItem[]>();
  const push = (dateIso: string, item: AgendaItem): void => {
    const list = map.get(dateIso);
    if (list) {
      list.push(item);
    } else {
      map.set(dateIso, [item]);
    }
  };

  for (const event of events) {
    const { dateIso, item } = eventToAgendaItem(event);
    push(dateIso, item);
  }

  for (const task of tasks) {
    const result = taskToAgendaItem(task);
    if (result) {
      push(result.dateIso, result.item);
    }
  }

  for (const transaction of transactions) {
    const { dateIso, item } = transactionToAgendaItem(transaction);
    push(dateIso, item);
  }

  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.time === b.time) {
        return 0;
      }
      if (a.time === null) {
        return 1;
      }
      if (b.time === null) {
        return -1;
      }
      return a.time < b.time ? -1 : 1;
    });
  }

  return map;
}

/** Límites `yyyy-MM-dd` (inclusivos) del mes de `reference`, para Tareas/Transacciones — equivalente sin hora de `monthBounds()`. */
export function monthDateBounds(reference: Date): { readonly from: string; readonly to: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  return {
    from: toIsoDate(new Date(year, month, 1)),
    to: toIsoDate(new Date(year, month, lastDayOfMonth(year, month)))
  };
}

/** Igual que `monthDateBounds`, para la semana (lunes-domingo) que empieza en `monday`. */
export function weekDateBounds(monday: Date): { readonly from: string; readonly to: string } {
  return { from: toIsoDate(monday), to: toIsoDate(addDays(monday, 6)) };
}

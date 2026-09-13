import { Observable, catchError, map, of } from 'rxjs';
import { PendingActionResponse } from '../../features/chat/models/pending-action.model';
import { CATEGORY_LABELS } from '../../features/finance/transaction-labels';
import { TransactionService } from '../../features/finance/transaction.service';
import { HabitService } from '../../features/habits/habit.service';
import { TaskService } from '../../features/tasks/task.service';

export interface DeleteTargetServices {
  taskService: TaskService;
  transactionService: TransactionService;
  habitService: HabitService;
}

/** Todo lo que hay en `arguments` hoy es un único id (ver el doc de `pending-action-labels.ts`). */
function firstStringValue(args: Record<string, unknown>): string | null {
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

/**
 * Pide el nombre legible del elemento que una tool de eliminar va a borrar.
 *
 * `PendingActionResponse.arguments` solo trae un id (`{ taskId: "..." }`,
 * verificado 2026-09-12 contra el backend real) — sin esto el diálogo no
 * puede decir más que "se eliminará la tarea", sin decir cuál. La única forma
 * de conseguir el nombre es pedírselo a la feature dueña del dato.
 *
 * Vive en `layout/` y no en `features/chat/` precisamente porque cruza a tres
 * features (`tasks`, `finance`, `habits`) — el mismo principio que ya permite
 * a `layout/chat-panel/` inyectar `ChatStore`: el shell compone features para
 * montarlas, las features no se importan entre sí. Aquí el shell necesita
 * identificar un dato ajeno solo para nombrarlo en un diálogo, nunca para
 * mostrar ni reutilizar el componente de otra feature.
 */
export function resolveDeleteTarget(action: PendingActionResponse, services: DeleteTargetServices): Observable<string | null> {
  const id = firstStringValue(action.arguments);
  if (!id) {
    return of(null);
  }

  switch (action.toolName) {
    case 'delete_task':
      return services.taskService.get(id).pipe(
        map(task => task.title),
        catchError(() => of(null))
      );

    case 'delete_transaction':
      // `description` es opcional en una transacción; sin él, la categoría
      // (ya traducida) es lo único identificable que queda.
      return services.transactionService.get(id).pipe(
        map(transaction => transaction.description ?? CATEGORY_LABELS[transaction.category]),
        catchError(() => of(null))
      );

    case 'delete_habit':
      return services.habitService.get(id).pipe(
        map(habit => habit.name),
        catchError(() => of(null))
      );

    default:
      // `toolName` no es un enum cerrado — una tool desconocida no tiene
      // dónde buscar su nombre, así que se queda en el genérico.
      return of(null);
  }
}

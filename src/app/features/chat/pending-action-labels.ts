import { PendingActionResponse } from './models/pending-action.model';

/**
 * `toolName` es `string` libre en el contrato del backend, no un enum cerrado
 * como `TaskStatus`/`Priority` — así que este mapa es best-effort y siempre
 * necesita el fallback genérico de abajo, no un `@switch` exhaustivo.
 *
 * Nombres verificados 2026-09-12 contra una eliminación real (`delete_task`,
 * snake_case) — no `deleteTask` como se había asumido antes de probar contra
 * el backend vivo. Se dejan `delete_transaction`/`delete_habit` por simetría,
 * sin confirmar todavía.
 */
const DELETE_TOOL_LABELS: Record<string, string> = {
  delete_task: 'la tarea',
  delete_transaction: 'la transacción',
  delete_habit: 'el hábito',
};

/**
 * Claves donde puede venir un identificador legible directamente en
 * `arguments`, sin tener que pedirlo al backend. Igual de best-effort que el
 * mapa de arriba. **Verificado 2026-09-12: hoy `arguments` solo trae un id**
 * (`{ taskId: "..." }`), ninguna de estas claves — así que esta rama no se
 * ejerce todavía en la práctica. El nombre real se resuelve aparte, ver
 * `resolveDeleteTarget()` en `layout/pending-delete-confirm/`.
 */
const IDENTIFIER_KEYS = ['title', 'name', 'description'];

function extractIdentifier(args: Record<string, unknown>): string | null {
  for (const key of IDENTIFIER_KEYS) {
    const value = args[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

/**
 * `resolvedIdentifier` es el nombre real, pedido por `resolveDeleteTarget()`
 * con un `GET` al servicio dueño del dato (`TaskService`/`TransactionService`/
 * `HabitService`) — la única fuente que puede dar un nombre de verdad, porque
 * `arguments` no lo trae. Se prioriza sobre `extractIdentifier`, que solo
 * existe como red de seguridad por si el backend algún día empieza a mandar
 * un nombre legible directamente en `arguments` y este archivo no se
 * actualiza a tiempo.
 */
export function pendingDeleteMessage(action: PendingActionResponse, resolvedIdentifier?: string | null): string {
  const label = DELETE_TOOL_LABELS[action.toolName] ?? 'este elemento';
  const identifier = resolvedIdentifier ?? extractIdentifier(action.arguments);

  return identifier
    ? `Se eliminará ${label} «${identifier}» de forma permanente.`
    : `Se eliminará ${label} de forma permanente.`;
}

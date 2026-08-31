export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Filtros que acepta `GET /api/tasks`.
 *
 * Solo `status`: es lo unico que el backend soporta hoy. El tipo no promete
 * mas de lo que hay — anadir aqui un `search` o un `priority` haria que el
 * compilador aceptara una llamada que el servidor ignora en silencio.
 */
export interface TaskFilter {
  status?: TaskStatus;
}

export interface TaskRequest {
  title: string;
  description?: string;
  priority: TaskPriority;
  dueDate?: string;
  dueTime?: string;
}

export interface TaskResponse {
  /**
   * UUID, no numero. Verificado contra la spec viva del backend
   * (`/v3/api-docs`): `TaskResponse.id` es `string (uuid)` y el path param de
   * `/api/tasks/{id}` es `string`.
   *
   * Estuvo tipado como `number` y por eso el detalle pedia `/api/tasks/NaN`:
   * al convertir el segmento de la URL con `numberAttribute`, un UUID no es un
   * numero y la conversion devuelve NaN sin fallar.
   */
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  dueTime: string | null;
  createdAt: string;
  updatedAt: string;
}

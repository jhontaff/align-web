export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

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

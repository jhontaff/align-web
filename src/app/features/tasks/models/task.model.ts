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
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  dueTime: string | null;
  createdAt: string;
  updatedAt: string;
}

import { ChangeDetectionStrategy, Component, LOCALE_ID, inject, input } from '@angular/core';
import { Icon } from '../../../../shared/ui/icon/icon';
import { TaskResponse } from '../../models/task.model';

/**
 * Cuerpo de la vista de una tarea: título, badges y lista de campos.
 * No trae chrome ni acciones — las pone quien monta: la ruta `TaskDetail` o `TaskDetailDialog`.
 * La tarea llega cargada por `input()`: las dos cáscaras ya la necesitan para sus propias decisiones.
 */
@Component({
  selector: 'app-task-detail-view',
  imports: [Icon],
  templateUrl: './task-detail-view.html',
  styleUrl: './task-detail-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetailView {
  private readonly locale = inject(LOCALE_ID);

  readonly task = input.required<TaskResponse>();

  /** Nivel del encabezado: en la ruta el título es el `<h1>`; en el diálogo, Inicio ya tiene el suyo. */
  readonly headingLevel = input<1 | 2>(1);

  /** Lo consume el `aria-labelledby` del diálogo; en la ruta no hace falta. */
  readonly titleId = input<string | null>(null);

  /**
   * Pinta el rótulo "Tareas" encima del título: en la burbuja es la única pista del dominio.
   * Input propio y no derivado de `headingLevel`: en la ruta ya lo dice el enlace "← Tareas".
   */
  readonly showDomain = input(false);

  private readonly statusLabels: Record<TaskResponse['status'], string> = {
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En progreso',
    COMPLETED: 'Completada',
    CANCELLED: 'Cancelada',
    EXPIRED: 'Expirada'
  };

  private readonly priorityLabels: Record<TaskResponse['priority'], string> = {
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta'
  };

  protected statusLabel(status: TaskResponse['status']): string {
    return this.statusLabels[status];
  }

  protected priorityLabel(priority: TaskResponse['priority']): string {
    return this.priorityLabels[priority];
  }

  /** Vencimiento en una línea; el `T00:00:00` evita que se lea como UTC y retroceda un día. */
  protected dueLabel(task: TaskResponse): string | null {
    if (!task.dueDate) {
      return null;
    }

    const date = new Date(`${task.dueDate}T00:00:00`);
    const formatted = date.toLocaleDateString(this.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    if (!task.dueTime) {
      return formatted;
    }

    return `${formatted} · ${task.dueTime.slice(0, 5)}`;
  }

  /** Marcas de auditoría: aquí sí interesa la hora exacta, no solo el día. */
  protected timestampLabel(iso: string): string {
    return new Date(iso).toLocaleString(this.locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

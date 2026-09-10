import { ChangeDetectionStrategy, Component, LOCALE_ID, inject, input } from '@angular/core';
import { Icon } from '../../../../shared/ui/icon/icon';
import { TaskResponse } from '../../models/task.model';

/**
 * El cuerpo de la vista de una tarea: título, badges y la lista de campos.
 *
 * **No trae la chrome ni las acciones.** Las pone quien lo monta, que hoy son
 * dos: la ruta `TaskDetail` (`/tasks/:id`, con su `.page` y su enlace de vuelta)
 * y `TaskDetailDialog` (el cuadro flotante que abre el widget de Calendario en
 * Inicio). Mismo corte —y misma razón— que `TaskFields` frente a `TaskForm`:
 * antes esto era una pantalla entera y no se podía meter en un diálogo sin
 * arrastrar el `<h1>` y el enlace "← Tareas", que dentro de un modal abierto
 * desde Inicio miente, porque de ahí no se venía.
 *
 * **La tarea llega ya cargada por `input()`, no se pide aquí por id.** Las dos
 * cáscaras necesitan el objeto para sus propias decisiones —la ruta para armar
 * el enlace de edición, el diálogo para su botón de borrar—, así que la
 * petición vive arriba en las dos. Mismo criterio que `TaskFields`.
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

  /**
   * El nivel del encabezado lo decide quien monta, porque depende del documento
   * y no del componente: en `/tasks/:id` el título de la tarea ES el `<h1>` de
   * la página; dentro del diálogo, Inicio ya tiene el suyo y este baja a `<h2>`.
   * Se resuelve con dos ramas de plantilla y no con `role="heading"` +
   * `aria-level` porque un encabezado nativo no depende de que ARIA se aplique
   * bien, y la duplicación son cuatro líneas.
   */
  readonly headingLevel = input<1 | 2>(1);

  /** Lo consume el `aria-labelledby` del diálogo; en la ruta no hace falta. */
  readonly titleId = input<string | null>(null);

  /**
   * Pinta el rótulo "Tareas" encima del título.
   *
   * Es un `input` y no algo derivado de `headingLevel` —que también distingue
   * ruta de diálogo— porque no responden a la misma pregunta: uno dice qué peso
   * tiene el título en el documento, este dice si hace falta recordar de qué
   * dominio es esto. Y hace falta justo donde no hay nada más que lo diga: en
   * `/tasks/:id` lo dice el enlace "← Tareas" de arriba, así que ahí sobra;
   * dentro de una burbuja abierta desde el calendario de Inicio —donde las tres
   * burbujas tienen ya la misma forma— es la única pista de si lo que se abrió
   * es una tarea, un evento o un movimiento.
   *
   * Sin `input` para el texto: esta vista solo pinta tareas, así que el rótulo
   * es constante. Lo único que decide quien monta es si se ve.
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

  /**
   * Fecha y hora de vencimiento en una sola línea. El `T00:00:00` evita que
   * `new Date('2026-08-25')` se lea como UTC y retroceda un día en husos
   * negativos.
   */
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

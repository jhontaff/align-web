import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { DataRefreshService } from '../../../core/data/data-refresh.service';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { TaskService } from '../task.service';
import { TaskResponse } from '../models/task.model';

@Component({
  selector: 'app-task-list',
  imports: [RouterLink, ConfirmDialog],
  templateUrl: './task-list.html',
  styleUrl: './task-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskList implements OnInit {
  private readonly taskService = inject(TaskService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tasks = signal<TaskResponse[]>([]);
  protected readonly loading = signal(true);

  /**
   * Id de la tarea que se está borrando ahora mismo, o `null`. Es un id y no un
   * booleano porque la lista tiene un botón por fila: un `deleting` global
   * desactivaría los demás botones también, y el usuario no sabría cuál de
   * ellos está en vuelo.
   */
  protected readonly deletingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  /**
   * Estado del diálogo de confirmación, en dos signals a propósito.
   *
   * `confirmOpen` dice si se ve; `pendingDelete` dice de qué va. Fundirlos en
   * uno solo (`open = pendingDelete() !== null`) obligaría a vaciar la tarea al
   * confirmar, y el texto del diálogo se quedaría en blanco durante los 160ms
   * que dura la animación de cierre — el usuario vería parpadear la pregunta
   * justo al responderla.
   */
  protected readonly confirmOpen = signal(false);
  private readonly pendingDelete = signal<TaskResponse | null>(null);

  protected readonly confirmMessage = computed(() => {
    const task = this.pendingDelete();
    return task ? `Se eliminará "${task.title}" de forma permanente.` : '';
  });

  private readonly statusLabels: Record<TaskResponse['status'], string> = {
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En progreso',
    COMPLETED: 'Completada'
  };

  private readonly priorityLabels: Record<TaskResponse['priority'], string> = {
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta'
  };

  ngOnInit(): void {
    this.load();

    // El agente puede haber creado o cambiado tareas mientras esta lista estaba
    // en pantalla. `takeUntilDestroyed` es obligatorio aquí y no lo era para
    // `list()`: un observable de HttpClient completa tras su única emisión, un
    // Subject no completa nunca — sin esto la suscripción sobrevive al
    // componente y cada visita a /tasks deja otra pidiendo tareas.
    //
    // Se le pasa `destroyRef` explícito porque `takeUntilDestroyed()` sin
    // argumento exige contexto de inyección, y `ngOnInit` ya no lo es.
    this.dataRefresh.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
  }

  /**
   * La revalidación no vuelve a poner `loading` en true a propósito: la lista
   * está detrás del panel de chat abierto, y vaciarla para pintar "Cargando"
   * un instante es más ruido que información. Los datos nuevos entran de golpe.
   */
  private load(): void {
    this.taskService.list().subscribe(page => {
      this.tasks.set(page.content);
      this.loading.set(false);
    });
  }

  /**
   * Borrar es irreversible y el backend no tiene papelera, así que se confirma
   * antes. La pregunta la hace `<app-confirm-dialog>`; aquí solo se apunta qué
   * tarea está en juego y se abre.
   */
  protected onDeleteClick(task: TaskResponse): void {
    this.pendingDelete.set(task);
    this.confirmOpen.set(true);
  }

  /**
   * El diálogo ya se ha cerrado solo al emitir `confirm`, así que aquí no hay
   * que tocarlo. `pendingDelete` tampoco se limpia: lo pisa la siguiente
   * apertura, y vaciarlo ahora borraría el texto a mitad de la animación.
   *
   * En caso de éxito la fila se quita del array local en vez de recargar la
   * lista: el servidor ya confirmó el borrado, y un GET extra solo añadiría un
   * parpadeo. El fallo sí se muestra, y la fila se queda donde estaba.
   */
  protected onConfirmDelete(): void {
    const task = this.pendingDelete();
    if (!task) {
      return;
    }

    this.deletingId.set(task.id);
    this.errorMessage.set(null);

    this.taskService.remove(task.id).subscribe({
      next: () => {
        this.tasks.update(tasks => tasks.filter(t => t.id !== task.id));
        this.deletingId.set(null);
      },
      error: err => {
        this.deletingId.set(null);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  protected statusLabel(status: TaskResponse['status']): string {
    return this.statusLabels[status];
  }

  protected priorityLabel(priority: TaskResponse['priority']): string {
    return this.priorityLabels[priority];
  }

  protected dueLabel(task: TaskResponse): string | null {
    if (!task.dueDate) {
      return null;
    }

    const date = new Date(`${task.dueDate}T00:00:00`);
    const formatted = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

    if (!task.dueTime) {
      return formatted;
    }

    return `${formatted} · ${task.dueTime.slice(0, 5)}`;
  }
}

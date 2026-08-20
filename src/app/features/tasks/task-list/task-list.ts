import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DataRefreshService } from '../../../core/data/data-refresh.service';
import { TaskService } from '../task.service';
import { TaskResponse } from '../models/task.model';

@Component({
  selector: 'app-task-list',
  imports: [RouterLink],
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

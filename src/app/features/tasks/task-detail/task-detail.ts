import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  numberAttribute
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { TaskService } from '../task.service';
import { TaskResponse } from '../models/task.model';

/**
 * Las tres situaciones posibles de la pantalla, como unión cerrada en vez de
 * tres signals sueltos (`task` + `loading` + `errorMessage`). Con signals
 * independientes existen estados imposibles —cargando y con error a la vez, o
 * una tarea vieja pintada bajo el error de la siguiente— y hay que acordarse de
 * apagar unos al encender otros. Aquí solo puede haber uno.
 */
type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; task: TaskResponse };

@Component({
  selector: 'app-task-detail',
  imports: [RouterLink],
  templateUrl: './task-detail.html',
  styleUrl: './task-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetail {
  private readonly taskService = inject(TaskService);

  /**
   * El `:id` de la ruta llega como input gracias a `withComponentInputBinding()`,
   * sin inyectar `ActivatedRoute` ni suscribirse a `paramMap` — es la regla del
   * repo para cualquier pantalla con parámetro.
   *
   * `numberAttribute` es obligatorio: la URL siempre entrega un string, y sin
   * transformar, el `id` viajaría como `"12"` a un servicio tipado con `number`.
   * Compilaría igual y solo se notaría en runtime.
   */
  readonly id = input.required({ transform: numberAttribute });

  /**
   * `toObservable(id)` en vez de cargar una sola vez en `ngOnInit`: el router
   * REUTILIZA la instancia al navegar de /tasks/1 a /tasks/2, así que un
   * `ngOnInit` se quedaría mostrando la tarea anterior para siempre. Hoy no hay
   * ningún enlace entre detalles, pero el fallo aparecería en cuanto lo haya y
   * no da ningún error.
   *
   * `switchMap` cancela la petición en vuelo al cambiar el id, de modo que una
   * respuesta lenta de la tarea anterior no puede pisar a la nueva.
   *
   * `catchError` va DENTRO del `switchMap`: fuera, un fallo mataría el stream
   * exterior y la pantalla dejaría de reaccionar a cualquier id posterior.
   */
  private readonly state = toSignal(
    toObservable(this.id).pipe(
      switchMap(id =>
        this.taskService.get(id).pipe(
          map((task): DetailState => ({ status: 'ready', task })),
          catchError(err => of<DetailState>({ status: 'error', message: extractErrorMessage(err) })),
          startWith<DetailState>({ status: 'loading' })
        )
      )
    ),
    { initialValue: { status: 'loading' } as DetailState }
  );

  /**
   * La unión se abre aquí y no en la plantilla: tres `computed` planos evitan
   * depender del estrechamiento de tipos dentro de `@if`, y dejan el template
   * con la misma forma que `task-list.html`.
   */
  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : null;
  });

  protected readonly task = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.task : null;
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

  protected statusLabel(status: TaskResponse['status']): string {
    return this.statusLabels[status];
  }

  protected priorityLabel(priority: TaskResponse['priority']): string {
    return this.priorityLabels[priority];
  }

  /**
   * Fecha y hora de vencimiento en una sola línea, mismo formato que la lista
   * ("25 ago · 14:30"). El `T00:00:00` evita que `new Date('2026-08-25')` se
   * interprete como UTC y retroceda un día en husos negativos.
   */
  protected dueLabel(task: TaskResponse): string | null {
    if (!task.dueDate) {
      return null;
    }

    const date = new Date(`${task.dueDate}T00:00:00`);
    const formatted = date.toLocaleDateString('es-ES', {
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
    return new Date(iso).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

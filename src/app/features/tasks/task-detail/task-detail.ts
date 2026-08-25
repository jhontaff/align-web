import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { TaskService } from '../task.service';
import { TaskResponse } from '../models/task.model';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';

/**
 * Las tres situaciones posibles de la pantalla, como unión cerrada en vez de
 * tres signals sueltos (`task` + `loading` + `errorMessage`). Con signals
 * independientes existen estados imposibles —cargando y con error a la vez, o
 * una tarea vieja pintada bajo el error de la siguiente— y hay que acordarse de
 * apagar unos al encender otros. Aquí solo puede haber uno.
 */
/**
 * Los ids de tarea son UUID (spec del backend). Comprobarlo antes de pedir
 * evita mandar al servidor una URL que no puede resolver.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; task: TaskResponse };

@Component({
  selector: 'app-task-detail',
  imports: [RouterLink, ConfirmDialog],
  templateUrl: './task-detail.html',
  styleUrl: './task-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetail {
  private readonly taskService = inject(TaskService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * El `:id` se lee de `ActivatedRoute.paramMap`, no de un `input()` enlazado
   * por `withComponentInputBinding()`.
   *
   * Esto se desvía a propósito de la regla del repo ("ActivatedRoute no debe
   * aparecer en componentes nuevos"), y el motivo es empírico: con el input,
   * el id llegaba vacío y la pantalla pedia `/api/tasks/NaN`. El binder de
   * rutas recorre los inputs declarados y hace `setInput(nombre, data[nombre])`
   * exista o no la clave (`router2.mjs`, `RoutedComponentInputBinder`), así que
   * cuando no llega no hay error: llega `undefined` y sigue adelante.
   *
   * `paramMap` no tiene ese problema. Es un observable propio de la ruta: no
   * depende de que nadie escriba un input a tiempo, y vuelve a emitir cuando
   * cambia el parámetro — que es lo que hace falta porque el router REUTILIZA
   * la instancia al ir de /tasks/1 a /tasks/2. Con una lectura única del
   * snapshot, la segunda navegación se quedaría mostrando la tarea anterior.
   */
  private readonly taskId$ = this.route.paramMap.pipe(
    map(params => params.get('id')),

    /**
     * Validado como UUID antes de salir a la red, porque eso es lo que el
     * backend declara. Aqui NO se convierte a numero: el id viaja como string
     * de punta a punta, igual que en `TaskResponse`.
     */
    map(raw => (raw !== null && UUID.test(raw) ? raw : null)),

    // `paramMap` puede reemitir sin que el id cambie (más aún con
    // `paramsInheritanceStrategy: 'always'`, que mezcla los params del padre).
    // Sin esto, cada reemisión sería otro GET idéntico.
    distinctUntilChanged()
  );

  /**
   * `switchMap` cancela la peticion en vuelo al cambiar el id, de modo que una
   * respuesta lenta de la tarea anterior no puede pisar a la nueva.
   *
   * `catchError` va DENTRO del `switchMap`: fuera, un fallo mataria el stream
   * exterior y la pantalla dejaria de reaccionar a cualquier id posterior.
   */
  private readonly state = toSignal(
    this.taskId$.pipe(
      switchMap(id => {
        // Corta el circuito antes del HTTP. Sin esta rama, un id ausente o
        // invalido se convertia en una peticion imposible de servir.
        if (id === null) {
          return of<DetailState>({ status: 'error', message: 'La tarea que buscas no existe.' });
        }

        return this.taskService.get(id).pipe(
          map((task): DetailState => ({ status: 'ready', task })),
          catchError(err => of<DetailState>({ status: 'error', message: extractErrorMessage(err) })),
          startWith<DetailState>({ status: 'loading' })
        );
      })
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

  /**
   * Estado del borrado, aparte de `DetailState`.
   *
   * No entra en la unión a propósito: `DetailState` describe el resultado de
   * CARGAR la tarea y lo alimenta un `toSignal` sobre el stream de la ruta, que
   * no es escribible. Meter aquí un `status: 'deleting'` obligaría a convertir
   * ese stream en un signal manual y a reimplantar a mano lo que hoy hacen
   * `switchMap` y `catchError`.
   */
  protected readonly deleting = signal(false);

  /**
   * El fallo al borrar es distinto del fallo al cargar y por eso tiene su
   * propio signal en vez de reutilizar `errorMessage` —que además es un
   * `computed` y no se puede escribir—. Al cargar mal no hay nada que enseñar;
   * al borrar mal la tarea sigue ahí y perfectamente utilizable, así que el
   * mensaje se pinta ENCIMA de la página, no en lugar de ella.
   */
  protected readonly deleteError = signal<string | null>(null);

  /**
   * Mismo par de signals que en `task-list`: `confirmOpen` dice si el diálogo
   * se ve. Aquí no hace falta un `pendingDelete` —solo hay una tarea en
   * pantalla— pero el mensaje sí se congela al confirmar, ver `confirmMessage`.
   */
  protected readonly confirmOpen = signal(false);

  /**
   * `?? ''` y no un `@if`: cuando el borrado sale bien navegamos a /tasks y
   * `task()` pasa a null mientras el diálogo aún se está cerrando. Sin el
   * valor por defecto, el texto parpadearía a vacío justo al responder.
   */
  protected readonly confirmMessage = computed(() => {
    const task = this.task();
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

  protected onDeleteClick(): void {
    this.confirmOpen.set(true);
  }

  /**
   * Al contrario que en la lista —donde basta con quitar la fila— aquí la
   * pantalla entera deja de tener sentido: la tarea que muestra ya no existe.
   * Por eso se navega a /tasks en vez de quedarse. `TaskList` recarga en su
   * `ngOnInit`, así que la lista llega sin el elemento borrado sin necesidad de
   * invalidar nada.
   */
  protected onConfirmDelete(): void {
    const task = this.task();
    if (!task) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set(null);

    this.taskService.remove(task.id).subscribe({
      next: () => this.router.navigate(['/tasks']),
      error: err => {
        this.deleting.set(false);
        this.deleteError.set(extractErrorMessage(err));
      }
    });
  }

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

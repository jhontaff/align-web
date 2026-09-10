import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TaskService } from '../task.service';
import { TaskResponse } from '../models/task.model';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { TaskFields } from '../components/task-fields/task-fields';

/**
 * Mismo criterio que en `task-detail`: los ids son UUID, y comprobarlo antes de
 * pedir evita mandar al servidor una URL que no puede resolver.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La PANTALLA de crear y editar tarea, montada en dos rutas (`/tasks/new` y
 * `/tasks/:id/edit`).
 *
 * Lo que queda aquí es lo que solo tiene sentido detrás de una ruta: leer el
 * `:id`, traer la tarea, la chrome de página y adónde se va al terminar. Los
 * campos son de `TaskFields`, que se monta también en la pestaña "Tarea" de
 * `QuickCreate` — ver su comentario para el porqué del corte.
 */
@Component({
  selector: 'app-task-form',
  imports: [RouterLink, TaskFields],
  templateUrl: './task-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskForm {
  private readonly taskService = inject(TaskService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * El `:id` se lee del **snapshot**, no de `paramMap` ni de un `input()`.
   *
   * De `paramMap` no, al contrario que en `task-detail`: allí hace falta que
   * reemita porque el router reutiliza la instancia al ir de una tarea a otra.
   * Aquí no existe ninguna navegación que lleve de `/tasks/a/edit` a
   * `/tasks/b/edit`, y en cambio sí hay un formulario a medio escribir que una
   * reemisión —`paramsInheritanceStrategy: 'always'` las hace más probables—
   * sobrescribiría sin avisar. Una lectura única no puede hacer eso.
   *
   * De `input()` tampoco, por la misma razón empírica que documenta
   * `task-detail`: el binder de rutas escribe el input exista o no la clave, de
   * modo que cuando no llega, llega `undefined` en silencio.
   */
  private readonly taskId = ((): string | null => {
    const raw = this.route.snapshot.paramMap.get('id');
    return raw !== null && UUID.test(raw) ? raw : null;
  })();

  /** Los dos modos son excluyentes y quedan resueltos una sola vez. */
  protected readonly editing = this.taskId !== null;

  /** Lo que se le pasa a `TaskFields`. `null` es el alta, y también el rato que tarda el GET. */
  protected readonly task = signal<TaskResponse | null>(null);

  /**
   * Solo del modo edición: la tarea que se está trayendo para rellenar el
   * formulario. Al crear no hay nada que pedir, así que arranca en `false` y la
   * plantilla pinta el formulario desde el primer fotograma.
   */
  protected readonly loading = signal(this.editing);

  /**
   * El fallo al CARGAR es distinto del fallo al GUARDAR, y por eso no vive en
   * `TaskFields` junto al otro. Si la tarea no se pudo traer, el formulario no
   * se pinta en absoluto: un formulario vacío sobre una ruta de edición mandaría
   * un PUT que dejaría la tarea sin título ni fechas, porque el backend
   * reemplaza el recurso entero.
   */
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    if (this.taskId === null) {
      return;
    }

    this.taskService.get(this.taskId).subscribe({
      next: task => {
        this.task.set(task);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(extractErrorMessage(err));
      }
    });
  }

  /**
   * Al editar se vuelve al detalle, no a la lista: es de donde se venía y es
   * donde se ve el cambio recién guardado. Al crear no hay detalle previo al que
   * volver.
   */
  protected onSaved(): void {
    this.router.navigate(this.taskId ? ['/tasks', this.taskId] : ['/tasks']);
  }

  /** Adónde vuelve "Cancelar": al detalle si se editaba, si no a la lista. */
  protected onCancel(): void {
    this.router.navigate(this.taskId ? ['/tasks', this.taskId] : ['/tasks']);
  }
}

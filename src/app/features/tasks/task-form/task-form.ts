import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TaskService } from '../task.service';
import { TaskRequest, TaskResponse, TaskUpdateRequest } from '../models/task.model';
import { extractErrorMessage } from '../../../core/http/extract-error-message';

/**
 * Mismo criterio que en `task-detail`: los ids son UUID, y comprobarlo antes
 * de pedir evita mandar al servidor una URL que no puede resolver.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Una sola pantalla para crear y para editar, montada en dos rutas
 * (`/tasks/new` y `/tasks/:id/edit`).
 *
 * La alternativa —un `task-edit/` hermano— serían dos plantillas con los mismos
 * cinco campos, y la próxima vez que el dominio gane uno habría que acordarse
 * de tocar las dos. La diferencia real entre los dos modos es pequeña y está
 * acotada: de dónde sale el valor inicial, qué método del servicio se llama, y
 * que `status` solo existe al editar (al crear lo fija el backend en
 * `PENDING`). Todo lo demás es idéntico.
 */
@Component({
  selector: 'app-task-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './task-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskForm {
  private readonly fb = inject(FormBuilder);
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

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  /**
   * Solo del modo edición: la tarea que se está trayendo para rellenar el
   * formulario. Al crear no hay nada que pedir, así que arranca en `false` y la
   * plantilla pinta el formulario desde el primer fotograma.
   */
  protected readonly loading = signal(this.editing);

  /**
   * El fallo al CARGAR es distinto del fallo al GUARDAR, y por eso no comparte
   * signal con `errorMessage`. Si la tarea no se pudo traer, el formulario no
   * se pinta en absoluto: un formulario vacío sobre una ruta de edición mandaría
   * un PUT que dejaría la tarea sin título ni fechas, porque el backend
   * reemplaza el recurso entero en vez de parchearlo.
   */
  protected readonly loadError = signal<string | null>(null);

  /**
   * `status` vive en el grupo siempre, pero solo se pinta —y solo se manda— al
   * editar. Declararlo condicionalmente obligaría a `addControl`/`removeControl`
   * en tiempo de ejecución y a que la plantilla se defendiera de que el control
   * todavía no exista; con el valor por defecto correcto, el modo creación
   * simplemente lo ignora.
   */
  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    description: [''],
    status: ['PENDING', [Validators.required]],
    priority: ['MEDIUM', [Validators.required]],
    dueDate: [''],
    dueTime: ['']
  });

  /** Adónde vuelve "Cancelar": al detalle si se editaba, si no a la lista. */
  protected readonly cancelLink = computed(() =>
    this.taskId ? ['/tasks', this.taskId] : ['/tasks']
  );

  constructor() {
    if (this.taskId === null) {
      return;
    }

    this.taskService.get(this.taskId).subscribe({
      next: task => {
        this.form.patchValue(this.toFormValue(task));
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(extractErrorMessage(err));
      }
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const id = this.taskId;
    const request$ = id
      ? this.taskService.update(id, this.toUpdateRequest())
      : this.taskService.create(this.toCreateRequest());

    request$.subscribe({
      // Al editar se vuelve al detalle, no a la lista: es de donde se venía y
      // es donde se ve el cambio recién guardado. Al crear no hay detalle
      // previo al que volver.
      next: () => this.router.navigate(id ? ['/tasks', id] : ['/tasks']),
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  /**
   * El backend deja `description`, `dueDate` y `dueTime` en `null`, y un grupo
   * `nonNullable` espera string. Sin el `?? ''`, `patchValue` metería `null` en
   * el control y el `<input type="date">` se quedaría en un estado que no sabe
   * pintar.
   */
  private toFormValue(task: TaskResponse) {
    return {
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ?? '',
      dueTime: task.dueTime ?? ''
    };
  }

  private toCreateRequest(): TaskRequest {
    const { title, description, priority, dueDate, dueTime } = this.form.getRawValue();

    return {
      title,
      description: optional(description),
      priority: priority as TaskRequest['priority'],
      dueDate: optional(dueDate),
      dueTime: optional(dueTime)
    };
  }

  /**
   * Se mandan TODOS los campos, también los que el usuario no tocó: `PUT` es un
   * reemplazo, no un parche. El corolario es lo que hace útil a `optional()`:
   * vaciar la fecha en el formulario y omitirla en el cuerpo es exactamente
   * cómo se borra una fecha límite ya guardada.
   */
  private toUpdateRequest(): TaskUpdateRequest {
    const { title, description, status, priority, dueDate, dueTime } = this.form.getRawValue();

    return {
      title,
      description: optional(description),
      status: status as TaskUpdateRequest['status'],
      priority: priority as TaskUpdateRequest['priority'],
      dueDate: optional(dueDate),
      dueTime: optional(dueTime)
    };
  }
}

/**
 * Un control vacío vale `''`, y `''` no es un valor válido para los campos que
 * el contrato declara opcionales: una `LocalDate` no se parsea desde cadena
 * vacía. `undefined` desaparece del JSON, que es lo que "no hay fecha"
 * significa para el backend.
 */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

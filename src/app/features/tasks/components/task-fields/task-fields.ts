import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { optional } from '../../../../core/http/optional';
import { TaskRequest, TaskResponse, TaskUpdateRequest } from '../../models/task.model';
import { TaskService } from '../../task.service';

/** Mismo motivo que en `event-fields`: `id` es global al documento. */
let nextId = 0;

/**
 * El cuerpo del formulario de tarea: campos, validación y la petición.
 *
 * **No trae la chrome de página** (`.page`, `page-header`, la tarjeta). La pone
 * quien lo monta, que hoy son dos: la ruta `TaskForm` (`/tasks/new` y
 * `/tasks/:id/edit`) y la pestaña "Tarea" de `QuickCreate`. Ese corte es la
 * razón de existir del componente — antes esto era una pantalla entera y no se
 * podía meter en un diálogo sin arrastrar el `<h1>` y el ancho de página.
 *
 * **Tampoco navega.** `saved` y `cancel` son outputs, y quien lo monta decide:
 * la ruta navega al detalle o a la lista, la pestaña cierra el diálogo. Con un
 * `router.navigate()` aquí dentro, crear una tarea desde el panel de Inicio
 * sacaría al usuario de Inicio sin que nadie se lo pidiera.
 *
 * Crear y editar siguen siendo el mismo componente: `task()` en `null` es el
 * alta. La tarea NO se pide aquí por id — llega ya cargada por `input()`, igual
 * que `EventFields`, porque el modo edición solo existe detrás de una ruta que
 * ya tuvo que resolver ese id para poder pintarse.
 */
@Component({
  selector: 'app-task-fields',
  imports: [ReactiveFormsModule],
  templateUrl: './task-fields.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskFields {
  private readonly fb = inject(FormBuilder);
  private readonly taskService = inject(TaskService);

  readonly task = input<TaskResponse | null>(null);

  readonly saved = output<TaskResponse>();
  readonly cancel = output<void>();

  private readonly uid = `task-fields-${nextId++}`;

  protected readonly editing = computed(() => this.task() !== null);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

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

  constructor() {
    // Mismo uso legítimo de `effect` que en `event-fields`: sincroniza un signal
    // con una API imperativa externa (`FormGroup.reset`), no propaga estado
    // entre signals.
    effect(() => {
      const task = this.task();
      this.form.reset(task ? this.toFormValue(task) : this.emptyValue());
    });
  }

  protected fieldId(name: string): string {
    return `${this.uid}-${name}`;
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const task = this.task();
    const request$ = task
      ? this.taskService.update(task.id, this.toUpdateRequest())
      : this.taskService.create(this.toCreateRequest());

    request$.subscribe({
      next: saved => {
        this.submitting.set(false);
        this.saved.emit(saved);
      },
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  /**
   * El backend deja `description`, `dueDate` y `dueTime` en `null`, y un grupo
   * `nonNullable` espera string. Sin el `?? ''`, `reset` metería `null` en el
   * control y el `<input type="date">` se quedaría en un estado que no sabe
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

  private emptyValue() {
    return {
      title: '',
      description: '',
      status: 'PENDING',
      priority: 'MEDIUM',
      dueDate: '',
      dueTime: ''
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
   * vaciar la fecha en el formulario y omitirla en el cuerpo es exactamente cómo
   * se borra una fecha límite ya guardada.
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

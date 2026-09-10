import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  viewChild
} from '@angular/core';
import { Icon } from '../../../../shared/ui/icon/icon';
import { TaskResponse } from '../../models/task.model';
import { TaskFields } from '../task-fields/task-fields';

/** Mismo motivo que en `event-edit`: `id` es global al documento. */
let nextId = 0;

/**
 * El cuadro flotante de edición de tarea: la cáscara y nada más.
 *
 * **Es el gemelo exacto de `EventEdit`**, y existe por la misma razón: sin él,
 * el botón "Editar" del cuadro de detalle tendría que navegar a
 * `/tasks/:id/edit` y sacaría al usuario de Inicio, que es justo lo que este
 * trabajo viene a evitar. Con él, ver y editar una tarea desde el calendario
 * son dos burbujas encadenadas, igual que ya lo son para un evento.
 *
 * Los campos, la validación y la petición viven en `TaskFields`, que ya lo
 * comparten la ruta `TaskForm` y la pestaña "Tarea" de `QuickCreate`. Lo que
 * queda aquí es lo que NO se comparte: el diálogo, el título y las tres formas
 * de cerrar (Escape, clic fuera, la X).
 *
 * Solo edita, nunca crea: el alta desde Inicio ya la cubre `QuickCreate`, así
 * que `task` es obligatorio y no admite `null` — al revés que `EventEdit`, que
 * sí hace las dos porque el widget crea eventos desde la cuadrícula.
 */
@Component({
  selector: 'app-task-edit-dialog',
  imports: [Icon, TaskFields],
  templateUrl: './task-edit-dialog.html',
  styleUrl: './task-edit-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskEditDialog {
  readonly task = input.required<TaskResponse>();

  readonly saved = output<TaskResponse>();
  readonly cancel = output<void>();

  private readonly id = nextId++;
  protected readonly titleId = `task-edit-dialog-title-${this.id}`;

  // Opcional a propósito, mismo motivo que en `event-edit`: el efecto de abajo
  // puede correr antes de que la vista exista.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly heading = computed(() => `Editar "${this.task().title}"`);

  constructor() {
    afterRenderEffect(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
    });
  }

  /** El evento `close` nativo cubre Escape y el clic fuera; Cancelar y la X caen en el mismo sitio. */
  protected onNativeClose(): void {
    this.cancel.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.dialog()?.nativeElement.close();
    }
  }

  protected onCloseClick(): void {
    this.dialog()?.nativeElement.close();
  }
}

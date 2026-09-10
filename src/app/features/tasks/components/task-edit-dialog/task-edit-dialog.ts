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
 * Cáscara del cuadro flotante de edición de tarea; gemelo de `EventEdit`.
 * Sin él, "Editar" tendría que navegar a `/tasks/:id/edit` y sacar al usuario de Inicio.
 * Los campos y la petición viven en `TaskFields`; aquí solo el diálogo, el título y el cierre.
 * Solo edita, nunca crea: el alta desde Inicio ya la cubre `QuickCreate`, por eso `task` es obligatorio.
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

  // Opcional a propósito: el efecto de abajo puede correr antes de que la vista exista.
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

  /** El `close` nativo cubre Escape y el clic fuera; Cancelar y la X caen en el mismo sitio. */
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

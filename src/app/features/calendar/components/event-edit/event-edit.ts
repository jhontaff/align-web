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
import { EventResponse } from '../../models/event.model';
import { EventFields } from '../event-fields/event-fields';

/** Mismo motivo que en `confirm-dialog`/`event-detail`: `id` es global al documento. */
let nextId = 0;

/**
 * El cuadro flotante de alta/edición de evento: `<dialog>` + `showModal()`,
 * mismo idioma que `confirm-dialog` y `event-detail`. Sin `open` que el padre
 * empuje — el widget monta y desmonta el componente entero con `@if`, así que
 * "existir" ya significa "debe estar abierto".
 *
 * **Solo la chrome.** Los campos, la validación y la petición viven en
 * `EventFields`, porque los mismos campos se montan también sin diálogo en la
 * pestaña "Evento" de `QuickCreate`. Lo que queda aquí es lo que NO se comparte:
 * el diálogo, el título y las tres formas de cerrar (Escape, clic fuera, la X).
 */
@Component({
  selector: 'app-event-edit',
  imports: [Icon, EventFields],
  templateUrl: './event-edit.html',
  styleUrl: './event-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventEdit {
  readonly event = input<EventResponse | null>(null);

  /** Se guardó con éxito (alta o edición) — el padre decide qué mostrar a continuación. */
  readonly saved = output<EventResponse>();

  readonly cancel = output<void>();

  private readonly id = nextId++;
  protected readonly titleId = `event-edit-title-${this.id}`;

  // Opcional a propósito, mismo motivo que en `event-detail`: el efecto de abajo
  // puede correr antes de que la vista exista.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly editing = computed(() => this.event() !== null);

  constructor() {
    afterRenderEffect(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
    });
  }

  /** El evento `close` nativo cubre Escape y el clic fuera; Cancelar y la X llaman a `close()` directamente y caen en el mismo sitio. */
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

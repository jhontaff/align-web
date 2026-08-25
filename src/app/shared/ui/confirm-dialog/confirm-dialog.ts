import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  model,
  output,
  viewChild
} from '@angular/core';

/**
 * Contador de instancias, para que cada diálogo tenga ids propios.
 *
 * `id` es global al documento: la encapsulación de estilos de Angular reescribe
 * selectores CSS, no atributos `id`. Con ids fijos, dos `<app-confirm-dialog>`
 * montados a la vez —el caso para el que existe este componente— emitirían
 * `id="confirm-dialog-title"` por duplicado, y `aria-labelledby` resuelve al
 * primero que encuentre: el segundo diálogo se anunciaría con el título del
 * primero.
 */
let nextId = 0;

/**
 * Diálogo de confirmación reutilizable para acciones destructivas.
 *
 * Primera pieza de `shared/ui/`, y cumple sus dos reglas: solo recibe
 * primitivos —ni un DTO de dominio, así que no sabe qué es una tarea ni una
 * transacción— y no inyecta nada. Quien lo usa aporta el texto y decide qué
 * hacer al confirmar.
 *
 * Reutiliza el mismo idioma que `layout/session-menu/`: `<dialog>` abierto con
 * `showModal()`, del que el navegador aporta trampa de foco, cierre con
 * Escape, fondo inerte, top layer y devolución del foco al disparador. El
 * bloqueo de scroll ya está resuelto globalmente con `body:has(dialog[open])`
 * en `_base.scss`. Nada de eso se escribe aquí.
 *
 * **El diálogo se cierra al confirmar; no espera a la petición.** El estado de
 * carga y el error viven en la pantalla que llama, que es la única que sabe si
 * un fallo merece un mensaje en línea, un toast o silencio — el mismo criterio
 * por el que `extractErrorMessage` no decide presentación.
 */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialog {
  /**
   * `model()` y no `input()` porque el diálogo se cierra solo: Escape y el clic
   * en el velo son cierres del navegador, y sin two-way el padre se quedaría
   * creyendo que sigue abierto y no podría volver a abrirlo.
   */
  readonly open = model(false);

  /**
   * Se llama `heading` y no `title` porque `title` es una propiedad nativa del
   * DOM: un input con ese nombre colisionaría con el atributo `title` del
   * elemento anfitrión, que es justo lo que las convenciones del repo prohíben.
   */
  readonly heading = input.required<string>();
  readonly message = input<string>('');
  readonly confirmLabel = input('Confirmar');
  readonly cancelLabel = input('Cancelar');

  /**
   * Elige la pintura del botón de confirmar entre las clases que ya existen en
   * `_components.scss`. Es un tono semántico, no un color: el componente no
   * declara paleta propia.
   */
  readonly tone = input<'danger' | 'primary'>('danger');

  readonly confirm = output<void>();
  readonly cancel = output<void>();

  private readonly id = nextId++;
  protected readonly titleId = `confirm-dialog-title-${this.id}`;
  protected readonly messageId = `confirm-dialog-message-${this.id}`;

  // Opcional a propósito: el efecto de abajo puede correr antes de que la vista
  // exista, y `.required` lanzaría en ese primer paso.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Uso legítimo de `effect`: sincronizar un signal con una API imperativa
    // externa —`showModal()`/`close()` no tienen equivalente declarativo—,
    // igual que `ThemeService` escribiendo `data-theme`. No propaga estado
    // entre signals, que es lo que sí está prohibido.
    //
    // Los dos guardas contra `el.open` no son decorativos: `showModal()` sobre
    // un diálogo ya abierto lanza `InvalidStateError`, y `close()` sobre uno
    // cerrado emitiría un evento `close` de más que este componente leería
    // como una cancelación del usuario.
    effect(() => {
      const el = this.dialog()?.nativeElement;
      if (!el) {
        return;
      }

      if (this.open()) {
        if (!el.open) {
          el.showModal();
        }
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected onConfirm(): void {
    this.open.set(false);
    this.confirm.emit();
  }

  protected onCancel(): void {
    this.open.set(false);
    this.cancel.emit();
  }

  /**
   * El evento `close` nativo cubre lo que este componente no dispara: Escape y
   * cualquier cierre del navegador. El guard evita emitir `cancel` cuando el
   * cierre viene de `onConfirm`/`onCancel`, que ya han puesto `open` a false
   * antes de que el efecto llame a `close()`.
   */
  protected onNativeClose(): void {
    if (this.open()) {
      this.open.set(false);
      this.cancel.emit();
    }
  }

  /**
   * Un clic sobre el `::backdrop` llega como un `click` cuyo `target` es el
   * propio `<dialog>`; uno sobre el contenido trae el elemento interno. Solo
   * funciona con el `<dialog>` sin `padding` — ver el `.scss`.
   */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.onCancel();
    }
  }
}

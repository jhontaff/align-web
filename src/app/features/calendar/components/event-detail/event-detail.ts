import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../../shared/ui/icon/icon';
import { CalendarService } from '../../calendar.service';
import { parseLocalDateTime } from '../../calendar-date';
import { EventResponse } from '../../models/event.model';

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; event: EventResponse };

/** Mismo motivo que en `confirm-dialog`: `id` es global al documento y hace falta uno propio por instancia. */
let nextId = 0;

/**
 * Detalle de un evento, como cuadro flotante — mismo idioma que
 * `confirm-dialog`: `<dialog>` abierto con `showModal()`, del que el
 * navegador aporta trampa de foco, cierre con Escape, fondo inerte, top
 * layer y devolución del foco al disparador.
 *
 * A diferencia de `confirm-dialog`, aquí no hay un `open` que el padre
 * empuje: el widget de Calendario monta y desmonta este componente entero
 * con `@if` (ver `calendar-widget`), así que "existir" ya significa "debe
 * estar abierto" — el diálogo se abre solo en cuanto se pinta, y al
 * cerrarse (Escape, clic fuera, la X) emite `close` para que el padre lo
 * desmonte, que es lo que de verdad lo quita del DOM.
 *
 * No es una pantalla ruteada como `task-detail`/`habit-detail` — Calendar no
 * tiene ruta propia — así que el id llega por `input()` en vez de
 * `ActivatedRoute`.
 */
@Component({
  selector: 'app-event-detail',
  imports: [ConfirmDialog, Icon],
  templateUrl: './event-detail.html',
  styleUrl: './event-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventDetail {
  private readonly calendar = inject(CalendarService);
  private readonly locale = inject(LOCALE_ID);

  private readonly id = nextId++;
  protected readonly titleId = `event-detail-title-${this.id}`;

  // Opcional a propósito: el efecto de abajo puede correr antes de que la
  // vista exista, y `.required` lanzaría en ese primer paso — mismo motivo
  // que en `confirm-dialog`.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  readonly eventId = input.required<string>();

  /** Pide editar este evento — el padre decide mostrar `event-edit` a continuación. */
  readonly edit = output<EventResponse>();

  /** Se borró con éxito. Sin ruta a la que navegar: el padre cierra el panel y refresca la cuadrícula. */
  readonly deleted = output<string>();

  /** Cerrar sin editar ni borrar (la X). */
  readonly close = output<void>();

  /**
   * `toObservable` + `switchMap` en vez de `.subscribe()` a mano: mismo
   * patrón que `taskId$` en `task-detail`, adaptado de `ActivatedRoute.paramMap`
   * a un `input()` porque aquí no hay ruta de la que leer el id.
   */
  private readonly id$ = toObservable(this.eventId).pipe(distinctUntilChanged());

  private readonly state = toSignal(
    this.id$.pipe(
      switchMap(id =>
        this.calendar.get(id).pipe(
          map((event): DetailState => ({ status: 'ready', event })),
          catchError(err => of<DetailState>({ status: 'error', message: extractErrorMessage(err) })),
          startWith<DetailState>({ status: 'loading' })
        )
      )
    ),
    { initialValue: { status: 'loading' } as DetailState }
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : null;
  });

  protected readonly event = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.event : null;
  });

  /**
   * Estado del borrado, aparte de `state`: mismo motivo que en `task-detail`
   * — `state` lo alimenta un `toSignal` sobre un stream no escribible, así
   * que un `status: 'deleting'` ahí dentro obligaría a reimplantar a mano lo
   * que ya hace `switchMap`/`catchError`.
   */
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly confirmOpen = signal(false);

  protected readonly confirmMessage = computed(() => {
    const event = this.event();
    return event ? `Se eliminará "${event.title}" de forma permanente.` : '';
  });

  constructor() {
    // `afterRenderEffect` y no `effect`: `showModal()` necesita el elemento
    // ya pintado. Sin `open` que sincronizar (ver el comentario de la
    // clase), el guard contra `el.open` solo evita el `InvalidStateError` de
    // llamar `showModal()` dos veces si el efecto se reevalúa.
    afterRenderEffect(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
    });
  }

  /** El evento `close` nativo cubre Escape y el clic fuera; la X llama a `close()` directamente y cae en el mismo sitio. */
  protected onNativeClose(): void {
    this.close.emit();
  }

  /**
   * Un clic sobre el `::backdrop` llega como un `click` cuyo `target` es el
   * propio `<dialog>`; uno sobre el contenido trae el elemento interno.
   * Solo funciona con el `<dialog>` sin `padding` — ver el `.scss`.
   */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.dialog()?.nativeElement.close();
    }
  }

  protected onCloseClick(): void {
    this.dialog()?.nativeElement.close();
  }

  protected onDeleteClick(): void {
    this.confirmOpen.set(true);
  }

  /**
   * `confirm-dialog` se cierra solo al confirmar, sin esperar la petición —
   * el estado de carga y error del borrado viven aquí, no en un servicio
   * intermedio. Mismo patrón que `task-detail.onConfirmDelete`.
   */
  protected onConfirmDelete(): void {
    const event = this.event();
    if (!event) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set(null);

    this.calendar.remove(event.id).subscribe({
      next: () => this.deleted.emit(event.id),
      error: err => {
        this.deleting.set(false);
        this.deleteError.set(extractErrorMessage(err));
      }
    });
  }

  protected onEditClick(): void {
    const event = this.event();
    if (event) {
      this.edit.emit(event);
    }
  }

  /** "15 de septiembre de 2026 · 14:00". */
  protected dateTimeLabel(localDateTime: string): string {
    const date = parseLocalDateTime(localDateTime);
    const formatted = date.toLocaleDateString(this.locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const time = date.toLocaleTimeString(this.locale, { hour: '2-digit', minute: '2-digit' });
    return `${formatted} · ${time}`;
  }

  /** Marcas de auditoría: aquí sí interesa la hora exacta, no solo el día. */
  protected timestampLabel(iso: string): string {
    return new Date(iso).toLocaleString(this.locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

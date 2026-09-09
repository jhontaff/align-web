import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { Icon } from '../../../../shared/ui/icon/icon';
import { CalendarService } from '../../calendar.service';
import { combineDateTime, splitLocalDateTime } from '../../calendar-date';
import { EventRequest, EventResponse } from '../../models/event.model';

/** Mismo motivo que en `confirm-dialog`/`event-detail`: `id` es global al documento. */
let nextId = 0;

const REMINDER_OPTIONS = [
  { value: '', label: 'Sin recordatorio' },
  { value: '5', label: '5 min antes' },
  { value: '15', label: '15 min antes' },
  { value: '30', label: '30 min antes' },
  { value: '60', label: '1 hora antes' }
] as const;

/**
 * Un solo componente para crear y editar — mismo criterio que `TaskForm` y
 * que `HabitRequest` en el backend: las reglas de `Event` no divergen entre
 * alta y edición.
 *
 * La diferencia con `TaskForm` es de dónde sale el modo: `TaskForm` lee el
 * `:id` de la ruta porque `/tasks/new` y `/tasks/:id/edit` son rutas reales.
 * Calendar no tiene ruta propia, así que el modo llega por `input()` — el
 * evento completo cuando se edita (el widget ya lo tiene, del clic que
 * disparó `event-detail`; pedirlo otra vez por id sería una petición de
 * más), `null` cuando se crea.
 *
 * Se muestra como cuadro flotante, mismo idioma que `confirm-dialog` y
 * `event-detail`: `<dialog>` + `showModal()`, sin `open` que el padre
 * empuje — el widget monta y desmonta el componente entero con `@if`, así
 * que "existir" ya significa "debe estar abierto".
 */
@Component({
  selector: 'app-event-edit',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './event-edit.html',
  styleUrl: './event-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventEdit {
  private readonly fb = inject(FormBuilder);
  private readonly calendar = inject(CalendarService);

  readonly event = input<EventResponse | null>(null);

  /** Se guardó con éxito (alta o edición) — el padre decide qué mostrar a continuación. */
  readonly saved = output<EventResponse>();

  readonly cancel = output<void>();

  private readonly id = nextId++;
  protected readonly titleId = `event-edit-title-${this.id}`;

  // Opcional a propósito, mismo motivo que en `event-detail`: el efecto de
  // abajo puede correr antes de que la vista exista.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly editing = computed(() => this.event() !== null);
  protected readonly reminderOptions = REMINDER_OPTIONS;

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      title: ['', [Validators.required, Validators.maxLength(255)]],
      description: ['', [Validators.maxLength(2000)]],
      startDate: ['', [Validators.required]],
      startTime: ['', [Validators.required]],
      endDate: [''],
      endTime: [''],
      location: ['', [Validators.maxLength(255)]],
      reminderMinutesBefore: ['']
    },
    { validators: endAfterStart }
  );

  constructor() {
    // Sincroniza el formulario con `event()` — uso legítimo de `effect`: es
    // una API imperativa externa (`FormGroup.reset`), no un signal, así que
    // no es la propagación entre signals que las convenciones del repo
    // prohíben. `reset` y no `patchValue` a propósito: al pasar de editar un
    // evento a crear otro (`event()` vuelve a `null`), también hace falta
    // borrar `touched`/`dirty` del intento anterior.
    effect(() => {
      const event = this.event();
      this.form.reset(event ? this.toFormValue(event) : this.emptyValue());
    });

    // Segundo efecto, aparte del de arriba: uno sincroniza el formulario con
    // `event()`, este abre el diálogo — mezclar los dos en uno solo haría
    // que cualquier cambio de `event()` (editar A, luego B) reintentara
    // `showModal()` sobre un diálogo que ya está abierto sin necesidad de
    // leer `el.open` para saberlo a primera vista.
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

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const event = this.event();
    const request = this.toRequest();
    const request$ = event
      ? this.calendar.update(event.id, request)
      : this.calendar.create(request);

    request$.subscribe({
      next: saved => this.saved.emit(saved),
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  private toFormValue(event: EventResponse) {
    const start = splitLocalDateTime(event.startAt);
    const end = event.endAt ? splitLocalDateTime(event.endAt) : { date: '', time: '' };

    return {
      title: event.title,
      description: event.description ?? '',
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      location: event.location ?? '',
      reminderMinutesBefore: event.reminderMinutesBefore ? `${event.reminderMinutesBefore}` : ''
    };
  }

  private emptyValue() {
    return {
      title: '',
      description: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      location: '',
      reminderMinutesBefore: ''
    };
  }

  /**
   * `endAt` solo se manda cuando el usuario rellenó FECHA y HORA de fin. Si
   * solo rellenó una de las dos, se trata como "sin fin" en vez de bloquear
   * el envío con un error de más — simplificación deliberada, no un
   * descuido: `endAfterStart` ya impide guardar un fin anterior al inicio
   * cuando SÍ están las dos.
   */
  private toRequest(): EventRequest {
    const { title, description, startDate, startTime, endDate, endTime, location, reminderMinutesBefore } =
      this.form.getRawValue();

    return {
      title,
      description: optional(description),
      startAt: combineDateTime(startDate, startTime),
      endAt: endDate && endTime ? combineDateTime(endDate, endTime) : undefined,
      location: optional(location),
      reminderMinutesBefore: reminderMinutesBefore ? Number(reminderMinutesBefore) : undefined
    };
  }
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Valida en el grupo, no en un control: comparar fin contra inicio necesita
 * leer los dos a la vez. Solo se activa con las cuatro partes rellenas — ver
 * el comentario de `toRequest`.
 */
function endAfterStart(control: AbstractControl): ValidationErrors | null {
  const { startDate, startTime, endDate, endTime } = control.value as Record<string, string>;

  if (!startDate || !startTime || !endDate || !endTime) {
    return null;
  }

  const start = combineDateTime(startDate, startTime);
  const end = combineDateTime(endDate, endTime);

  return end > start ? null : { endBeforeStart: true };
}

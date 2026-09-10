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
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { optional } from '../../../../core/http/optional';
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
 * El cuerpo del formulario de evento: campos, validación y la petición.
 *
 * **No trae `<dialog>` ni cabecera**, y esa es toda la diferencia con lo que
 * antes era `EventEdit` de una pieza. Existen dos contenedores para los mismos
 * campos —el cuadro flotante de `EventEdit` y la pestaña "Evento" de
 * `QuickCreate`— así que la chrome la pone quien lo monta y aquí solo queda lo
 * que es del dominio. Es el mismo corte que separa `layout/chat-panel/` de
 * `features/chat/`: el montaje no es una propiedad del dominio.
 *
 * Crear y editar siguen siendo el mismo componente, igual que antes: `event()`
 * en `null` es el alta.
 */
@Component({
  selector: 'app-event-fields',
  imports: [ReactiveFormsModule],
  templateUrl: './event-fields.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventFields {
  private readonly fb = inject(FormBuilder);
  private readonly calendar = inject(CalendarService);

  readonly event = input<EventResponse | null>(null);

  /** Se guardó con éxito (alta o edición) — el contenedor decide qué mostrar a continuación. */
  readonly saved = output<EventResponse>();

  readonly cancel = output<void>();

  private readonly uid = `event-fields-${nextId++}`;

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
    // Sincroniza el formulario con `event()` — uso legítimo de `effect`: es una
    // API imperativa externa (`FormGroup.reset`), no un signal, así que no es la
    // propagación entre signals que las convenciones del repo prohíben. `reset`
    // y no `patchValue` a propósito: al pasar de editar un evento a crear otro
    // (`event()` vuelve a `null`), también hace falta borrar `touched`/`dirty`
    // del intento anterior.
    effect(() => {
      const event = this.event();
      this.form.reset(event ? this.toFormValue(event) : this.emptyValue());
    });
  }

  /** Ver la cabecera de la plantilla: los `id` no pueden ser literales. */
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

    const event = this.event();
    const request = this.toRequest();
    const request$ = event
      ? this.calendar.update(event.id, request)
      : this.calendar.create(request);

    request$.subscribe({
      next: saved => {
        // Se apaga ANTES de avisar: quien lo monta puede dejarlo en pantalla, y
        // un botón congelado en "Creando..." sería el resto de su vida.
        this.submitting.set(false);
        this.saved.emit(saved);
      },
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
   * `endAt` solo se manda cuando el usuario rellenó FECHA y HORA de fin. Si solo
   * rellenó una de las dos, se trata como "sin fin" en vez de bloquear el envío
   * con un error de más — simplificación deliberada, no un descuido:
   * `endAfterStart` ya impide guardar un fin anterior al inicio cuando SÍ están
   * las dos.
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

/**
 * Valida en el grupo, no en un control: comparar fin contra inicio necesita leer
 * los dos a la vez. Solo se activa con las cuatro partes rellenas — ver el
 * comentario de `toRequest`.
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

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { optional } from '../../../../core/http/optional';
import { Icon } from '../../../../shared/ui/icon/icon';
import { HABIT_NAME_MAX_LENGTH } from '../../habit-rules';
import { HabitRequest, HabitResponse } from '../../models/habit.model';
import { HabitService } from '../../habit.service';

/** Mismo motivo que en `event-fields`: `id` es global al documento. */
let nextId = 0;

/**
 * El alta de hábito: nombre, hora bajo demanda y la petición.
 *
 * **Dos presentaciones, elegidas con `variant`** — la variante está ganada por
 * dos usos reales, no adivinada, igual que la de `ThemeToggle`:
 *
 * - `inline` — la fila de `HabitList`: campo y "Añadir" lado a lado, sin
 *   cancelar. El flujo ahí es encadenar altas, y el foco vuelve al campo.
 * - `stacked` — la pestaña "Hábito" de `QuickCreate`: campo a lo ancho y
 *   Cancelar/Crear al pie, como las otras tres pestañas. Sin ese acuerdo, una
 *   pestaña de cuatro tendría los botones en otro sitio y con otro nombre.
 *
 * Lo que NO cambia entre las dos es todo lo demás, que es justamente el motivo
 * de que esto sea un componente y no dos formularios parecidos: los validadores
 * y el `optional(scheduledTime)` que evita el 400 por cadena vacía.
 *
 * **La hora es un campo visible desde el principio, no una disclosure.**
 * Antes vivía detrás de un botón "Añadir hora" que solo aparecía con el nombre
 * ya escrito; se quitó (2026-09-12) porque escondía una opción que el usuario
 * quiere ver de entrada. Sigue siendo opcional — eso no cambió, solo la
 * visibilidad.
 */
@Component({
  selector: 'app-habit-fields',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './habit-fields.html',
  styleUrl: './habit-fields.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HabitFields {
  private readonly fb = inject(FormBuilder);
  private readonly habits = inject(HabitService);

  readonly variant = input<'inline' | 'stacked'>('inline');

  readonly created = output<HabitResponse>();

  /** Solo lo escucha `stacked`; en la fila de `HabitList` no hay nada que cancelar. */
  readonly cancel = output<void>();

  private readonly uid = `habit-fields-${nextId++}`;

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly createError = signal<string | null>(null);
  protected readonly submitting = signal(false);

  /**
   * Se expone para que la plantilla ponga el `maxlength` nativo en el input. Que
   * el tope viva en una sola constante evita que el atributo y el validador
   * digan cosas distintas.
   */
  protected readonly nameMaxLength = HABIT_NAME_MAX_LENGTH;

  /**
   * `maxLength(100)` porque la spec viva declara ese tope en `HabitRequest.name`:
   * sin él, un nombre largo se manda igual y vuelve como 400 — un error de
   * servidor por algo que el navegador ya sabía.
   */
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(HABIT_NAME_MAX_LENGTH)]],

    /**
     * Sin validadores: un `<input type="time">` solo puede devolver una hora
     * válida o cadena vacía, así que no hay nada que validar. Opcional de
     * verdad — ver `HabitRequest.scheduledTime` en `habit.model.ts`.
     */
    scheduledTime: ['']
  });

  protected fieldId(name: string): string {
    return `${this.uid}-${name}`;
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.createError.set(null);

    // **No se manda `getRawValue()` tal cual.** Con el campo plegado (o
    // desplegado y vacío) `scheduledTime` vale `''`, y el backend responde 400 al
    // no poder parsear una cadena vacía como `LocalTime`. `optional()` la
    // convierte en `undefined`, que desaparece del JSON.
    const { name, scheduledTime } = this.form.getRawValue();
    const request: HabitRequest = { name, scheduledTime: optional(scheduledTime) };

    this.habits.create(request).subscribe({
      next: habit => {
        this.form.reset();
        this.submitting.set(false);

        // El foco vuelve al campo para poder encadenar altas. Sin esto, quien
        // pulsó el botón con el ratón se queda con el foco en el botón y tiene
        // que volver al campo a mano en cada hábito que añada.
        this.nameInput()?.nativeElement.focus();

        this.created.emit(habit);
      },
      error: err => {
        this.submitting.set(false);
        this.createError.set(extractErrorMessage(err));
      }
    });
  }
}

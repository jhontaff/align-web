import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
 * de que esto sea un componente y no dos formularios parecidos: los validadores,
 * el `optional(scheduledTime)` que evita el 400 por cadena vacía, y la hora
 * escondida detrás del nombre.
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
  private readonly injector = inject(Injector);

  readonly variant = input<'inline' | 'stacked'>('inline');

  readonly created = output<HabitResponse>();

  /** Solo lo escucha `stacked`; en la fila de `HabitList` no hay nada que cancelar. */
  readonly cancel = output<void>();

  private readonly uid = `habit-fields-${nextId++}`;

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  /**
   * Los dos extremos del despliegue de la hora. Existen para MOVER EL FOCO, que
   * es lo único que un `@if` no resuelve solo: al desplegar hay que llevarlo al
   * campo nuevo, y al plegar devolverlo al disparador — si no, el foco se queda
   * en un botón que acaba de desmontarse y cae al `<body>`, o sea que quien
   * navega con teclado vuelve al principio de la página.
   */
  private readonly timeInput = viewChild<ElementRef<HTMLInputElement>>('timeInput');
  private readonly addTimeButton = viewChild<ElementRef<HTMLButtonElement>>('addTimeButton');

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
     * **Siempre en el grupo, aunque el input no esté montado.** Declararlo
     * condicionalmente obligaría a `addControl`/`removeControl` en tiempo de
     * ejecución y a que la plantilla se defendiera de que el control todavía no
     * exista; con el valor por defecto correcto, tenerlo plegado simplemente lo
     * ignora. Mismo criterio que el `status` de `TaskFields` en modo creación.
     *
     * Sin validadores: un `<input type="time">` solo puede devolver una hora
     * válida o cadena vacía, así que no hay nada que validar.
     */
    scheduledTime: ['']
  });

  /**
   * Si el campo de hora está desplegado. Es estado de PRESENTACIÓN, no del
   * formulario: el control existe igual plegado.
   */
  protected readonly showTime = signal(false);

  /**
   * `toSignal` y no un `subscribe` a `valueChanges`: lo único que se quiere es
   * que la plantilla lea el valor, y con `OnPush` eso tiene que ser un signal o
   * deja de repintarse.
   */
  private readonly nameValue = toSignal(this.form.controls.name.valueChanges, {
    initialValue: ''
  });

  /**
   * Si hay algo escrito en el campo de nombre. **Es lo que decide si la hora se
   * ofrece siquiera.**
   *
   * La hora es un detalle DE un hábito, así que no tiene sentido pedirla antes de
   * que exista el hábito al que califica: con el campo vacío, "Añadir hora" es un
   * control que no puede llevar a ningún sitio —el submit lo bloquea
   * `Validators.required`—. Progressive disclosure de segundo nivel: el nombre
   * revela el disparador, y el disparador revela el campo.
   *
   * **`trim()` para que unos espacios no cuenten como nombre.** Es a propósito
   * más estricto que `Validators.required`, que da por bueno `'   '`.
   *
   * Ocultar NO borra: `showTime` y el valor de `scheduledTime` sobreviven a
   * vaciar el nombre, así que reponerlo devuelve el campo tal y como estaba.
   */
  protected readonly hasName = computed(() => this.nameValue().trim().length > 0);

  protected fieldId(name: string): string {
    return `${this.uid}-${name}`;
  }

  /**
   * Despliega el campo de hora y lleva el foco dentro.
   *
   * **`afterNextRender` y no un `focus()` a secas**: el `@if` de la plantilla
   * todavía no ha pintado el input cuando corre este handler, así que
   * `timeInput()` sería `undefined`.
   */
  protected revealTime(): void {
    this.showTime.set(true);
    this.focusAfterRender(() => this.timeInput()?.nativeElement.focus());
  }

  /**
   * Pliega el campo y **borra la hora**, que son la misma acción: el botón dice
   * "Quitar hora", así que dejar el valor guardado y solo ocultarlo mandaría al
   * backend una hora que el usuario cree haber quitado.
   */
  protected clearTime(): void {
    this.form.controls.scheduledTime.setValue('');
    this.showTime.set(false);
    this.focusAfterRender(() => this.addTimeButton()?.nativeElement.focus());
  }

  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
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

        // Se pliega tras cada alta: el caso común es encadenar hábitos sin hora,
        // y dejarlo abierto arrastraría un campo vacío a todos los siguientes.
        this.showTime.set(false);
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

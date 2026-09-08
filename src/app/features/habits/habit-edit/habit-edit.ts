import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { optional } from '../../../core/http/optional';
import { Icon } from '../../../shared/ui/icon/icon';
import { HabitRequest, HabitResponse } from '../models/habit.model';
import { HABIT_NAME_MAX_LENGTH } from '../habit-rules';
import { HabitService } from '../habit.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Component({
  selector: 'app-habit-edit',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './habit-edit.html',
  styleUrl: './habit-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HabitEdit {
  private readonly fb = inject(FormBuilder);
  private readonly habits = inject(HabitService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  /** Ver el comentario homonimo de `HabitList`: existen para mover el foco. */
  private readonly timeInput = viewChild<ElementRef<HTMLInputElement>>('timeInput');
  private readonly addTimeButton = viewChild<ElementRef<HTMLButtonElement>>('addTimeButton');

  protected readonly habit = signal<HabitResponse | null>(null);
  protected readonly loading = signal(true);

  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected readonly submitting = signal(false);

  protected readonly nameMaxLength = HABIT_NAME_MAX_LENGTH;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(HABIT_NAME_MAX_LENGTH)]],
    /** Siempre en el grupo aunque el input este plegado. Ver `HabitList`. */
    scheduledTime: ['']
  });

  /**
   * Si el campo de hora esta desplegado.
   *
   * **Aqui arranca segun el dato, no siempre en falso**: un habito que ya tiene
   * hora la ensena de entrada, porque plegada obligaria a descubrir con un clic
   * un valor que ya existe — y quien no lo diera lo estaria borrando sin
   * saberlo al guardar, ya que el `PUT` es un reemplazo.
   */
  protected readonly showTime = signal(false);

  constructor() {
    this.route.paramMap
      .pipe(
        map(params => params.get('id')),
        map(raw => (raw !== null && UUID.test(raw) ? raw : null)),
        distinctUntilChanged(),

        switchMap(id => {
          if (id === null) {
            return of({ habit: null, error: 'El hábito que buscas no existe.' });
          }

          return this.habits.get(id).pipe(
            map(habit => ({ habit, error: null as string | null })),
            catchError(err => of({ habit: null, error: extractErrorMessage(err) })),
            startWith({ habit: null as HabitResponse | null, error: null as string | null })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ habit, error }) => {
        this.habit.set(habit);
        this.loadError.set(error);
        this.loading.set(habit === null && error === null);

        if (habit) {
          // `setValue` exige TODOS los controles del grupo, asi que anadir
          // `scheduledTime` al formulario obliga a nombrarlo aqui: omitirlo no
          // compila, que es justo la red que se quiere.
          this.form.setValue({
            name: habit.name,
            scheduledTime: habit.scheduledTime ?? ''
          });

          this.showTime.set(habit.scheduledTime !== null);
        }
      });
  }

  /** Ver `HabitList.revealTime`. */
  protected revealTime(): void {
    this.showTime.set(true);
    this.focusAfterRender(() => this.timeInput()?.nativeElement.focus());
  }

  /** Ver `HabitList.clearTime`: pliega y borra, que son la misma accion. */
  protected clearTime(): void {
    this.form.controls.scheduledTime.setValue('');
    this.showTime.set(false);
    this.focusAfterRender(() => this.addTimeButton()?.nativeElement.focus());
  }

  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }

  protected onSubmit(): void {
    const habit = this.habit();

    if (!habit) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.saveError.set(null);

    // Igual que en el alta: `''` no es una `LocalTime` y el backend responde
    // 400. Y como el `PUT` es un reemplazo, omitir la clave es exactamente como
    // se BORRA una hora ya guardada — que es lo que hace el boton "Quitar hora".
    const { name, scheduledTime } = this.form.getRawValue();
    const request: HabitRequest = { name, scheduledTime: optional(scheduledTime) };

    this.habits.update(habit.id, request).subscribe({
      next: updated => this.router.navigate(['/habits', updated.id]),
      error: err => {
        this.submitting.set(false);
        this.saveError.set(extractErrorMessage(err));
      }
    });
  }
}

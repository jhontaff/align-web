import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
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

  protected readonly habit = signal<HabitResponse | null>(null);
  protected readonly loading = signal(true);

  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected readonly submitting = signal(false);

  protected readonly nameMaxLength = HABIT_NAME_MAX_LENGTH;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(HABIT_NAME_MAX_LENGTH)]]
  });

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
          this.form.setValue({ name: habit.name });
        }
      });
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

    this.habits.update(habit.id, this.form.getRawValue() as HabitRequest).subscribe({
      next: updated => this.router.navigate(['/habits', updated.id]),
      error: err => {
        this.submitting.set(false);
        this.saveError.set(extractErrorMessage(err));
      }
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { HabitResponse } from '../models/habit.model';
import { HabitService } from '../habit.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; habit: HabitResponse };

@Component({
  selector: 'app-habit-detail',
  imports: [RouterLink, ConfirmDialog, Icon],
  templateUrl: './habit-detail.html',
  styleUrl: './habit-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HabitDetail {
  private readonly habits = inject(HabitService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly habitId$ = this.route.paramMap.pipe(
    map(params => params.get('id')),
    map(raw => (raw !== null && UUID.test(raw) ? raw : null)),
    distinctUntilChanged()
  );

  private readonly loaded = toSignal(
    this.habitId$.pipe(
      switchMap(id => {
        if (id === null) {
          return of<DetailState>({ status: 'error', message: 'El hábito que buscas no existe.' });
        }

        return this.habits.get(id).pipe(
          map((habit): DetailState => ({ status: 'ready', habit })),
          catchError(err => of<DetailState>({ status: 'error', message: extractErrorMessage(err) })),
          startWith<DetailState>({ status: 'loading' })
        );
      })
    ),
    { initialValue: { status: 'loading' } as DetailState }
  );

  private readonly state = linkedSignal(() => this.loaded());

  protected readonly completing = signal(false);

  protected readonly completeError = signal<string | null>(null);

  protected readonly statusMessage = signal('');

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : null;
  });

  protected readonly habit = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.habit : null;
  });

  protected readonly deleting = signal(false);

  protected readonly deleteError = signal<string | null>(null);

  protected readonly confirmOpen = signal(false);

  protected readonly confirmMessage = computed(() => {
    const habit = this.habit();
    return habit
      ? `Se eliminará "${habit.name}" y su racha de forma permanente.`
      : '';
  });

  protected onDeleteClick(): void {
    this.confirmOpen.set(true);
  }

  protected onConfirmDelete(): void {
    const habit = this.habit();

    if (!habit) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set(null);

    this.habits.remove(habit.id).subscribe({
      next: () => this.router.navigate(['/habits']),
      error: err => {
        this.deleting.set(false);
        this.deleteError.set(extractErrorMessage(err));
      }
    });
  }

  protected onComplete(): void {
    const habit = this.habit();

    if (!habit || habit.isCompletedToday || this.completing()) {
      return;
    }

    this.completing.set(true);
    this.completeError.set(null);

    this.habits.complete(habit.id).subscribe({
      next: updated => {
        this.state.set({ status: 'ready', habit: updated });
        this.completing.set(false);

        this.statusMessage.set(
          `${updated.name} marcado. Racha actual: ${this.streakLabel(updated.currentStreak)}.`
        );
      },
      error: err => {
        this.completing.set(false);
        this.completeError.set(extractErrorMessage(err));
      }
    });
  }

  protected streakLabel(streak: number): string {
    if (streak === 0) {
      return 'Sin racha';
    }

    return streak === 1 ? '1 día' : `${streak} días`;
  }

  protected timestampLabel(iso: string): string {
    return new Date(iso).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

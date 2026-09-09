import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
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

  /**
   * Una operacion de marcado EN VUELO, en cualquiera de los dos sentidos.
   *
   * Un solo signal y no `completing` + `uncompleting`: son mutuamente
   * excluyentes por estado —solo se puede marcar lo pendiente y desmarcar lo
   * hecho—, asi que `isCompletedToday` ya dice cual de los dos esta corriendo y
   * un segundo booleano solo abriria la puerta a que se contradigan.
   */
  protected readonly marking = signal(false);

  protected readonly markError = signal<string | null>(null);

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

    if (!habit || habit.isCompletedToday || this.marking()) {
      return;
    }

    this.run(this.habits.complete(habit.id), updated =>
      `${updated.name} marcado. Racha actual: ${this.streakLabel(updated.currentStreak)}.`
    );
  }

  /**
   * Deshace la completacion de hoy.
   *
   * **Sin confirmacion, al contrario que borrar.** Es reversible en un clic
   * —se vuelve a marcar— y `<app-confirm-dialog>` se reserva para lo que no
   * tiene vuelta atras. Que la racha pueda caer no lo cambia: el numero se
   * recalcula y se ve cambiar en la misma pantalla, que es mejor aviso que un
   * dialogo prediciendolo.
   *
   * El anuncio dice la racha RESULTANTE y no "se perdio la racha": lo que el
   * backend devuelve puede no ser cero —un record viejo mas largo sobrevive al
   * recalculo— y afirmarlo aqui seria adivinar.
   */
  protected onUncomplete(): void {
    const habit = this.habit();

    if (!habit || !habit.isCompletedToday || this.marking()) {
      return;
    }

    this.run(this.habits.uncomplete(habit.id), updated =>
      `${updated.name} desmarcado. Racha actual: ${this.streakLabel(updated.currentStreak)}.`
    );
  }

  /**
   * Lo comun a marcar y desmarcar: las dos sustituyen el estado con la
   * respuesta, que trae las dos rachas ya recalculadas por el servidor.
   *
   * **Ninguna toca `currentStreak` en local.** La frontera del dia la decide el
   * backend con su reloj y su zona; una segunda version del calculo aqui
   * divergiria de la suya a la primera medianoche. Vale igual al desmarcar, que
   * ademas puede mover `longestStreak` — verificado el 2026-09-09.
   */
  private run(request: Observable<HabitResponse>, announce: (habit: HabitResponse) => string): void {
    this.marking.set(true);
    this.markError.set(null);

    request.subscribe({
      next: updated => {
        this.state.set({ status: 'ready', habit: updated });
        this.marking.set(false);
        this.statusMessage.set(announce(updated));
      },
      error: err => {
        this.marking.set(false);
        this.markError.set(extractErrorMessage(err));
      }
    });
  }

  protected streakLabel(streak: number): string {
    if (streak === 0) {
      return 'Sin racha';
    }

    return streak === 1 ? '1 día' : `${streak} días`;
  }

  /**
   * `"09:00:00"` -> `"09:00"`. El backend recorta los segundos cuando son cero,
   * pero no siempre, y aqui los segundos se leerian como una precision que el
   * dato no tiene.
   */
  protected timeLabel(scheduledTime: string): string {
    return scheduledTime.slice(0, 5);
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

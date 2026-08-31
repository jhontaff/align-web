import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataRefreshService } from '../../../../core/data/data-refresh.service';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { SummaryCard } from '../summary-card/summary-card';
import { HabitResponse } from '../../../habits/models/habit.model';
import { HabitService } from '../../../habits/habit.service';

/** Cuantos habitos asoman en el resumen. Mismo criterio que Tareas. */
const PREVIEW_SIZE = 3;

/**
 * Tarjeta de Habitos del panel de Inicio.
 *
 * Nacio sin enlace porque `/habits` no existia; ahora que la navegacion tiene
 * su pestana y la ruta apunta a `habit-list`, el pie lleva al listado. Lo que
 * sigue sin existir es el alta, y por eso el estado vacio no ofrece ningun
 * boton de crear: un enlace muerto es peor que su ausencia.
 *
 * Es la tarjeta que justifica que cada una haga su propia peticion: este es el
 * dominio menos rodado de los tres, y con un `forkJoin` en `Home` un fallo
 * suyo dejaria en blanco tambien Tareas y Finanzas.
 */
@Component({
  selector: 'app-habits-summary',
  imports: [SummaryCard],
  templateUrl: './habits-summary.html',
  styleUrl: './habits-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HabitsSummary implements OnInit {
  private readonly habits = inject(HabitService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * La lista **entera**: `GET /api/habits` no pagina y devuelve el array
   * completo. El recorte a tres es de presentacion y por eso vive en un
   * `computed`, no en la peticion — al reves que en Tareas, donde el `size=3`
   * viaja al servidor porque alli si hay paginacion que aprovechar.
   */
  private readonly all = signal<HabitResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly count = computed(() => this.all().length);

  /**
   * Los de racha mas alta primero: en un vistazo de tres, lo que interesa es
   * lo que se esta sosteniendo, no el orden en que se creo.
   *
   * **Se copia antes de ordenar.** `Array.sort` ordena en su sitio, y este
   * array es el valor de un signal: mutarlo cambiaria `all()` por debajo sin
   * notificar a nadie, que con `OnPush` es una lista que deja de repintarse.
   * `toSorted` diria lo mismo en una linea, pero exige `lib: es2023` y el
   * `tsconfig` del repo apunta mas abajo — no se mueve el objetivo de todo el
   * proyecto por una llamada.
   */
  protected readonly top = computed(() =>
    [...this.all()]
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, PREVIEW_SIZE)
  );

  ngOnInit(): void {
    this.load();
    this.dataRefresh.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  private load(): void {
    this.errorMessage.set(null);

    this.habits.list().subscribe({
      next: habits => {
        this.all.set(habits);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  protected countLabel(count: number): string {
    return count === 1 ? '1 habito' : `${count} habitos`;
  }

  /**
   * "5 dias" / "1 dia" / "sin racha".
   *
   * Una racha de 0 no se escribe como "0 dias": el cero se lee como un dato
   * medido cuando en realidad lo que dice es que el habito esta parado.
   */
  protected streakLabel(habit: HabitResponse): string {
    if (habit.currentStreak === 0) {
      return 'sin racha';
    }

    return habit.currentStreak === 1 ? '1 día' : `${habit.currentStreak} días`;
  }
}

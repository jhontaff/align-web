import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataRefreshService } from '../../../../core/data/data-refresh.service';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { SummaryCard } from '../summary-card/summary-card';
import { TaskResponse } from '../../../tasks/models/task.model';
import { TaskService } from '../../../tasks/task.service';

/**
 * Cuantas tareas asoman en el resumen. Tres, porque esto es un vistazo: el
 * listado entero esta a un toque en `/tasks` y repetirlo aqui seria la misma
 * pantalla dos veces.
 */
const PREVIEW_SIZE = 3;

/**
 * Tarjeta de Tareas del panel de Inicio.
 *
 * Importa `TaskService` y `TaskResponse` de otra feature: es la excepcion
 * direccional de `home`, que existe justamente para agregar dominios. La flecha
 * va siempre `home -> feature`, y solo alcanza a servicios y modelos — nunca a
 * los componentes de Tareas.
 *
 * Posee su peticion, su carga y su error, en vez de recibirlos de `Home`. La
 * alternativa —un `forkJoin` de los tres dominios en el padre— **falla entera
 * al primer error**: un 500 en `/api/habits` dejaria en blanco tambien esta
 * tarjeta, que no tiene nada que ver. Aqui los tres conjuntos son
 * independientes, asi que sus fallos tambien deben serlo.
 */
@Component({
  selector: 'app-tasks-summary',
  imports: [SummaryCard],
  templateUrl: './tasks-summary.html',
  styleUrl: './tasks-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TasksSummary implements OnInit {
  private readonly tasks = inject(TaskService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  /** Inyectado y no escrito a mano, como en `finance/overview`. */
  private readonly locale = inject(LOCALE_ID);

  protected readonly upcoming = signal<TaskResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  /**
   * Total de pendientes segun el servidor, no `upcoming().length`.
   *
   * Sale de `totalElements` de la misma respuesta paginada que trae las tres
   * de arriba: una peticion, dos datos. Contar el array local diria siempre
   * "3" en cuanto hubiera mas de tres pendientes, que es justo cuando el
   * numero empieza a importar.
   */
  protected readonly pendingCount = signal<number | null>(null);

  ngOnInit(): void {
    this.load();

    // El agente puede crear o completar tareas mientras Inicio esta detras del
    // panel de chat. `takeUntilDestroyed` es obligatorio: un Subject no
    // completa nunca, asi que sin esto cada visita a Inicio dejaria otra
    // suscripcion viva pidiendo tareas.
    this.dataRefresh.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  /**
   * `sort: 'dueDate,asc'` para que las tres que se muestran sean las que
   * vencen antes y no tres cualesquiera.
   *
   * La revalidacion no vuelve a poner `loading` en true, igual que en
   * `TaskList` y en el resumen de Finanzas: vaciar la tarjeta para pintar un
   * "Cargando" de 200ms es mas ruido que informacion cuando los datos ya
   * estan en pantalla.
   */
  private load(): void {
    this.errorMessage.set(null);

    this.tasks
      .list({ status: 'PENDING' }, { page: 0, size: PREVIEW_SIZE, sort: 'dueDate,asc' })
      .subscribe({
        next: page => {
          this.upcoming.set(page.content);
          this.pendingCount.set(page.totalElements);
          this.loading.set(false);
        },
        error: err => {
          this.loading.set(false);
          this.errorMessage.set(extractErrorMessage(err));
        }
      });
  }

  /**
   * "3 pendientes" / "1 pendiente".
   *
   * El singular se escribe porque el plural en `-s` no vale para "pendiente" a
   * secas y una cadena tipo "1 pendiente(s)" es la marca de que nadie miro la
   * pantalla.
   */
  protected countLabel(count: number): string {
    return count === 1 ? '1 pendiente' : `${count} pendientes`;
  }

  /**
   * "25 ago · 14:30", o null si la tarea no tiene vencimiento.
   *
   * Mismo formato que `TaskList.dueLabel()` — el usuario ve las mismas tareas
   * en las dos pantallas y dos formatos distintos para el mismo dato se leen
   * como un fallo. La diferencia es que aqui el locale se inyecta.
   *
   * `new Date('2026-08-25')` se interpreta como medianoche **UTC**: al oeste de
   * Greenwich la fecha mostrada seria la del dia anterior. Anadir la hora
   * fuerza la lectura local, que es lo que quiere decir una fecha sin hora.
   */
  protected dueLabel(task: TaskResponse): string | null {
    if (!task.dueDate) {
      return null;
    }

    const formatted = new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(this.locale, {
      day: 'numeric',
      month: 'short'
    });

    return task.dueTime ? `${formatted} · ${task.dueTime.slice(0, 5)}` : formatted;
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthStateService } from '../../core/auth/auth-state.service';
import { FinanceSummary } from './components/finance-summary/finance-summary';
import { HabitsSummary } from './components/habits-summary/habits-summary';
import { TasksSummary } from './components/tasks-summary/tasks-summary';

/**
 * El panel de Inicio: el saludo y una tarjeta por dominio.
 *
 * No orquesta nada. Cada tarjeta hace su propia peticion, posee su carga y su
 * error, y se suscribe por su cuenta a `DataRefreshService`. La alternativa
 * —un `forkJoin` de los tres dominios aqui— **falla entera al primer error**,
 * asi que un 500 en cualquiera de los tres dejaria el panel en blanco. En
 * `finance/overview` el `forkJoin` si esta justificado porque sus dos
 * peticiones describen el mismo conjunto de datos; estas tres no.
 */
@Component({
  selector: 'app-home',
  imports: [TasksSummary, FinanceSummary, HabitsSummary],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Home {
  protected readonly authState = inject(AuthStateService);
}

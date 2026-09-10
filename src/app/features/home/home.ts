import { TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AuthStateService } from '../../core/auth/auth-state.service';
import { Icon } from '../../shared/ui/icon/icon';
import { CalendarWidget } from './components/calendar-widget/calendar-widget';
import { FinanceSummary } from './components/finance-summary/finance-summary';
import { HabitsSummary } from './components/habits-summary/habits-summary';
import { QuickCreate } from './components/quick-create/quick-create';
import { TasksSummary } from './components/tasks-summary/tasks-summary';
/**
 * El panel de Inicio: el saludo, el botón de crear y una tarjeta por dominio.
 *
 * No orquesta nada. Cada tarjeta hace su propia peticion, posee su carga y su
 * error, y se suscribe por su cuenta a `DataRefreshService`. La alternativa
 * —un `forkJoin` de los tres dominios aqui— **falla entera al primer error**,
 * asi que un 500 en cualquiera de los tres dejaria el panel en blanco. En
 * `finance/overview` el `forkJoin` si esta justificado porque sus dos
 * peticiones describen el mismo conjunto de datos; estas tres no.
 *
 * Lo único que sí es suyo es el panel de creación rápida: se monta con `@if`,
 * así que "existir" significa "abierto" y cerrarlo lo desmonta — mismo trato que
 * `CalendarWidget` le da a sus diálogos. El `<dialog>` devuelve solo el foco al
 * botón que lo abrió.
 */
@Component({
  selector: 'app-home',
  imports: [
    TitleCasePipe,
    Icon,
    TasksSummary,
    FinanceSummary,
    HabitsSummary,
    CalendarWidget,
    QuickCreate
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Home {
  protected readonly authState = inject(AuthStateService);

  protected readonly creating = signal(false);

  /**
   * Lo último creado, para la región `role="status"`.
   *
   * Vive aquí y no dentro de `QuickCreate` porque el panel se desmonta justo al
   * crear: una región `aria-live` que desaparece en el mismo fotograma en que
   * cambia su texto no la anuncia nadie. Inicio, en cambio, sigue montado — y su
   * región está SIEMPRE en el DOM, que es el otro requisito para que un lector
   * de pantalla la observe. Mismo motivo que la de `HabitList`.
   */
  protected readonly statusMessage = signal('');

  protected onCreated(message: string): void {
    this.statusMessage.set(message);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataRefreshService } from '../../../../core/data/data-refresh.service';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { Icon } from '../../../../shared/ui/icon/icon';
import { SummaryCard } from '../summary-card/summary-card';
import { currentMonth } from '../../../finance/date-ranges';
import { MONEY_DIGITS } from '../../../finance/money';
import { FinancialSummaryResponse } from '../../../finance/models/transaction.model';
import { TransactionService } from '../../../finance/transaction.service';

/**
 * Tarjeta de Finanzas del panel de Inicio.
 *
 * **Solo `summary()`, no el `forkJoin` de `finance/overview`.** Alli las cifras
 * y los ultimos movimientos van juntos porque describen el mismo conjunto y
 * resueltos por separado la pantalla se contradice a si misma; aqui los
 * movimientos no se pintan, asi que no hay nada con lo que sincronizar. La
 * lista completa esta una pantalla mas alla, y repetirla en el panel seria la
 * misma informacion dos veces.
 *
 * Importa de `features/finance/` por la excepcion direccional de `home`: solo
 * el servicio, el modelo y `currentMonth()`, nunca el componente `Overview`.
 */
@Component({
  selector: 'app-finance-summary',
  imports: [SummaryCard, CurrencyPipe, Icon],
  templateUrl: './finance-summary.html',
  styleUrl: './finance-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinanceSummary implements OnInit {
  private readonly transactions = inject(TransactionService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  /**
   * El mes en curso, resuelto una vez al construir.
   *
   * `GET /api/transactions/summary` **sin filtro devuelve el historico
   * completo**, un numero que solo crece y no responde a la pregunta que el
   * usuario se hace al abrir Inicio. Mismo rango que `finance/overview`, y a
   * proposito: dos cifras distintas para "lo que llevo" en dos pantallas de la
   * misma app se leen como un error de cuentas.
   */
  private readonly range = currentMonth();

  /** Ver `finance/money.ts`: la constante subió allí en su tercer consumidor. */
  protected readonly moneyDigits = MONEY_DIGITS;

  protected readonly summary = signal<FinancialSummaryResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  /** "agosto de 2026". */
  protected readonly rangeLabel = new Date(`${this.range.from}T00:00:00`).toLocaleDateString(
    this.locale,
    { month: 'long', year: 'numeric' }
  );

  /**
   * El balance es la unica de las tres cifras cuyo color depende del dato: los
   * ingresos siempre suman y los gastos siempre restan, pero el balance puede
   * ir en cualquier direccion.
   *
   * Son dos computed y no uno con tres valores porque el cero no es ninguno de
   * los dos: un balance clavado en cero no es una buena noticia teñida de verde
   * ni una mala teñida de rojo, y se queda con el color de texto por defecto.
   */
  protected readonly balancePositive = computed(() => (this.summary()?.balance ?? 0) > 0);
  protected readonly balanceNegative = computed(() => (this.summary()?.balance ?? 0) < 0);

  ngOnInit(): void {
    this.load();
    this.dataRefresh.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  private load(): void {
    this.errorMessage.set(null);

    this.transactions.summary(this.range).subscribe({
      next: summary => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }
}

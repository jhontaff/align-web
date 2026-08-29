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
import { forkJoin } from 'rxjs';
import { DataRefreshService } from '../../../core/data/data-refresh.service';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { currentMonth } from '../date-ranges';
import { CATEGORY_LABELS, TYPE_LABELS } from '../transaction-labels';
import {
  FinancialSummaryResponse,
  TransactionCategory,
  TransactionResponse,
  TransactionType
} from '../models/transaction.model';
import { TransactionService } from '../transaction.service';

/**
 * Cuántos movimientos recientes muestra el resumen.
 *
 * Cinco y no diez: esto es un vistazo, no el listado. El listado completo llega
 * con `activity/`, y hasta entonces esta pantalla no ofrece "ver todos" porque
 * no habría dónde ir — un enlace muerto es peor que la ausencia del enlace.
 */
const RECENT_SIZE = 5;

/**
 * Resumen de Finanzas: los totales del rango y un vistazo a lo último.
 */
@Component({
  selector: 'app-finance-overview',
  imports: [CurrencyPipe],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Overview implements OnInit {
  private readonly transactions = inject(TransactionService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * El locale se inyecta en vez de escribir `'es-ES'` a mano como hace
   * `task-list.ts`: ya está declarado una vez en `app.config.ts`, y repetir la
   * cadena aquí sería un segundo sitio que actualizar el día que cambie.
   */
  private readonly locale = inject(LOCALE_ID);

  /**
   * El mes en curso, resuelto una vez al construir la pantalla.
   *
   * `GET /api/transactions/summary` **sin filtro devuelve el histórico
   * completo**, que es un número que solo crece y no responde a la pregunta que
   * el usuario se hace ("¿cuánto llevo este mes?"). El endpoint ya acepta
   * `from`/`to`, así que acotar no cuesta nada.
   *
   * Fijo, no reactivo: el selector de rango llega con `activity/`. La única
   * consecuencia de resolverlo al construir es que una pestaña abierta al
   * cruzar la medianoche del día 1 seguiría mostrando el mes anterior hasta
   * que se navegue — aceptable frente a montar un temporizador para eso.
   */
  protected readonly range = currentMonth();

  protected readonly summary = signal<FinancialSummaryResponse | null>(null);
  protected readonly recent = signal<TransactionResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  /** "agosto de 2026". */
  protected readonly rangeLabel = this.formatMonth(this.range.from);

  /**
   * El balance es la única de las tres cifras cuyo color depende del dato: los
   * ingresos siempre suman y los gastos siempre restan, pero el balance puede
   * ir en cualquier dirección.
   */
  protected readonly balanceNegative = computed(() => (this.summary()?.balance ?? 0) < 0);

  ngOnInit(): void {
    this.load();

    // El agente puede registrar movimientos mientras esta pantalla está abierta
    // detrás del panel de chat. `takeUntilDestroyed` es obligatorio: un Subject
    // no completa nunca, así que sin esto cada visita a /finance dejaría otra
    // suscripción viva pidiendo datos.
    this.dataRefresh.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
  }

  /**
   * Las dos peticiones van en un `forkJoin` y no en dos `subscribe` sueltos.
   *
   * No es por ahorrar código: es que las cifras de arriba y las filas de abajo
   * describen el mismo conjunto de datos. Resueltas por separado, un gasto
   * recién creado aparecería en la lista un instante antes de que el balance se
   * enterase, y durante ese instante la pantalla se contradice a sí misma.
   *
   * La revalidación no vuelve a poner `loading` en true, igual que en
   * `TaskList`: vaciar la pantalla para pintar un "Cargando" de 200ms es más
   * ruido que información cuando los datos ya están ahí.
   */
  private load(): void {
    this.errorMessage.set(null);

    forkJoin({
      summary: this.transactions.summary(this.range),
      recent: this.transactions.list(this.range, { page: 0, size: RECENT_SIZE, sort: 'date,desc' })
    }).subscribe({
      next: ({ summary, recent }) => {
        this.summary.set(summary);
        this.recent.set(recent.content);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  protected typeLabel(type: TransactionType): string {
    return TYPE_LABELS[type];
  }

  /**
   * El signo lo pone la plantilla a partir de `type`, así que el importe se
   * pinta en valor absoluto.
   *
   * Hoy el backend devuelve `amount` como magnitud positiva y el sentido lo
   * lleva `type`, con lo cual esto no cambia nada. Está por si algún día
   * devolviera los gastos en negativo: entonces la fila diría "−-12,00 €" en
   * vez de fallar, que es el tipo de error que nadie mira.
   */
  protected absAmount(transaction: TransactionResponse): number {
    return Math.abs(transaction.amount);
  }

  protected categoryLabel(category: TransactionCategory): string {
    return CATEGORY_LABELS[category];
  }

  /** "12 ago". */
  protected dateLabel(transaction: TransactionResponse): string {
    return this.parseIsoDate(transaction.date).toLocaleDateString(this.locale, {
      day: 'numeric',
      month: 'short'
    });
  }

  private formatMonth(isoDate: string): string {
    return this.parseIsoDate(isoDate).toLocaleDateString(this.locale, {
      month: 'long',
      year: 'numeric'
    });
  }

  /**
   * `new Date('2026-08-12')` se interpreta como medianoche **UTC**, no local:
   * en cualquier zona al oeste de Greenwich la fecha mostrada sería la del día
   * anterior. Añadir la hora fuerza la lectura local, que es lo que quiere
   * decir una fecha sin hora. Mismo apaño que `dueLabel()` en `task-list.ts`.
   */
  private parseIsoDate(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00`);
  }
}

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
import { DateRange, formatDateRange, parseIsoDate } from '../../../core/date/date-range';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { DateRangePicker } from '../../../shared/ui/date-range-picker/date-range-picker';
import { ExpenseByCategory } from '../components/expense-by-category/expense-by-category';
import { DATE_RANGE_PRESETS, currentMonth } from '../date-ranges';
import { MONEY_DIGITS } from '../money';
import { CATEGORY_LABELS, TYPE_LABELS } from '../transaction-labels';
import {
  CategoryExpense,
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
 * Resumen de Finanzas: los totales del rango elegido y un vistazo a lo último.
 */
@Component({
  selector: 'app-finance-overview',
  imports: [CurrencyPipe, DateRangePicker, ExpenseByCategory],
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
   * El rango consultado. **Signal, no constante**: hasta que existió el
   * selector esto se resolvía una vez al construir la pantalla y no había forma
   * de cambiarlo.
   *
   * Arranca en el mes en curso porque `GET /api/transactions/summary` **sin
   * filtro devuelve el histórico completo**, que es un número que solo crece y
   * no responde a la pregunta que el usuario se hace ("¿cuánto llevo este
   * mes?"). El endpoint ya acepta `from`/`to`, así que acotar no cuesta nada.
   *
   * El estado vive aquí y no en un servicio con estado: es el patrón por
   * defecto del repo —servicio sin estado, la pantalla posee lo suyo— y hoy
   * nadie más necesita este rango. Sube a un servicio el día que `activity/`
   * tenga que compartirlo entre navegaciones, no antes.
   */
  protected readonly range = signal<DateRange>(currentMonth());

  /** Los atajos que ofrece el selector. Constante, no hace falta signal. */
  protected readonly presets = DATE_RANGE_PRESETS;

  /**
   * Ya no vive aquí: subió a `finance/money.ts` en su tercer consumidor —esta
   * pantalla, la tarjeta de Inicio y el gráfico de gastos por categoría—, que
   * es justo lo que este comentario anunciaba que pasaría. La justificación
   * (por qué sin decimales, por qué `undefined` como divisa) se fue con la
   * constante; aquí solo queda exponerla a la plantilla.
   */
  protected readonly moneyDigits = MONEY_DIGITS;

  protected readonly summary = signal<FinancialSummaryResponse | null>(null);

  /**
   * El desglose del gasto por categoría. `null` mientras no hay datos, y no un
   * array vacío: "todavía no ha llegado" y "en este periodo no hubo gastos" son
   * dos cosas distintas y el gráfico pinta un estado vacío para la segunda.
   */
  protected readonly byCategory = signal<CategoryExpense[] | null>(null);

  protected readonly recent = signal<TransactionResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  /**
   * "Septiembre de 2026" para un mes natural, "12 – 20 sep 2026" para un rango
   * cualquiera. La lógica está en `core/date/` porque el botón del selector
   * pinta exactamente la misma cadena, y dos formatos distintos para el mismo
   * rango en la misma pantalla se leen como un fallo.
   */
  protected readonly rangeLabel = computed(() => formatDateRange(this.range(), this.locale));

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
   * Cambiar de periodo **sí** vacía la pantalla mientras llega la respuesta, al
   * revés que la revalidación del agente.
   *
   * No es una inconsistencia: son dos cosas distintas. La revalidación vuelve a
   * pedir lo mismo, así que lo que hay en pantalla sigue siendo válido y
   * vaciarlo sería ruido. Un cambio de rango es otra pregunta, y dejar las
   * cifras de agosto bajo un encabezado que ya dice "septiembre" es afirmar
   * algo falso durante todo lo que tarde la petición.
   */
  protected onRangeChange(range: DateRange): void {
    this.range.set(range);
    this.summary.set(null);
    this.byCategory.set(null);
    this.recent.set([]);
    this.loading.set(true);
    this.load();
  }

  /**
   * Las tres lecturas van en un `forkJoin` y no en tres `subscribe` sueltos.
   *
   * No es por ahorrar código: es que las cifras de arriba, las barras del medio
   * y las filas de abajo describen el mismo conjunto de datos. Resueltas por
   * separado, un gasto recién creado aparecería en la lista un instante antes
   * de que el balance se enterase, y durante ese instante la pantalla se
   * contradice a sí misma.
   *
   * Con el gráfico dentro, el argumento se vuelve literal: las nueve barras
   * **suman** el `totalExpense` que está justo encima. Dejar que lleguen por su
   * cuenta es garantizar una ventana en la que el usuario puede ver un total y
   * un desglose que no cuadran, y ese es el tipo de descuadre que hace dudar de
   * toda la pantalla.
   *
   * Nunca pone `loading` a true por su cuenta: quien llama decide si este fetch
   * merece vaciar la pantalla (ver `onRangeChange`) o no (la revalidación del
   * agente, igual que en `TaskList`).
   */
  private load(): void {
    this.errorMessage.set(null);
    const range = this.range();

    forkJoin({
      summary: this.transactions.summary(range),
      // Once peticiones en paralelo, de las cuales nueve son este desglose. El
      // navegador solo abre seis conexiones por origen sobre HTTP/1.1 —que es
      // lo que da el proxy de desarrollo—, así que salen en dos tandas. Es el
      // precio de que el backend no agregue por categoría, y está anotado en
      // `expenseByCategory()`; no es algo que se arregle moviendo código aquí.
      byCategory: this.transactions.expenseByCategory(range),
      recent: this.transactions.list(range, { page: 0, size: RECENT_SIZE, sort: 'date,desc' })
    }).subscribe({
      next: ({ summary, byCategory, recent }) => {
        this.summary.set(summary);
        this.byCategory.set(byCategory);
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

  /**
   * "12 ago". `parseIsoDate` viene de `core/date/`: era un método privado de
   * esta clase, y subió cuando el selector necesitó exactamente la misma
   * corrección de zona horaria.
   */
  protected dateLabel(transaction: TransactionResponse): string {
    return parseIsoDate(transaction.date).toLocaleDateString(this.locale, {
      day: 'numeric',
      month: 'short'
    });
  }
}

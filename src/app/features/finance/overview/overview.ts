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
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { DataRefreshService } from '../../../core/data/data-refresh.service';
import { DateRange, formatDateRange } from '../../../core/date/date-range';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { DateRangePicker } from '../../../shared/ui/date-range-picker/date-range-picker';
import { Icon } from '../../../shared/ui/icon/icon';
import { ExpenseByCategory } from '../components/expense-by-category/expense-by-category';
import { MonthlyFlow } from '../components/monthly-flow/monthly-flow';
import { TransactionRow } from '../components/transaction-row/transaction-row';
import { DATE_RANGE_PRESETS, currentMonth, monthWindow } from '../date-ranges';
import { MONEY_DIGITS } from '../money';
import {
  CategoryAmount,
  ExpenseCategory,
  FinancialSummaryResponse,
  MonthlyPoint,
  TransactionResponse
} from '../models/transaction.model';
import { TransactionService } from '../transaction.service';

/**
 * Cuántos movimientos recientes muestra el resumen.
 *
 * Cinco y no diez: esto es un vistazo, no el listado. El listado completo vive
 * en `transaction-history/`, y el "Ver todo" de la cabecera de la sección es
 * cómo se llega — con el número de movimientos del periodo escrito dentro, que
 * es lo que hace evidente que aquí solo se ve una muestra. Hasta que esa
 * pantalla existió no había enlace, porque un enlace muerto es peor que su
 * ausencia.
 */
const RECENT_SIZE = 5;

/**
 * Cuántos meses entran en el gráfico de flujo.
 *
 * Seis y no doce, que es la ventana que el backend elegiría por su cuenta: doce
 * columnas de barras agrupadas en el ancho de una tarjeta dejan cada barra en
 * unos pocos píxeles, y comparar dos meses vecinos —que es la única pregunta
 * que este gráfico responde— deja de ser posible. Medio año también es el
 * horizonte en el que una tendencia de finanzas personales significa algo; más
 * atrás es historia, y esa vive en el listado.
 *
 * Es una constante y no un control: un selector de "cuántos meses" es un ajuste
 * más que mantener para responder la misma pregunta. Si aparece la necesidad
 * real, entra en la cabecera junto al de periodo, no aquí.
 */
const FLOW_MONTHS = 6;

/**
 * Resumen de Finanzas: los totales del rango elegido y un vistazo a lo último.
 */
@Component({
  selector: 'app-finance-overview',
  imports: [
    CurrencyPipe,
    RouterLink,
    DateRangePicker,
    Icon,
    ExpenseByCategory,
    MonthlyFlow,
    TransactionRow
  ],
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
  protected readonly byCategory = signal<CategoryAmount<ExpenseCategory>[] | null>(null);

  /**
   * Los meses del gráfico de flujo. `null` mientras no hay datos, por el mismo
   * motivo que `byCategory`: "todavía no ha llegado" y "no hubo movimientos"
   * son dos cosas distintas y el gráfico pinta un vacío para la segunda.
   */
  protected readonly monthly = signal<readonly MonthlyPoint[] | null>(null);

  protected readonly recent = signal<TransactionResponse[]>([]);

  /**
   * Cuántos movimientos tiene el periodo **en el servidor**, no cuántos se
   * pintan aquí.
   *
   * Sale de `totalElements` de la misma respuesta paginada que ya trae los
   * cinco recientes, así que no cuesta ninguna petición extra — el mismo truco
   * que usa el contador de pendientes del resumen de Inicio. Es el número
   * honesto: `recent().length` está topado a cinco y diría "Ver todo (5)" con
   * ochenta gastos registrados.
   */
  protected readonly totalCount = signal(0);
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
    this.monthly.set(null);
    this.recent.set([]);
    this.totalCount.set(0);
    this.loading.set(true);
    this.load();
  }

  /**
   * Las cuatro lecturas van en un `forkJoin` y no en cuatro `subscribe` sueltos.
   *
   * No es por ahorrar código: es que las cifras de arriba, las barras del medio
   * y las filas de abajo describen el mismo conjunto de datos. Resueltas por
   * separado, un gasto recién creado aparecería en la lista un instante antes
   * de que el balance se enterase, y durante ese instante la pantalla se
   * contradice a sí misma.
   *
   * Con el gráfico dentro, el argumento se vuelve literal: las barras
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
      // Cuatro peticiones, no doce: el desglose por categoría era un `forkJoin`
      // de nueve `GET /summary` hasta que el backend añadió el endpoint
      // agregado (ver `categoryBreakdown()`). Con HTTP/1.1 en el proxy de
      // desarrollo —seis conexiones por origen— aquello salía en dos tandas, y
      // el gráfico se pintaba después que el resto de la pantalla.
      byCategory: this.transactions.categoryBreakdown(range),
      // La única lectura que NO se acota al rango, y es deliberado: una
      // tendencia necesita historia, y con "Este mes" seleccionado un gráfico
      // acotado al rango sería una sola columna. Lo que sí respeta del rango es
      // dónde termina la ventana — ver `monthWindow()`.
      monthly: this.transactions.monthlySummary(monthWindow(range, FLOW_MONTHS)),
      recent: this.transactions.list(range, { page: 0, size: RECENT_SIZE, sort: 'date,desc' })
    }).subscribe({
      next: ({ summary, byCategory, monthly, recent }) => {
        this.summary.set(summary);
        // Del desglose se toma solo `expenses`: la pantalla no pinta los
        // ingresos por categoría, y guardar la respuesta entera obligaría al
        // gráfico a saber de qué campo sacarlos.
        this.byCategory.set(byCategory.expenses);
        this.monthly.set(monthly.months);
        this.recent.set(recent.content);
        this.totalCount.set(recent.totalElements);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }
}

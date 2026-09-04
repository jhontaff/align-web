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
import { DataRefreshService } from '../../../core/data/data-refresh.service';
import { DateRange, formatDateRange, parseIsoDate } from '../../../core/date/date-range';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { DateRangePicker } from '../../../shared/ui/date-range-picker/date-range-picker';
import { Icon } from '../../../shared/ui/icon/icon';
import { TransactionRow } from '../components/transaction-row/transaction-row';
import { DATE_RANGE_PRESETS } from '../date-ranges';
import { MONEY_DIGITS } from '../money';
import { TransactionFilter, TransactionResponse } from '../models/transaction.model';
import { TransactionService } from '../transaction.service';

/**
 * Cuántos movimientos trae cada tanda.
 *
 * 25 y no 5 como el resumen: allí es un vistazo, aquí se viene a recorrer. Y no
 * 200 "para no tener que paginar": pedir un `size` grande y confiar en que
 * quepa todo es el fallo silencioso que este repo ya rechazó dos veces —el
 * buscador de Tareas y el gráfico por categoría—, porque el día que no quepa,
 * la pantalla miente sin que nada falle.
 */
const PAGE_SIZE = 25;

/** Un mes con sus movimientos, tal y como se pinta. */
interface MonthGroup {
  /** `yyyy-MM`. Sirve de `track` y de sufijo del `id` del encabezado. */
  readonly key: string;
  /** "Septiembre de 2026". */
  readonly label: string;
  readonly items: readonly TransactionResponse[];
  /**
   * Si el mes está entero en memoria.
   *
   * El último grupo de la lista **no lo está** mientras queden páginas: la
   * siguiente tanda seguirá trayendo movimientos suyos. De ahí sale la única
   * regla no obvia de esta pantalla — ver `groups`.
   */
  readonly complete: boolean;
  /** Ingresos menos gastos del mes. Solo tiene sentido si `complete`. */
  readonly balance: number;
}

/**
 * Historial completo de movimientos, agrupado por meses.
 *
 * Es el destino del "Ver todo" del resumen, y la diferencia entre las dos
 * pantallas no es de tamaño: el resumen responde "¿cómo voy este mes?" con tres
 * cifras y una muestra, y esto responde "¿qué he registrado?" con la lista
 * entera. Por eso aquí **no hay filtro de partida**: acotar es una decisión que
 * toma el usuario cuando ya sabe qué está mirando, no una que la pantalla toma
 * por él.
 */
@Component({
  selector: 'app-transaction-history',
  imports: [CurrencyPipe, RouterLink, DateRangePicker, Icon, TransactionRow],
  templateUrl: './transaction-history.html',
  styleUrl: './transaction-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionHistory implements OnInit {
  private readonly transactions = inject(TransactionService);
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LOCALE_ID);

  /**
   * El rango consultado, **`null` de partida**: el primer vistazo es el
   * historial entero.
   *
   * Es lo contrario del resumen, y a propósito. Allí el rango arranca en el mes
   * en curso porque un total histórico es un número que solo crece y no
   * responde a ninguna pregunta; aquí lo que se pide es precisamente el
   * histórico, y filtrarlo de entrada escondería justo lo que el usuario vino a
   * ver — que fue el síntoma que originó esta pantalla.
   */
  protected readonly range = signal<DateRange | null>(null);

  protected readonly presets = DATE_RANGE_PRESETS;
  protected readonly moneyDigits = MONEY_DIGITS;

  /** Todo lo cargado hasta ahora, en orden de fecha descendente. */
  private readonly items = signal<readonly TransactionResponse[]>([]);

  /**
   * Cuántos hay **en el servidor** para el filtro actual, no cuántos se han
   * traído. Sale de `totalElements` de la misma respuesta paginada, igual que
   * el contador de pendientes del resumen de Inicio: es el número honesto, y
   * `items().length` sería el de la ventana cargada.
   */
  protected readonly totalElements = signal(0);

  protected readonly hasMore = signal(false);

  /**
   * Páginas ya traídas. Se guarda para que la revalidación pueda volver a pedir
   * **la misma ventana** en una sola petición, en vez de devolver a la primera
   * tanda a quien ya había pulsado "cargar más" cuatro veces.
   */
  private readonly loadedPages = signal(0);

  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly rangeLabel = computed(() => {
    const range = this.range();
    return range ? formatDateRange(range, this.locale) : 'Todo el historial';
  });

  /**
   * Lo que dice el contador bajo el título.
   *
   * El número va **antes** del periodo porque es lo que se comprueba de un
   * vistazo tras cambiar el filtro; y va escrito, no solo implícito en la
   * longitud de la lista, porque la lista está paginada: quien ve 25 filas no
   * puede deducir que hay 340.
   */
  protected readonly countLabel = computed(() => {
    const total = this.totalElements();
    const movimientos = total === 1 ? '1 movimiento' : `${total} movimientos`;
    return `${movimientos} · ${this.rangeLabel()}`;
  });

  protected readonly remaining = computed(() =>
    Math.max(0, this.totalElements() - this.items().length)
  );

  /**
   * Los movimientos partidos en meses.
   *
   * La agrupación es de cliente porque el backend no la ofrece, pero **no
   * inventa ningún dato**: solo parte por el `yyyy-MM` de la fecha, que ya viene
   * en la respuesta.
   *
   * La regla que importa es `complete`. El backend pagina, así que el último
   * mes de la lista está **a medias** mientras queden páginas: sus movimientos
   * siguen llegando. Pintarle un balance ahí daría una cifra que parece la del
   * mes y es la de un trozo arbitrario de él, y que además cambia al pulsar
   * "cargar más" — el peor tipo de número, el que está mal sin fallar. Por eso
   * el grupo de cola no muestra balance hasta que la lista está entera.
   *
   * Se agrupa con un `Map` y no comparando con la fila anterior, aunque la
   * lista venga ordenada: la ordenación la decide el servidor, y una agrupación
   * que se rompe en silencio si algún día cambia el `sort` no merece la línea
   * que ahorra.
   */
  protected readonly groups = computed<MonthGroup[]>(() => {
    const hasMore = this.hasMore();
    const buckets = new Map<string, TransactionResponse[]>();

    for (const transaction of this.items()) {
      const key = transaction.date.slice(0, 7);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(transaction);
      } else {
        buckets.set(key, [transaction]);
      }
    }

    const keys = [...buckets.keys()];

    return keys.map((key, index) => {
      const items = buckets.get(key)!;
      return {
        key,
        label: this.monthLabel(key),
        items,
        complete: !hasMore || index < keys.length - 1,
        balance: items.reduce(
          (total, item) => total + (item.type === 'INCOME' ? item.amount : -item.amount),
          0
        )
      };
    });
  });

  ngOnInit(): void {
    this.fetch({ page: 0, size: PAGE_SIZE, append: false });

    // El agente puede registrar movimientos mientras esta pantalla está abierta
    // detrás del panel de chat. `takeUntilDestroyed` es obligatorio: un Subject
    // no completa nunca, así que sin esto cada visita dejaría otra suscripción
    // viva pidiendo datos.
    this.dataRefresh.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // Se vuelve a pedir la ventana YA CARGADA, no la primera página: quien ha
      // ido bajando cuatro tandas no debería perderlas porque el agente anotara
      // un gasto. Una sola petición con el `size` acumulado, y el `sort` es el
      // mismo, así que el resultado es la misma lista actualizada.
      const pages = Math.max(1, this.loadedPages());
      this.fetch({ page: 0, size: pages * PAGE_SIZE, append: false, pages });
    });
  }

  /**
   * Cambiar de periodo **sí** vacía la lista mientras llega la respuesta, al
   * revés que la revalidación del agente.
   *
   * No es una inconsistencia: son dos cosas distintas. La revalidación vuelve a
   * pedir lo mismo, así que lo que hay en pantalla sigue siendo válido. Un
   * cambio de rango es otra pregunta, y dejar los movimientos de agosto bajo un
   * contador que ya dice "septiembre" es afirmar algo falso durante todo lo que
   * tarde la petición.
   */
  protected onRangeChange(range: DateRange): void {
    this.applyFilter(range);
  }

  protected onClearRange(): void {
    this.applyFilter(null);
  }

  protected loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }
    this.loadingMore.set(true);
    this.fetch({ page: this.loadedPages(), size: PAGE_SIZE, append: true });
  }

  private applyFilter(range: DateRange | null): void {
    this.range.set(range);
    this.items.set([]);
    this.totalElements.set(0);
    this.hasMore.set(false);
    this.loadedPages.set(0);
    this.loading.set(true);
    this.fetch({ page: 0, size: PAGE_SIZE, append: false });
  }

  /**
   * `sort: 'date,desc'` va siempre. Sin él el orden lo decide el backend, y una
   * lista de movimientos que no baja por fecha parece rota aunque los datos
   * sean correctos — y aquí, además, los meses saldrían entrelazados.
   *
   * Sin rango se manda `undefined` y no `{ from: '', to: '' }`: `toHttpParams`
   * omite las claves vacías igualmente, pero el objeto vacío deja escrito en el
   * código que hay un filtro cuando lo que hay es su ausencia.
   */
  private fetch(options: { page: number; size: number; append: boolean; pages?: number }): void {
    this.errorMessage.set(null);
    const range = this.range();
    const filter: TransactionFilter | undefined = range
      ? { from: range.from, to: range.to }
      : undefined;

    this.transactions
      .list(filter, { page: options.page, size: options.size, sort: 'date,desc' })
      .subscribe({
        next: page => {
          this.items.update(current =>
            options.append ? [...current, ...page.content] : page.content
          );
          this.totalElements.set(page.totalElements);
          this.hasMore.set(!page.last);
          this.loadedPages.set(options.pages ?? options.page + 1);
          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: err => {
          this.loading.set(false);
          this.loadingMore.set(false);
          this.errorMessage.set(extractErrorMessage(err));
        }
      });
  }

  /**
   * "Septiembre de 2026" a partir de `2026-09`.
   *
   * Se le pega el día 1 y se parsea con `parseIsoDate` en vez de construir el
   * `Date` a mano: es la misma función que usa el resto de la app y arrastra
   * consigo la corrección de zona horaria. `Intl` devuelve el mes en minúscula
   * en español y esto encabeza un `h2`, de ahí la capitalización.
   */
  private monthLabel(key: string): string {
    const text = parseIsoDate(`${key}-01`).toLocaleDateString(this.locale, {
      month: 'long',
      year: 'numeric'
    });
    return text.charAt(0).toLocaleUpperCase(this.locale) + text.slice(1);
  }
}

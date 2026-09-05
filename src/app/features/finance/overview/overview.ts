import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  LOCALE_ID,
  NgZone,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CompactType,
  DisplayGrid,
  GridType,
  GridsterComponent,
  GridsterConfig,
  GridsterItemComponent,
  GridsterPush
} from 'angular-gridster2';
import { forkJoin } from 'rxjs';
import { DataRefreshService } from '../../../core/data/data-refresh.service';
import { DateRange } from '../../../core/date/date-range';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { BreakpointService } from '../../../core/layout/breakpoint.service';
import { DateRangePicker } from '../../../shared/ui/date-range-picker/date-range-picker';
import { Icon } from '../../../shared/ui/icon/icon';
import { ExpenseByCategory } from '../components/expense-by-category/expense-by-category';
import { MonthlyFlow } from '../components/monthly-flow/monthly-flow';
import { SpendingPace } from '../components/spending-pace/spending-pace';
import { TransactionRow } from '../components/transaction-row/transaction-row';
import {
  DASHBOARD_CARD_IDS,
  DASHBOARD_COLUMNS,
  DASHBOARD_MARGIN,
  DASHBOARD_MOBILE_COLUMNS,
  DASHBOARD_ROW_HEIGHT,
  DashboardCard,
  DashboardCards,
  DashboardLayoutVariant,
  clearLayout,
  defaultLayout,
  handlesFor,
  loadLayout,
  rowsForHeight,
  saveLayout
} from '../dashboard-layout';
import { DATE_RANGE_PRESETS, currentMonth, monthWindow } from '../date-ranges';
import { MONEY_DIGITS } from '../money';
import {
  CategoryAmount,
  ExpenseCategory,
  FinancialSummaryResponse,
  MonthlyPoint,
  TransactionResponse
} from '../models/transaction.model';
import { DailySeries, buildDailySeries, paceWindows } from '../spending-pace';
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
 * Cuántos movimientos se piden por mes para el gráfico de ritmo de gasto.
 *
 * **No es una página de una lista paginada: es "todo el mes de una vez".** La
 * curva es el acumulado día a día, así que necesita las filas crudas —no hay
 * endpoint diario— y una segunda página no se pide: si un mes no cabe aquí, la
 * tarjeta se niega a pintarse (ver `DailySeries.complete`). Paginar en bucle
 * sería reintroducir el N+1 que `categoryBreakdown()` acaba de quitarse de
 * encima, y por un caso que en finanzas personales no ocurre: quinientos gastos
 * en un mes son dieciséis al día.
 *
 * Queda cómodamente por debajo del tope de Spring
 * (`spring.data.web.pageable.max-page-size`, 2000 por defecto), que recorta el
 * `size` en silencio en vez de responder un error.
 */
const PACE_PAGE_SIZE = 500;

/**
 * Las dos series del ritmo de gasto, que solo tienen sentido juntas: comparten
 * la escala vertical del gráfico.
 */
interface Pace {
  readonly current: DailySeries;
  readonly previous: DailySeries;
}

/**
 * El centinela con el que se le quita a gridster, PARA SIEMPRE, la decisión de
 * si está en modo móvil. `checkIfMobile()` es `mobileBreakpoint > ancho`: con 0
 * nunca es cierto, sea cual sea el ancho.
 *
 * Esto no es solo el arreglo del bug de "las tarjetas no se mueven" — es la
 * precondición de que el móvil también se pueda personalizar. En modo móvil de
 * gridster, `canBeDragged()` devuelve `false` sin excepción; si este centinelo
 * se apagara en pantallas estrechas, arrastrar para reordenar en el teléfono
 * volvería a ser imposible. El número de columnas para una pantalla estrecha lo
 * decide `DASHBOARD_MOBILE_COLUMNS` vía `minCols`/`maxCols`, no este flag — ver
 * `applyColumnLayout()`.
 */
const NEVER_MOBILE = 0;

/**
 * Resumen de Finanzas: los totales del rango elegido y un vistazo a lo último.
 */
@Component({
  selector: 'app-finance-overview',
  imports: [
    CurrencyPipe,
    RouterLink,
    // Los dos componentes de gridster son standalone, así que entran por aquí y
    // no por `GridsterModule`: el repo no tiene NgModules y no va a estrenar
    // uno para una librería que ya ofrece la alternativa.
    GridsterComponent,
    GridsterItemComponent,
    DateRangePicker,
    Icon,
    ExpenseByCategory,
    MonthlyFlow,
    SpendingPace,
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
  private readonly zone = inject(NgZone);
  private readonly breakpoint = inject(BreakpointService);

  // ---------------------------------------------------------------------------
  // La rejilla
  // ---------------------------------------------------------------------------

  /**
   * Qué disposición corresponde al ancho actual.
   *
   * Un método y no un `computed`: no expone estado a la plantilla, es una
   * lectura puntual que usan `resetLayout()`, `toggleEditing()` y el
   * `itemChangeCallback` para saber DÓNDE guardar o restablecer. Un `computed`
   * aquí sería una capa de indirección sin ningún consumidor reactivo detrás.
   */
  private layoutVariant(): DashboardLayoutVariant {
    return this.breakpoint.isDesktop() ? 'desktop' : 'mobile';
  }

  /**
   * Las siete tarjetas con su posición.
   *
   * **Es un campo plano y no un `signal`, y va contra la regla general del
   * repo a propósito.** Gridster muta estos objetos en su sitio al arrastrar
   * (`card.x = 3`) y nunca cambia la identidad del array ni de los objetos. Un
   * `signal` no emitiría jamás: daría una falsa impresión de reactividad y
   * obligaría a un `.set([...])` defensivo que pelearía con la librería por
   * quién es el dueño del dato. Aquí el dueño es gridster, y se escribe siempre
   * por su misma puerta — ver `applyRows()`, `resetLayout()` y
   * `applyColumnLayout()`, que tocan tanto `card` como el `$item` del
   * componente.
   *
   * La plantilla tampoco lo lee de forma reactiva: las siete `<gridster-item>`
   * están escritas una a una, así que Angular no vuelve a evaluar nada.
   *
   * **Son los mismos siete objetos en escritorio y en móvil.** No hay un
   * `cards` por variante: cambiar de ancho no cambia QUÉ objeto está enlazado a
   * cada `<gridster-item>` (eso obligaría a que Angular reconociera el cambio
   * de referencia y gridster reconstruyera cada item), sino los NÚMEROS que
   * esos objetos contienen — ver `applyColumnLayout()`.
   */
  protected readonly cards: DashboardCards = loadLayout(this.layoutVariant());

  /** Si el usuario está recolocando. Esto sí es estado de la pantalla. */
  protected readonly editing = signal(false);

  /**
   * La configuración de la rejilla.
   *
   * Objeto mutable por contrato con la librería: cambiar una opción se hace
   * escribiendo en él y llamando a `api.optionsChanged()`. Mutarlo sin la
   * llamada no hace nada — es la trampa clásica de gridster.
   *
   * Las decisiones que no se leen solas:
   *
   * - **`verticalFixed` + `setGridSize: true` es la ÚNICA combinación que
   *   respeta el scroll de la ventana.** `fit` recorta al alto del contenedor y
   *   `scrollVertical` le da a la rejilla su propio `overflow-y: auto`; las dos
   *   dejarían `withInMemoryScrolling` sin efecto, que es justo lo que el shell
   *   documenta que no puede pasar. Con `setGridSize` la rejilla toma el alto de
   *   su contenido y la página crece, así que quien hace scroll sigue siendo la
   *   ventana. (Efecto lateral que hay que compensar en CSS: `setGridSize`
   *   también fija el ANCHO en línea, y entonces la rejilla no vuelve a
   *   encogerse al estrechar la ventana. Ver `overview.scss`.)
   * - **`minCols`/`maxCols` reaccionan al ancho, `mobileBreakpoint` NUNCA.** Son
   *   dos preguntas distintas: cuántas columnas hay (sí depende del ancho,
   *   `DASHBOARD_COLUMNS` o `DASHBOARD_MOBILE_COLUMNS`) y si gridster se cree en
   *   "modo móvil" (nunca — ver el comentario de `NEVER_MOBILE`, que es
   *   literalmente el bug de "las tarjetas no se mueven" si se reactivara). Los
   *   valores iniciales salen de `BreakpointService`, que se alimenta del mismo
   *   `matchMedia` que el SCSS — ver `applyColumnLayout()`, que es quien los
   *   mantiene sincronizados después.
   * - **`outerMargin: false`**: el aire exterior ya lo pone el `padding` de
   *   `.page`. Con los dos, el contenido quedaría a 40px del borde y descuadrado
   *   respecto a la cabecera.
   * - **Se arrastra desde cualquier punto de la tarjeta**, no desde un tirador.
   *   Una primera versión usaba `ignoreContent: true` + `dragHandleClass`, y con
   *   eso la franja del tirador era el ÚNICO punto de agarre: si no dabas ahí,
   *   la tarjeta no se movía y no había ninguna señal de por qué. Lo que sigue
   *   siendo pulsable dentro de una tarjeta ("Ver todo (83)", las filas de
   *   movimientos) lleva `dashboard__no-drag`, que es la clase que
   *   `ignoreContentClass` mira para dejar pasar el evento.
   */
  protected readonly gridOptions: GridsterConfig = {
    gridType: GridType.VerticalFixed,
    fixedRowHeight: DASHBOARD_ROW_HEIGHT,
    setGridSize: true,
    margin: DASHBOARD_MARGIN,
    outerMargin: false,
    minCols: this.breakpoint.isDesktop() ? DASHBOARD_COLUMNS : DASHBOARD_MOBILE_COLUMNS,
    maxCols: this.breakpoint.isDesktop() ? DASHBOARD_COLUMNS : DASHBOARD_MOBILE_COLUMNS,
    compactType: CompactType.CompactUp,
    pushItems: true,
    minItemRows: 2,
    // Fijo para siempre — ver el comentario de `NEVER_MOBILE`. El concepto de
    // "modo móvil" de gridster está permanentemente apagado; la pantalla
    // estrecha se resuelve con una sola columna, no con ese modo.
    mobileBreakpoint: NEVER_MOBILE,
    // La retícula de fondo de gridster no se enciende nunca, ni siquiera al
    // recolocar: son guías que ensucian más de lo que orientan, y las pinta la
    // librería en su propia plantilla —o sea, fuera del alcance de la
    // encapsulación de esta pantalla, con bordes blancos literales que habría
    // que corregir desde un archivo global. El borde discontinuo de cada celda
    // en modo edición dice lo mismo y es nuestro.
    displayGrid: DisplayGrid.None,
    draggable: { enabled: false, ignoreContent: false, ignoreContentClass: 'dashboard__no-drag' },
    // Arranca deshabilitado igual que en escritorio; `applyColumnLayout()` lo
    // deja así también en móvil aunque se entre en modo edición — ver ese
    // método para el porqué.
    resizable: { enabled: false },
    // Se guarda en cada cambio y no solo al salir del modo edición: gridster
    // avisa por item. `layoutVariant()` decide si lo que acaba de cambiar es la
    // disposición de escritorio o la de móvil.
    itemChangeCallback: () => saveLayout(this.layoutVariant(), this.cards)
  };

  /**
   * La sección de alto automático.
   *
   * Se observa la `<section>` y no un envoltorio interior porque no hace falta
   * uno: la sección es hija directa del item, no lleva alto impuesto y su
   * `offsetHeight` es el natural del contenido. Lo que NO se puede observar es
   * el `<gridster-item>`, que sí tiene el alto que le pone la rejilla —
   * observarlo se realimentaría (crece el item, el observador lo ve más alto,
   * lo hace crecer otra vez) y ese es el bucle infinito clásico de
   * `ResizeObserver`.
   *
   * Hasta el 2026-09-05 había dos ("Gastos por categoría" también era
   * automática); ahora esa se reparte el alto de su celda como los demás
   * gráficos (`.dashboard__card--fill`), y esta es la única que queda.
   */
  private readonly recentCard = viewChild.required<ElementRef<HTMLElement>>('recentCard');

  constructor() {
    // Los tiradores son por item: las tarjetas automáticas solo se estiran a lo
    // ancho. Ver `handlesFor()`.
    for (const id of DASHBOARD_CARD_IDS) {
      const card = this.cards[id];
      card.resizableHandles = handlesFor(card);
    }

    this.syncBreakpoint();

    // `afterNextRender` y no `ngAfterViewInit`: hay que LEER del DOM, y solo
    // tiene sentido con la primera pintura hecha. Además no corre en el
    // servidor, que es donde `ResizeObserver` no existe.
    afterNextRender(() => this.observeAutoHeight());
  }

  /**
   * Mantiene la rejilla sincronizada con el ancho de la ventana: cuántas
   * columnas hay y qué disposición (escritorio o móvil) está activa.
   *
   * Es un uso legítimo de `effect`: sincroniza un signal (`isDesktop()`) con una
   * API imperativa de terceros, igual que el de `ThemeService` escribe
   * `data-theme` en `<html>`. No propaga estado entre signals, que es lo que
   * está prohibido.
   */
  private syncBreakpoint(): void {
    effect(() => {
      this.applyColumnLayout(this.breakpoint.isDesktop());
    });
  }

  /**
   * Cambia entre la rejilla de doce columnas y la de una, y con ella entre la
   * disposición de escritorio y la de móvil.
   *
   * **Esto reemplaza la pila por CSS que había antes del 2026-09-05**, y es la
   * pieza que permite personalizar también en el teléfono. Con la pila por CSS,
   * cruzar a móvil dejaba de importarle a gridster (`.dashboard__cell { height:
   * auto !important }` fuera de su control) y el botón "Personalizar" se
   * ocultaba: no había nada que reordenar porque no había disposición, solo el
   * orden fijo del DOM. Ahora gridster coloca de verdad también ahí —con
   * `minCols`/`maxCols` en `DASHBOARD_MOBILE_COLUMNS`—, así que arrastrar sigue
   * funcionando y "en qué orden se apila" es una pregunta con respuesta propia,
   * guardada aparte de la de escritorio (`DashboardLayoutVariant`).
   *
   * **El redimensionado se apaga en móvil aunque `editing()` esté activo.** Con
   * una sola columna no hay ancho que repartir —ya vale el 100%— y estirar en
   * vertical ahí sería una segunda forma de "personalizar" superpuesta al
   * reordenar, con tiradores que en una columna estrecha son difíciles de
   * acertar con el dedo. Se deja fuera del alcance de esta función: personalizar
   * en móvil es reordenar, nada más.
   *
   * Corre en cada cambio de breakpoint, así que también corre en el montaje
   * (primer valor del `effect`) — momento en el que `cards` ya trae cargada la
   * disposición correcta desde su inicializador, y esta primera pasada solo la
   * confirma. Redundante, no incorrecto: es el precio de un único punto de
   * verdad en vez de duplicar la lógica de carga en el constructor.
   */
  private applyColumnLayout(desktop: boolean): void {
    const columns = desktop ? DASHBOARD_COLUMNS : DASHBOARD_MOBILE_COLUMNS;
    this.gridOptions.minCols = columns;
    this.gridOptions.maxCols = columns;
    this.gridOptions.resizable = { ...this.gridOptions.resizable, enabled: this.editing() && desktop };

    const positions = loadLayout(desktop ? 'desktop' : 'mobile');
    for (const id of DASHBOARD_CARD_IDS) {
      const card = this.cards[id];
      const from = positions[id];

      card.x = from.x;
      card.y = from.y;
      card.cols = from.cols;
      if (!card.autoHeight) {
        card.rows = from.rows;
      }

      this.syncEngine(card);
    }

    // En el primer pase `api` todavía no existe (gridster la publica en su
    // `ngOnChanges`), y no pasa nada: los valores ya están escritos en los
    // objetos que va a leer en cuanto se inicialice.
    this.gridOptions.api?.optionsChanged?.();
  }

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

  /**
   * Las dos series diarias del ritmo de gasto: el mes en curso hasta hoy y el
   * anterior completo.
   *
   * **Es el único bloque de la pantalla que NO depende del selector de
   * periodo**, y por eso tiene sus propios signals y su propia carga en vez de
   * salir del `forkJoin` de `load()`. El marcador de hoy, la proyección y el
   * "día 15 de 30" solo significan algo dentro del mes en curso: con "Este año"
   * seleccionado no hay ningún "día de hoy" del rango que dibujar. Se fija al
   * mes en curso y su encabezado lo nombra, para que no parezca que el selector
   * no le hace caso.
   *
   * Es un caso distinto del de `monthly`, que mira más allá del rango pero
   * respeta dónde termina: este ni siquiera lo mira.
   *
   * Las dos series van en **un solo signal** y no en dos: comparten la escala
   * vertical del gráfico, así que ninguna significa nada sin la otra. Con dos
   * signals la plantilla tendría que comprobar los dos y existiría un estado
   * —una sí, la otra no— que no debería poder representarse.
   */
  protected readonly pace = signal<Pace | null>(null);
  protected readonly paceLoading = signal(true);

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
   * El balance es la única de las tres cifras cuyo color depende del dato: los
   * ingresos siempre suman y los gastos siempre restan, pero el balance puede
   * ir en cualquier dirección.
   */
  protected readonly balanceNegative = computed(() => (this.summary()?.balance ?? 0) < 0);

  /**
   * "Septiembre": el mes que describe la tarjeta de ritmo.
   *
   * Se calcula una vez y no es un `computed` porque no depende de ningún signal
   * —la ventana es fija, ver `paceCurrent`—. Encabeza la sección precisamente
   * porque ese bloque ignora el selector de periodo: sin el mes escrito, con
   * "Este año" elegido arriba parecería que el selector no le hace caso.
   */
  protected readonly paceMonthLabel = capitalize(
    new Date().toLocaleDateString(this.locale, { month: 'long' }),
    this.locale
  );

  /**
   * La carga del ritmo terminó sin datos, o sea falló.
   *
   * Hace falta distinguirlo de "todavía cargando": sin esto, un fallo dejaría la
   * sección con su encabezado y nada debajo, que es la forma de fallo que parece
   * un hueco de maquetación en vez de un error.
   */
  protected readonly paceFailed = computed(() => !this.paceLoading() && !this.pace());

  ngOnInit(): void {
    this.load();
    this.loadPace();

    // El agente puede registrar movimientos mientras esta pantalla está abierta
    // detrás del panel de chat. `takeUntilDestroyed` es obligatorio: un Subject
    // no completa nunca, así que sin esto cada visita a /finance dejaría otra
    // suscripción viva pidiendo datos.
    //
    // La revalidación sí toca las dos cargas: un gasto creado por el agente
    // puede ser de hoy, y entonces cambia también la curva del ritmo.
    this.dataRefresh.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.load();
      this.loadPace();
    });
  }

  // ---------------------------------------------------------------------------
  // Personalización de la rejilla
  // ---------------------------------------------------------------------------

  /**
   * Entra y sale del modo de recolocar.
   *
   * El arrastre está apagado por defecto y no al revés: con él siempre activo,
   * cada pulsación sobre una tarjeta es un arrastre en potencia. El modo edición
   * es también lo que enciende la retícula de fondo, que solo sirve mientras se
   * coloca.
   *
   * **El redimensionado solo se enciende en escritorio**, aunque se esté
   * editando: en móvil, con una sola columna, no hay ancho que repartir y
   * personalizar es solo reordenar — ver `applyColumnLayout()`, que es quien
   * mantiene esa misma condición cada vez que cambia el ancho de la ventana. Si
   * se tocara solo aquí, cruzar el breakpoint con el modo edición ya abierto
   * dejaría encendido un redimensionado que ya no debería estarlo.
   *
   * Se reasignan `draggable` y `resizable` enteros en vez de tocar su `enabled`:
   * `setOptions()` de gridster mezcla estos objetos con los suyos por defecto, y
   * un objeto nuevo deja claro que lo que se manda es la configuración completa.
   */
  protected toggleEditing(): void {
    const editing = !this.editing();
    this.editing.set(editing);

    const desktop = this.breakpoint.isDesktop();
    this.gridOptions.draggable = { ...this.gridOptions.draggable, enabled: editing };
    this.gridOptions.resizable = { ...this.gridOptions.resizable, enabled: editing && desktop };
    this.gridOptions.api?.optionsChanged?.();

    if (!editing) {
      saveLayout(this.layoutVariant(), this.cards);
    }
  }

  /**
   * Vuelve a la disposición de fábrica de la variante ACTIVA y olvida la
   * guardada — la de escritorio si se ve en escritorio, la de móvil si se ve en
   * móvil. La otra variante no se toca: son dos preguntas distintas (ver
   * `DashboardLayoutVariant`), y restablecer una no tiene por qué opinar sobre
   * la otra.
   *
   * No es solo una comodidad: **es el único camino de teclado de esta función.**
   * Arrastrar y redimensionar son gestos de puntero y gridster no trae
   * equivalente, así que sin esto un usuario de teclado que herede un layout
   * roto —o que lo estropee sin querer con el ratón— no tendría forma de
   * recuperarse.
   *
   * El alto de la tarjeta automática NO se restaura: lo decide su contenido, y
   * el observador ya lo tiene bien calculado.
   */
  protected resetLayout(): void {
    const variant = this.layoutVariant();
    const defaults = defaultLayout(variant);

    for (const id of DASHBOARD_CARD_IDS) {
      const card = this.cards[id];
      const from = defaults[id];

      card.x = from.x;
      card.y = from.y;
      card.cols = from.cols;
      if (!card.autoHeight) {
        card.rows = from.rows;
      }

      this.syncEngine(card);
    }

    clearLayout(variant);
    this.gridOptions.api?.optionsChanged?.();
  }

  /**
   * Suscribe las dos tarjetas de alto automático a los cambios de su contenido.
   *
   * El observador se crea **fuera de la zona de Angular**. No es prudencia
   * genérica: al arrastrar o redimensionar en horizontal, el ancho de la
   * sección cambia, el texto se remaqueta y el observador dispara decenas de
   * veces por segundo. Con Zone.js cada una de esas veces sería una detección
   * de cambios de toda la app en mitad de un gesto. Solo se vuelve a entrar en
   * la zona cuando el número de filas cambia de verdad, que es raro.
   */
  private observeAutoHeight(): void {
    const targets = new Map<Element, DashboardCard>([
      [this.recentCard().nativeElement, this.cards.recent]
    ]);

    const observer = this.zone.runOutsideAngular(
      () =>
        new ResizeObserver(entries => {
          for (const entry of entries) {
            const card = targets.get(entry.target);
            if (card) {
              // `offsetHeight` y no `contentRect`: incluye relleno y borde, así
              // que sigue valiendo si algún día la sección deja de ser una caja
              // sin adornos.
              this.fitToContent(card, (entry.target as HTMLElement).offsetHeight);
            }
          }
        })
    );

    for (const target of targets.keys()) {
      observer.observe(target);
    }

    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** Ajusta las filas de una tarjeta automática a su contenido. */
  private fitToContent(card: DashboardCard, height: number): void {
    // Alto cero es "todavía no se pinta", no "no hay contenido": gridster deja
    // sus items en `display: none` hasta que los coloca por primera vez, y
    // `ResizeObserver` dispara igual con 0×0. Sin este corte, la tarjeta se
    // encogería al mínimo en el primer fotograma para volver a crecer en el
    // siguiente — un salto visible que no significa nada.
    if (height === 0) {
      return;
    }

    const rows = rowsForHeight(height);
    if (rows === card.rows) {
      return;
    }

    this.zone.run(() => this.applyRows(card, rows));
  }

  /**
   * Escribe un alto nuevo y **empuja hacia abajo lo que estorbe**.
   *
   * El empujón es la parte que no se ve venir: `compactType: 'compactUp'` solo
   * mueve items hacia ARRIBA para tapar huecos, así que no resuelve un
   * solapamiento. Si "Últimos movimientos" crece de siete a diez filas, sin
   * esto se metería por debajo de la tarjeta que tenga debajo y las dos se
   * pintarían encima. `GridsterPush` es la misma pieza que usa la librería al
   * redimensionar con el ratón, y `fromNorth` es la dirección con la que el
   * borde sur de un item avanza sobre sus vecinos.
   */
  private applyRows(card: DashboardCard, rows: number): void {
    card.rows = rows;

    const component = this.syncEngine(card);
    if (component) {
      const push = new GridsterPush(component);
      push.pushItems(push.fromNorth);
      push.setPushedItems();
      push.destroy();
    }

    this.gridOptions.api?.optionsChanged?.();
  }

  /**
   * Copia la posición de la tarjeta al `$item` de su componente.
   *
   * Hace falta porque escribimos en el objeto **en su sitio**: sin cambio de
   * identidad no hay `ngOnChanges`, así que gridster no se entera por su cuenta.
   * Y `$item` no es un detalle interno prescindible: es la copia contra la que
   * el motor calcula colisiones y pinta. Actualizar solo `card` deja la rejilla
   * viendo el tamaño viejo.
   */
  private syncEngine(card: DashboardCard): GridsterItemComponent | undefined {
    const component = this.gridOptions.api?.getItemComponent?.(card) as
      | GridsterItemComponent
      | undefined;

    if (component) {
      component.$item.x = card.x;
      component.$item.y = card.y;
      component.$item.cols = card.cols;
      component.$item.rows = card.rows;
    }

    return component;
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
   *
   * **No vuelve a pedir el ritmo de gasto**, y esa omisión es la parte
   * deliberada: sus datos dependen de la ventana fija y de la versión de los
   * datos, no del rango. Refrescarlo aquí serían dos peticiones por cada clic
   * del selector para recibir exactamente lo mismo.
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

  /**
   * El ritmo de gasto: dos peticiones de movimientos crudos, fijas al mes en
   * curso.
   *
   * **Va aparte de `load()` porque no depende del rango**, no por comodidad. Y
   * sus dos lecturas sí van juntas en un `forkJoin` entre ellas: las dos curvas
   * comparten escala vertical, así que resueltas por separado el gráfico se
   * pintaría con una sola y luego saltaría de escala al llegar la otra.
   *
   * **Son filas y no un agregado porque no hay endpoint diario**: `/summary` da
   * un total por rango y `/summary/monthly` agrega por mes, y esta curva es
   * acumulado por día. Ver `spending-pace.ts`.
   *
   * `type: 'EXPENSE'` en el filtro: la tarjeta habla de gasto, y traer también
   * los ingresos sería pedir filas que se descartan y acercar el tope de
   * `PACE_PAGE_SIZE` sin ninguna razón.
   *
   * **No propaga el error a `errorMessage`.** Ese banner encabeza la página y
   * habla de todo lo que hay debajo; que falle un bloque que ni siquiera
   * responde al selector no puede teñir de rojo el resumen entero. La tarjeta se
   * queda en su estado de carga y el resto de la pantalla sigue siendo válido.
   */
  private loadPace(): void {
    const windows = paceWindows();
    const pageable = { page: 0, size: PACE_PAGE_SIZE, sort: 'date,asc' };

    forkJoin({
      current: this.transactions.list({ ...windows.current, type: 'EXPENSE' }, pageable),
      previous: this.transactions.list({ ...windows.previous, type: 'EXPENSE' }, pageable)
    }).subscribe({
      next: ({ current, previous }) => {
        this.pace.set({
          current: buildDailySeries(windows.current, current),
          previous: buildDailySeries(windows.previous, previous)
        });
        this.paceLoading.set(false);
      },
      error: () => this.paceLoading.set(false)
    });
  }
}

/**
 * `Intl` devuelve los meses en minúscula en español y aquí encabeza una sección.
 * `toLocaleUpperCase` con el locale y no `toUpperCase`, igual que en
 * `core/date/date-range.ts`: en turco la `i` mayúscula no es la misma letra.
 */
function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

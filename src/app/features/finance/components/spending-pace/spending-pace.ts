import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Icon } from '../../../../shared/ui/icon/icon';
import { parseIsoMonth } from '../../date-ranges';
import { MONEY_DIGITS } from '../../money';
import {
  DailySeries,
  PaceComparison,
  PaceStats,
  paceComparison,
  paceStats
} from '../../spending-pace';

/**
 * La comparación ya resuelta para la plantilla: importe **absoluto** y hacia
 * dónde va.
 *
 * El valor absoluto se calcula aquí y no en la plantilla porque `CurrencyPipe`
 * escribe el menos de un número negativo, y la frase ya dice la dirección con
 * palabras: saldría "Vas -$180.000 por debajo de agosto".
 */
interface PaceDelta {
  /** Siempre positivo. Cero solo cuando los dos meses empatan. */
  readonly amount: number;
  readonly direction: 'below' | 'over' | 'same';
  readonly previousLabel: string;
}

/** Una fila de la tabla de datos: el acumulado de los dos meses ese día. */
interface PaceRow {
  readonly day: number;
  /** `null` a partir de mañana: el mes en curso todavía no llegó ahí. */
  readonly current: number | null;
  /** `null` si el mes anterior no tenía ese día (febrero y el 30). */
  readonly previous: number | null;
}

/** Una línea de referencia horizontal con su rótulo. */
interface GridLine {
  readonly value: number;
  /** "500 mil", "1,5 M": compacto y en el locale de la app. */
  readonly label: string;
  /** Posición en % **desde arriba** del área de trazado. */
  readonly top: number;
}

/** Una marca del eje de días. */
interface DayTick {
  readonly day: number;
  /** Posición en % del ancho. */
  readonly x: number;
}

/**
 * La escala compartida y las dos curvas colocadas dentro de ella.
 *
 * Todo en un solo `computed`, igual que `FlowChart` en `monthly-flow`: las dos
 * polilíneas, las líneas de referencia y el marcador salen del mismo tope de
 * escala, y repartirlo en varios `computed` obligaría a recalcular ese tope tres
 * veces y a confiar en que las tres copias no divergen.
 */
interface PaceChart {
  /** El valor del borde superior. 0 cuando no hay ningún gasto en los dos meses. */
  readonly top: number;
  readonly gridLines: readonly GridLine[];
  readonly dayTicks: readonly DayTick[];
  /** `x,y x,y …` en el espacio 0–100 del `viewBox`. */
  readonly currentPoints: string;
  readonly previousPoints: string;
  /** Dónde cae hoy: el marcador y la guía vertical. */
  readonly markerX: number;
  readonly markerY: number;
}

/**
 * Cuántos tramos tiene el eje vertical.
 *
 * Tres, o sea cuatro rótulos contando el cero. Con dos, la referencia del medio
 * queda tan lejos de los datos que leer un punto obliga a interpolar a ojo; con
 * cinco, cuatro cifras largas apiladas en un área de 180px compiten con las
 * propias curvas.
 */
const GRID_INTERVALS = 3;

/**
 * Los saltos "redondos" admitidos para el eje vertical, por década.
 *
 * Sin esto el tope sería el máximo de los datos y las referencias caerían en
 * 480.000 o 962.500: números que nadie usa para estimar. Con la escala anclada a
 * múltiplos de 1, 2, 2,5, 5 o 10, leer un punto contra la rejilla vuelve a ser
 * aritmética mental.
 */
const NICE_STEPS = [1, 2, 2.5, 5, 10];

/**
 * Ritmo de gasto: cuánto se lleva gastado del mes y a qué velocidad, contra el
 * mismo tramo del mes anterior.
 *
 * **Por qué está en `features/finance/components/` y no en `shared/ui/`**: misma
 * razón que sus dos hermanos. Recibe `DailySeries`, que es un tipo de la
 * feature, y una primitiva de `shared/ui/` nunca recibe uno.
 *
 * Tonto: dos `input()`, ninguna petición. La ventana, la carga y el error los
 * posee `Overview`. Lo único que inyecta es `LOCALE_ID`, y para formatear.
 *
 * ---
 *
 * **Decisiones de visualización** (la parte que suele salir mal):
 *
 * - **Es un escalón, no una curva.** El acumulado no cambia entre compras: se
 *   queda plano y salta el día que hay gasto. Una línea recta entre dos días
 *   afirmaría un goteo continuo que no ocurrió, y una spline —como la de
 *   `monthly-flow`, donde sí tiene sentido— llegaría a dibujar tramos
 *   descendentes en una serie que por definición nunca baja. El escalón es la
 *   forma que corresponde al dato.
 * - **La curva no se dibuja más allá de hoy.** Prolongarla plana hasta fin de
 *   mes se lee como "dejé de gastar el día 15", que es una afirmación sobre el
 *   futuro. El eje sí llega al día 30, así que el hueco a la derecha del
 *   marcador es exactamente lo que queda de mes.
 * - **Las dos curvas comparten escala.** Es lo único que hace que la
 *   comparación signifique algo: con un eje por serie, cuál va por encima lo
 *   decidiría el rango elegido y no los datos.
 * - **Se distinguen por trazo, no por color.** Continua y en tinta el mes en
 *   curso, discontinua y apagada el anterior. Aquí las dos series son gasto, así
 *   que el mapeo dominio → semántica del design system no aplica —no hay un
 *   "verde bueno" y un "rojo malo" que repartir— y teñirlas de dos colores de
 *   marca inventaría una categoría. El patrón del trazo sobrevive al daltonismo,
 *   a la impresión en gris y al contraste forzado, que es más de lo que puede
 *   decir cualquier par de colores.
 * - **Escala anclada al cero y con tope redondo.** Un acumulado que empezara en
 *   el mínimo de los datos exageraría la separación entre los dos meses, que es
 *   justo lo que esta tarjeta afirma. Ver `NICE_STEPS`.
 * - **El signo de la comparación se invierte respecto al resto de la app.**
 *   Gastar **menos** que el mes pasado va en `--color-success`, y en Finanzas el
 *   gasto es siempre `--color-danger`. No es una inconsistencia: lo que se
 *   colorea aquí no es un gasto, es una diferencia entre dos ritmos, y para esa
 *   magnitud "menos" sí es mejor. Por eso el badge lleva además la palabra
 *   escrita ("por debajo" / "por encima") y una flecha: el color es el tercer
 *   canal, no el único.
 */
@Component({
  selector: 'app-spending-pace',
  imports: [CurrencyPipe, Icon],
  templateUrl: './spending-pace.html',
  styleUrl: './spending-pace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SpendingPace {
  /** El mes en curso, del día 1 a hoy. */
  readonly current = input.required<DailySeries>();
  /** El mes anterior completo, para la curva de referencia. */
  readonly previous = input.required<DailySeries>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly moneyDigits = MONEY_DIGITS;

  /**
   * Formateador compacto del eje vertical, creado una vez por instancia.
   *
   * `Intl` y no un sufijo "K"/"M" escrito a mano: esos son de la convención
   * inglesa y en español el separador decimal ya es otro ("1,5 M"). Es el mismo
   * criterio que hizo inyectar `LOCALE_ID` en vez de escribir `'es-ES'`.
   *
   * Candidato claro a `shared/pipes/currency-short.ts` el día que tenga un
   * segundo consumidor; hoy tiene uno, y `shared/` se puebla al segundo uso.
   */
  private readonly compact = new Intl.NumberFormat(this.locale, {
    notation: 'compact',
    maximumFractionDigits: 1
  });

  /** "Septiembre" / "Agosto": la leyenda y el badge los nombran. */
  protected readonly currentLabel = computed(() => this.monthLabel(this.current().month));
  protected readonly previousLabel = computed(() => this.monthLabel(this.previous().month));

  protected readonly stats = computed<PaceStats>(() => paceStats(this.current()));

  /**
   * El badge de comparación, o `null` cuando no hay contra qué comparar.
   *
   * La dirección se decide sobre la diferencia con signo y se guarda como
   * palabra: la plantilla no vuelve a mirar el signo, así que no hay dos sitios
   * decidiendo lo mismo. El empate exacto es prácticamente imposible con dinero
   * real, pero tiene su rama porque "Vas $0 por debajo" sería una frase absurda
   * escrita por omisión.
   */
  protected readonly delta = computed<PaceDelta | null>(() => {
    const comparison: PaceComparison | null = paceComparison(this.current(), this.previous());
    if (!comparison) {
      return null;
    }

    const { difference } = comparison;

    return {
      amount: Math.abs(difference),
      direction: difference < 0 ? 'below' : difference > 0 ? 'over' : 'same',
      previousLabel: this.previousLabel()
    };
  });

  /**
   * La representación accesible del trazado: el acumulado de los dos meses, día
   * a día.
   *
   * Existe por la misma razón que la tabla de `monthly-flow`: el área de dibujo
   * va entera en `aria-hidden` —anunciar sesenta vértices no es información, es
   * ruido— así que los valores tienen que estar escritos en alguna parte. Va
   * plegada en un `<details>` para no competir con el gráfico de quien sí lo ve.
   *
   * Recorre los días del mes **en curso**, que es el eje: por eso `previous`
   * puede ser `null` (febrero no tiene día 30) y `current` también (mañana
   * todavía no ha pasado). Dos ausencias distintas que la tabla escribe igual,
   * con un guion, porque en ambos casos la respuesta honesta es "no hay dato".
   */
  protected readonly tableRows = computed<readonly PaceRow[]>(() => {
    const current = this.current();
    const previous = this.previous();

    return Array.from({ length: current.daysInMonth }, (_, index) => ({
      day: index + 1,
      current: current.cumulative[index] ?? null,
      previous: previous.cumulative[index] ?? null
    }));
  });

  /**
   * Una de las dos páginas no traía todo su periodo, así que la curva estaría
   * truncada y las cifras por debajo de las reales.
   *
   * Con la agregación en cliente este es el único fallo que no se ve: la tarjeta
   * saldría entera y plausible. Se prefiere no pintar nada y decirlo.
   */
  protected readonly incomplete = computed(
    () => !this.current().complete || !this.previous().complete
  );

  /** Ni un gasto en los dos meses: no hay escala que dibujar. */
  protected readonly isEmpty = computed(() => this.chart().top === 0);

  protected readonly chart = computed<PaceChart>(() => {
    const current = this.current();
    const previous = this.previous();

    // El eje X es el mes EN CURSO. La curva del anterior se recorta a esa
    // longitud: si el mes pasado tuvo 31 días y este 30, el día 31 no tiene
    // dónde caer, y estirar el eje hasta él pondría el día 15 de cada mes en dos
    // sitios distintos — que es la única alineación que esta tarjeta necesita
    // que sea exacta. Si el anterior es más corto, su curva acaba antes del
    // borde derecho, que es lo que significa que febrero no tiene día 30.
    const days = current.daysInMonth;
    const top = niceTop(Math.max(current.total, previous.total));

    if (top === 0) {
      return {
        top: 0,
        gridLines: [],
        dayTicks: [],
        currentPoints: '',
        previousPoints: '',
        markerX: 0,
        markerY: 0
      };
    }

    // `days - 1` en el denominador y no `days`: el día 1 va en el borde
    // izquierdo y el último en el derecho, así que hay una división menos que
    // días. Con `days` la curva nunca llegaría al borde y quedaría un hueco
    // permanente que se lee como mes incompleto.
    const xFor = (day: number) => ((day - 1) / (days - 1)) * 100;
    const yFor = (value: number) => 100 - (value / top) * 100;

    const step = top / GRID_INTERVALS;
    const gridLines = Array.from({ length: GRID_INTERVALS + 1 }, (_, index): GridLine => {
      const value = step * index;
      return { value, label: this.compact.format(value), top: yFor(value) };
    });

    return {
      top,
      gridLines,
      dayTicks: dayTicks(days).map(day => ({ day, x: xFor(day) })),
      currentPoints: stepPoints(current.cumulative, xFor, yFor),
      previousPoints: stepPoints(previous.cumulative.slice(0, days), xFor, yFor),
      markerX: xFor(current.throughDay),
      markerY: yFor(current.total)
    };
  });

  /**
   * "Septiembre" a partir de `yyyy-MM`.
   *
   * `parseIsoMonth` y no `new Date(month)`: este último es medianoche UTC del
   * día 1 y al oeste de Greenwich devuelve el mes anterior. Un gráfico rotulado
   * con el mes equivocado no se lee como un bug, se lee como datos malos.
   */
  private monthLabel(month: string): string {
    const label = parseIsoMonth(month).toLocaleDateString(this.locale, { month: 'long' });
    // `toLocaleUpperCase` con el locale y no `toUpperCase`, igual que en
    // `core/date/date-range.ts`: en turco la `i` mayúscula no es la misma letra.
    return label.charAt(0).toLocaleUpperCase(this.locale) + label.slice(1);
  }
}

/**
 * El tope redondo de la escala: el múltiplo "bonito" más pequeño que cubre el
 * máximo repartido en `GRID_INTERVALS` tramos.
 *
 * Con 1.440.000 y tres tramos: el tramo crudo son 480.000, la década es 100.000,
 * el primer paso admitido que la cubre es 500.000 y el tope sale 1.500.000. Las
 * referencias caen entonces en 0 / 500 mil / 1 M / 1,5 M.
 *
 * `find` no puede fallar: `magnitude` es la potencia de diez justo por debajo de
 * `raw`, así que `raw / magnitude` está siempre en [1, 10) y el último paso (10)
 * lo cubre. El `?? 10` está para el comprobador de tipos, no para el algoritmo.
 */
function niceTop(max: number): number {
  if (max <= 0) {
    return 0;
  }

  const raw = max / GRID_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = (NICE_STEPS.find(candidate => candidate * magnitude >= raw) ?? 10) * magnitude;

  return step * GRID_INTERVALS;
}

/**
 * Los días rotulados bajo el eje: el primero, los múltiplos de cinco y el
 * último.
 *
 * El último se añade siempre aunque caiga al lado del 25 (febrero acaba en 28):
 * es el que cierra el eje, y sin él la anchura del mes tendría que deducirse de
 * dónde se corta la rejilla. Se deduplica por si el mes tiene justo 30 días, que
 * ya es múltiplo de cinco.
 */
function dayTicks(daysInMonth: number): number[] {
  const marks = new Set<number>([1, daysInMonth]);

  for (let day = 5; day < daysInMonth; day += 5) {
    marks.add(day);
  }

  return [...marks].sort((a, b) => a - b);
}

/**
 * El acumulado como escalón, listo para un `<polyline>`.
 *
 * Dos puntos por día: primero el valor que traía (el tramo horizontal que llega
 * hasta ese día) y después el que deja (el salto vertical). Se arranca en cero,
 * así que el día 1 dibuja su propio salto desde la línea base en vez de aparecer
 * flotando a media altura.
 *
 * La geometría se decide entera aquí y no en la plantilla, igual que
 * `smoothLine()` en `monthly-flow`: un `d="M … L …"` escrito en el HTML es medio
 * gráfico en un sitio donde nadie lo revisa.
 */
function stepPoints(
  cumulative: readonly number[],
  xFor: (day: number) => number,
  yFor: (value: number) => number
): string {
  const points: string[] = [];
  let previous = 0;

  cumulative.forEach((value, index) => {
    const x = trim(xFor(index + 1));
    points.push(`${x},${trim(yFor(previous))}`, `${x},${trim(yFor(value))}`);
    previous = value;
  });

  return points.join(' ');
}

/**
 * Dos decimales en el espacio 0–100 del `viewBox`, que a cualquier ancho real
 * está muy por debajo de un píxel. `Math.round` y no `toFixed(2)`, que emitiría
 * los ceros de la derecha en los sesenta puntos de cada curva.
 */
function trim(value: number): number {
  return Math.round(value * 100) / 100;
}

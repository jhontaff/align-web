import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { parseIsoMonth } from '../../date-ranges';
import { MONEY_DIGITS } from '../../money';
import { MonthlyPoint } from '../../models/transaction.model';

/**
 * Una columna ya resuelta: todo lo que la plantilla necesita pintar, sin
 * calcular nada.
 *
 * Mismo patrón que `ExpenseBar` en `expense-by-category`: el modelo de vista
 * sale de un único `computed` y la plantilla solo lee propiedades. Un
 * `height(point)` invocado desde el `@for` serían dieciocho llamadas en cada
 * ciclo de detección de cambios en vez de una lectura memorizada.
 */
interface FlowColumn {
  /** ISO `yyyy-MM`, la clave del `@for`. */
  readonly month: string;
  /** "Sep": lo que se lee bajo la columna. */
  readonly label: string;
  /** "septiembre de 2026": lo que se lee en la tabla y en el emergente. */
  readonly fullLabel: string;
  /** El último mes de la ventana, el que cierra la tendencia. */
  readonly latest: boolean;
  readonly income: number;
  readonly expense: number;
  readonly balance: number;
  /** Alto de cada barra en % del área de trazado. `null` si ese mes no tuvo. */
  readonly incomeHeight: number | null;
  readonly expenseHeight: number | null;
  /** Posición del punto de balance, en % **desde arriba**. */
  readonly balanceTop: number;
  /** Centro de la columna, en % del ancho. */
  readonly x: number;
}

/**
 * La escala compartida y las columnas colocadas dentro de ella.
 *
 * Va todo en un solo `computed` porque las tres piezas —barras, línea base y
 * polilínea— salen del mismo par `min`/`max`: repartirlas en varios `computed`
 * obligaría a recorrer los datos tres veces para calcular la misma escala, y a
 * confiar en que las tres copias no divergen.
 */
interface FlowChart {
  readonly columns: readonly FlowColumn[];
  /** Dónde cae el cero, en % **desde abajo**. */
  readonly zeroBottom: number;
  /**
   * `x,y x,y …` para el `<polyline>`, en el espacio 0–100 del `viewBox`.
   *
   * No son los seis meses: son los seis más los tramos interpolados entre
   * ellos, que es lo que dibuja la curva. Ver `smoothLine()`.
   */
  readonly linePoints: string;
  /** Algún balance fue negativo: la línea base no se apoya en el suelo. */
  readonly hasNegative: boolean;
}

/** Un punto en el espacio 0–100 del `viewBox`. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * En cuántos tramos se parte el trecho entre dos meses para dibujar la curva.
 *
 * Veinticuatro dejan un vértice cada seis o siete píxeles con seis meses en el
 * ancho de la tarjeta, y 121 puntos en el atributo `points`. Es holgado: el
 * suavizado se sostiene también en los tramos de más pendiente —que son los que
 * delatan una poligonal— y en pantallas anchas, donde cada tramo se estira y
 * los vértices se separan.
 *
 * El coste es solo el tamaño de un atributo que se recalcula dentro de un
 * `computed`, o sea únicamente cuando cambian los datos; no hay trabajo por
 * fotograma que crezca con este número.
 */
const SEGMENT_SAMPLES = 24;

/**
 * Cuánto se exageran las tangentes antes de recortarlas. **Es el mando de "cómo
 * de pronunciada" es la curva**, y no `SEGMENT_SAMPLES` — subir el muestreo solo
 * dibuja la misma forma con más resolución.
 *
 * La tangente de partida es la media de las dos pendientes vecinas, que con los
 * meses igualmente espaciados es exactamente la de Catmull-Rom. Multiplicarla
 * hace que la curva salga y entre de cada mes con más ángulo, o sea que se
 * abombe más entre punto y punto.
 *
 * **Dos es una calibración a ojo, no un óptimo**, y conviene que quede dicho:
 * se probó primero el techo y resultó demasiado. El rango útil va de 1 (la
 * curva mínima, la que sale de las tangentes sin tocar) a 3 (el techo: ahí el
 * recorte de Fritsch–Carlson, que acota al círculo de radio 3, muerde en todos
 * los tramos con variación real y subir más no cambia ni una centésima). Dos
 * está justo en medio de ese recorrido.
 *
 * Medido sobre datos reales, como separación máxima respecto a la recta que une
 * dos meses, en unidades del `viewBox` 0–100:
 *
 * | factor | curva normal | mes con un salto grande |
 * | --- | --- | --- |
 * | 1 | 7,9 | 11,1 |
 * | **2** | **13,3** | **18,8** |
 * | 3 (techo) | 20,4 | 28,9 |
 *
 * Y **no puede mentir se ponga como se ponga**: el recorte se aplica después,
 * así que la garantía de que ningún tramo se sale del intervalo de sus dos meses
 * no depende de este valor. Es un mando de estética, no de corrección.
 *
 * El precio, dicho claro: en una serie perfectamente lineal la curva ondula un
 * poco donde la recta sería exacta. Se queda dentro del intervalo de cada tramo,
 * así que no afirma ningún valor que no exista, pero es el mismo peaje de
 * interpolar algo que solo se mide una vez al mes.
 */
const TANGENT_BOOST = 2;

/** El cambio del balance respecto al mes anterior. */
interface FlowDelta {
  readonly amount: number;
  readonly positive: boolean;
  readonly previousLabel: string;
}

/**
 * Flujo mensual: ingresos, gastos y balance neto de los últimos meses.
 *
 * **Por qué está en `features/finance/components/` y no en `shared/ui/`**: la
 * misma razón que `expense-by-category`. Recibe `MonthlyPoint[]`, que es un DTO
 * de dominio, y una primitiva de `shared/ui/` nunca recibe uno — recibe
 * primitivos. En cuanto un componente importa un tipo de la feature, deja de
 * ser primitiva.
 *
 * Tonto: un `input()`, ninguna petición. La ventana, la carga y el error los
 * posee `Overview`. Lo único que inyecta es `LOCALE_ID`, y para formatear, no
 * para decidir nada.
 *
 * ---
 *
 * **Decisiones de visualización** (la parte que suele salir mal):
 *
 * - **Un solo eje para las tres series, no dos escalas.** Es la tentación
 *   evidente —el balance es un número más pequeño que los ingresos, así que en
 *   su propia escala "se vería mejor"— y es el error clásico de este tipo de
 *   gráfico: con dos ejes, dónde se cruzan la línea y las barras lo decide el
 *   rango elegido y no los datos, así que moviéndolo se puede fabricar
 *   cualquier conclusión. Con un eje compartido, que la línea pase por encima
 *   de las barras de gasto significa algo.
 * - **Barras agrupadas, no apiladas.** Apilar el gasto sobre el ingreso daría
 *   una altura total que no significa nada —nadie suma lo que entra con lo que
 *   sale— y haría imposible comparar los gastos entre meses, porque cada
 *   segmento arrancaría a una altura distinta. Agrupadas comparten la línea
 *   base y se comparan tanto entre sí como mes a mes.
 * - **La línea es curva, pero con una interpolación que no puede mentir.** Una
 *   spline cualquiera —Catmull-Rom es la que sale por defecto en casi todas las
 *   librerías— pasa por los puntos pero **se sale del intervalo entre ellos**:
 *   entre un mes de 800 y otro de 5900 dibuja un tramo que sube por encima de
 *   5900 antes de volver, y ese pico no corresponde a ningún dato. Aquí se usa
 *   cúbica **monótona** (Fritsch–Carlson), que garantiza que cada tramo se
 *   queda dentro de los valores de sus dos meses. Se sigue interpolando algo
 *   que solo se midió una vez al mes, pero al menos la curva no afirma máximos
 *   que no existieron. Ver `smoothLine()`.
 * - **El balance va en tinta neutra (`--color-text`), no en un tercer color de
 *   marca.** No es una categoría más: es lo que sale de restar las otras dos.
 *   Un tercer tono compitiendo con el verde y el rojo lo pondría a su mismo
 *   nivel, y además gastaría el hueco categórico que la app no tiene definido
 *   (ver la discrepancia de `Tertiary` en el design system). La forma —una
 *   línea, no una barra— es lo que ya lo distingue.
 * - **Verde y rojo salen del design system, no de aquí**: ingreso a
 *   `--color-success`, gasto a `--color-danger`, el mismo mapeo que las cifras
 *   de arriba y que los badges de Tareas. El par verde/rojo es el peor caso
 *   posible para el daltonismo, así que la identidad **no depende del color**:
 *   dentro de cada mes el ingreso va siempre a la izquierda y el gasto a la
 *   derecha, las dos barras van separadas por un hueco del color de la tarjeta,
 *   y la tabla del final dice las tres cifras con palabras. Medido: en tema
 *   claro la separación bajo deuteranopia es ΔE 12.8 (suficiente); en oscuro
 *   cae a 6.5, que solo es admisible **con** esa codificación secundaria — de
 *   ahí que no sea opcional ni decorativa.
 * - **Escala anclada al cero, no al mínimo de los datos.** Las barras nacen
 *   siempre en el cero: una escala que empiece en el valor más bajo multiplica
 *   visualmente diferencias pequeñas, que es la forma más común de mentir con
 *   un gráfico de barras. Cuando algún balance es negativo el cero se despega
 *   del suelo y esos puntos caen por debajo, que es exactamente lo que
 *   significan.
 * - **Sin rejilla y sin eje vertical rotulado.** Con seis columnas la
 *   comparación es entre barras vecinas, no contra una escala; unas líneas de
 *   referencia con importes en pesos añadirían cinco cifras largas al fondo de
 *   la tarjeta para responder una pregunta que la tabla del final responde
 *   exacta. Lo único que se dibuja es el cero, que sí es una referencia con
 *   significado.
 */
@Component({
  selector: 'app-monthly-flow',
  imports: [CurrencyPipe],
  templateUrl: './monthly-flow.html',
  styleUrl: './monthly-flow.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyFlow {
  /**
   * Los meses de la ventana, en orden ascendente y **sin huecos**: el backend
   * recorre el rango mes a mes y rellena con ceros los que no tuvieron
   * movimientos, así que aquí no hay que inventar los que falten.
   *
   * Se llama `months` y no `data`: el nombre de un `input()` es lo que se lee
   * en la plantilla de quien lo monta.
   */
  readonly months = input.required<readonly MonthlyPoint[]>();

  private readonly locale = inject(LOCALE_ID);

  protected readonly moneyDigits = MONEY_DIGITS;

  /**
   * La escala y las columnas colocadas dentro de ella.
   *
   * `max` mira las tres series y `min` solo el balance, porque ingresos y
   * gastos son magnitudes y nunca bajan de cero. Los dos se fuerzan a incluir
   * el cero (`Math.max(0, …)` / `Math.min(0, …)`) para que la línea base exista
   * siempre, también en una ventana con todos los balances positivos.
   *
   * `span === 0` es la ventana entera en blanco: ninguna división llega a
   * hacerse, y la plantilla pinta el estado vacío en su lugar.
   */
  protected readonly chart = computed<FlowChart>(() => {
    const months = this.months();

    const max = Math.max(0, ...months.map(m => Math.max(m.income, m.expense, m.balance)));
    const min = Math.min(0, ...months.map(m => m.balance));
    const span = max - min;

    if (span === 0) {
      return { columns: [], zeroBottom: 0, linePoints: '', hasNegative: false };
    }

    const columns = months.map((point, index): FlowColumn => {
      const date = parseIsoMonth(point.month);

      return {
        month: point.month,
        label: capitalize(date.toLocaleDateString(this.locale, { month: 'short' }), this.locale),
        fullLabel: date.toLocaleDateString(this.locale, { month: 'long', year: 'numeric' }),
        latest: index === months.length - 1,
        income: point.income,
        expense: point.expense,
        balance: point.balance,
        // `null` y no `0`: la plantilla entonces no pinta la barra en absoluto.
        // Una barra de alto cero heredaría el mínimo de 2px que llevan las
        // demás y dejaría una marca roja bajo un mes sin gastos, que es justo
        // lo contrario de lo que dice el dato.
        incomeHeight: point.income > 0 ? (point.income / span) * 100 : null,
        expenseHeight: point.expense > 0 ? (point.expense / span) * 100 : null,
        balanceTop: ((max - point.balance) / span) * 100,
        x: ((index + 0.5) / months.length) * 100
      };
    });

    return {
      columns,
      zeroBottom: ((0 - min) / span) * 100,
      linePoints: smoothLine(columns.map(column => ({ x: column.x, y: column.balanceTop }))),
      hasNegative: min < 0
    };
  });

  protected readonly isEmpty = computed(() => this.chart().columns.length === 0);

  /**
   * Cuánto cambió el balance respecto al mes anterior.
   *
   * **Es dinero, no un porcentaje**, y es una desviación deliberada del diseño
   * de referencia. Un porcentaje sobre una magnitud que cruza el cero no
   * significa nada: pasar de −100 a +50 no es "un 150 % más", y con el mes
   * anterior en cero la división ni siquiera existe. La diferencia en pesos
   * está siempre definida, va en la misma unidad que el resto de la tarjeta y
   * no hay que explicarla.
   *
   * `null` con menos de dos meses: sin un punto anterior no hay nada respecto a
   * lo que comparar, y un "+0" ahí sería una afirmación inventada.
   */
  protected readonly delta = computed<FlowDelta | null>(() => {
    const columns = this.chart().columns;
    if (columns.length < 2) {
      return null;
    }

    const latest = columns[columns.length - 1];
    const previous = columns[columns.length - 2];
    const amount = latest.balance - previous.balance;

    return { amount, positive: amount >= 0, previousLabel: previous.fullLabel };
  });
}

/**
 * `Intl` devuelve los meses en minúscula en español ("sept", "septiembre de
 * 2026") y aquí encabezan una columna del eje.
 *
 * `toLocaleUpperCase` con el locale y no `toUpperCase`, igual que en
 * `core/date/date-range.ts`: en turco la `i` mayúscula no es la misma letra.
 * Función suelta y no método: no lee estado del componente.
 */
function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * La curva, como lista de puntos para un `<polyline>`.
 *
 * **Se muestrea la curva en más puntos en vez de emitir curvas de Bézier en un
 * `<path>`.** Las dos dan el mismo dibujo, pero con `points` toda la geometría
 * se decide aquí, en TypeScript, y la plantilla sigue siendo un `<polyline>`
 * con un atributo. Con `d="M … C …"` la mitad de la forma la decidirían unos
 * puntos de control escritos en una cadena, que es justo el sitio donde nadie
 * los revisa.
 *
 * Interpola con **Hermite cúbica de tangentes monótonas** (Fritsch–Carlson,
 * 1980), que es lo mismo que hace `curveMonotoneX` de D3. La diferencia con la
 * spline habitual está en la garantía: entre dos meses la curva **no se sale
 * del intervalo de sus valores**. Con Catmull-Rom, un salto como el de agosto a
 * septiembre —de 800 a 5900— dibuja un pico por encima de 5900 antes de
 * estabilizarse, y ese máximo no lo tuvo ningún mes.
 *
 * El truco está entero en las tangentes; una vez elegidas, evaluar la Hermite
 * es aritmética. Ver `monotoneTangents()`.
 */
function smoothLine(points: readonly Point[]): string {
  if (points.length < 2) {
    return points.map(point => `${trim(point.x)},${trim(point.y)}`).join(' ');
  }

  const tangents = monotoneTangents(points);
  const samples: string[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const width = end.x - start.x;

    // El último punto del tramo se omite porque es el primero del siguiente:
    // emitirlo aquí lo duplicaría en cada unión. El del final se añade fuera.
    for (let sample = 0; sample < SEGMENT_SAMPLES; sample++) {
      const t = sample / SEGMENT_SAMPLES;
      const t2 = t * t;
      const t3 = t2 * t;

      // Base de Hermite. Los dos términos de tangente van multiplicados por el
      // ancho del tramo porque las tangentes están en unidades de y por unidad
      // de x, y `t` es adimensional.
      const y =
        (2 * t3 - 3 * t2 + 1) * start.y +
        (t3 - 2 * t2 + t) * width * tangents[i] +
        (-2 * t3 + 3 * t2) * end.y +
        (t3 - t2) * width * tangents[i + 1];

      samples.push(`${trim(start.x + t * width)},${trim(y)}`);
    }
  }

  const last = points[points.length - 1];
  samples.push(`${trim(last.x)},${trim(last.y)}`);

  return samples.join(' ');
}

/**
 * Las tangentes en cada punto, corregidas para que la curva sea monótona en
 * cada tramo — o sea, para que no invente picos ni valles entre dos meses.
 *
 * Tres pasos, y el orden importa:
 *
 * 1. **Tangente inicial**: la media de las dos pendientes vecinas (y la
 *    pendiente única en los extremos), multiplicada por `TANGENT_BOOST`. Sin el
 *    factor esto es exactamente Catmull-Rom, o sea la curva suave de siempre —
 *    la que sí se pasa. Con él sale más pronunciada, y el paso 3 se encarga de
 *    que siga sin pasarse.
 * 2. **Tramo plano**: si dos meses valen lo mismo, las tangentes de sus dos
 *    extremos se ponen a cero. Sin esto, la curva se abomba entre dos valores
 *    idénticos y dibuja un cambio donde no lo hubo.
 * 3. **Recorte de Fritsch–Carlson**: se mide cada tangente contra la pendiente
 *    del tramo (`alpha`, `beta`). Un signo contrario significa que la curva
 *    empezaría yendo al revés que los datos, y se anula. Y el círculo de radio
 *    3 (`alpha² + beta² <= 9`) es la condición que demostraron suficiente para
 *    que no haya sobrepasamiento; si se sale, se reescalan las dos tangentes
 *    hasta el borde en vez de recortarlas por separado, que deformaría el
 *    tramo.
 *
 * Las tangentes se comparten entre tramos vecinos, así que el bucle escribe
 * sobre `tangents[i]` y `tangents[i + 1]`: al ajustar un tramo se ajusta también
 * el arranque del siguiente, que es exactamente lo que mantiene la curva
 * continua.
 */
function monotoneTangents(points: readonly Point[]): number[] {
  const count = points.length;

  // Pendiente de cada tramo. Hay una menos que puntos.
  const slopes = points
    .slice(0, -1)
    .map((point, i) => (points[i + 1].y - point.y) / (points[i + 1].x - point.x));

  const tangents = points.map((_, i) => {
    if (i === 0) {
      return slopes[0] * TANGENT_BOOST;
    }
    if (i === count - 1) {
      return slopes[count - 2] * TANGENT_BOOST;
    }
    return ((slopes[i - 1] + slopes[i]) / 2) * TANGENT_BOOST;
  });

  for (let i = 0; i < count - 1; i++) {
    const slope = slopes[i];

    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }

    let alpha = tangents[i] / slope;
    let beta = tangents[i + 1] / slope;

    if (alpha < 0) {
      tangents[i] = 0;
      alpha = 0;
    }
    if (beta < 0) {
      tangents[i + 1] = 0;
      beta = 0;
    }

    const radius = alpha * alpha + beta * beta;
    if (radius > 9) {
      const scale = 3 / Math.sqrt(radius);
      tangents[i] = scale * alpha * slope;
      tangents[i + 1] = scale * beta * slope;
    }
  }

  return tangents;
}

/**
 * Dos decimales en el espacio 0–100 del `viewBox`, que a cualquier ancho real
 * es muy por debajo de un píxel.
 *
 * `Math.round` y no `toFixed(2)`: este devuelve siempre los dos decimales
 * ("8.00"), y con sesenta y un puntos por gráfico eso son ceros de más en un
 * atributo que ya es largo.
 */
function trim(value: number): number {
  return Math.round(value * 100) / 100;
}

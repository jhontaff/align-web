import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { CategoryExpense, ExpenseCategory } from '../../models/transaction.model';
import { MONEY_DIGITS } from '../../money';
import { CATEGORY_LABELS } from '../../transaction-labels';

/**
 * Una barra ya resuelta: todo lo que la plantilla necesita, sin calcular nada.
 *
 * No es el DTO que entra —ese es `CategoryExpense`— sino el modelo de vista que
 * sale del unico `computed` de esta clase. Ver `bars` abajo para por que existe.
 */
interface ExpenseBar {
  readonly category: ExpenseCategory;
  readonly label: string;
  readonly total: number;
  /** Porcentaje del maximo: el ancho de la barra, no su peso en el gasto. */
  readonly width: number;
  /** El peso en el gasto del periodo, ya formateado ("39%", "<1%"). */
  readonly share: string;
}

/**
 * Grafico de barras: en que categorias se fue el gasto del periodo.
 *
 * **Por que esta en `features/finance/components/` y no en `shared/ui/`**: la
 * regla del arbol canonico dice que una primitiva de `shared/ui/` nunca recibe
 * un DTO de dominio, y esta recibe `CategoryExpense[]` y sabe traducir un
 * `ExpenseCategory` a su etiqueta en espanol. En cuanto un componente necesita
 * importar un tipo de la feature, deja de ser primitiva. Es tambien el primer
 * inquilino de `finance/components/`, que se crea ahora y no antes porque
 * `overview` ya pasaba de 200 lineas y meterle el grafico dentro es justo el
 * "partir una pantalla que ya duele".
 *
 * Tonto de verdad: un solo `input()`, ninguna inyeccion, ninguna peticion. Su
 * rango, su carga y su error los posee `Overview`.
 *
 * ---
 *
 * **Decisiones de visualizacion** (la parte que suele salir mal):
 *
 * - **Un solo color para las nueve barras, no una paleta categorica.** El
 *   trabajo del grafico es comparar magnitudes, y la magnitud ya la lleva la
 *   longitud de la barra: nueve tonos gastarian el unico canal libre en repetir
 *   lo que la barra ya dice. Ademas, nueve colores categoricos no existen —
 *   pasado el octavo, dos cualquiera son indistinguibles bajo daltonismo. La
 *   identidad de cada barra la lleva su etiqueta, que esta escrita al lado.
 * - **El color es `--color-danger`**, el mismo que la cifra de "Gastos" de
 *   arriba, porque este grafico es exactamente el desglose de ese numero; con
 *   otro color habria que deducir la relacion. Es el mapeo dominio a semantica
 *   que el design system ya fija (gasto a `danger`). Se compensa con barras
 *   finas: un bloque rojo de 24px se lee como una alarma, una barra de 10px no.
 * - **Escala relativa al maximo**, no al total. Con escala al total, un mes en
 *   que la vivienda se lleva el 60% deja las otras ocho barras en astillas
 *   incomparables entre si; con escala al maximo se usa todo el ancho y las
 *   diferencias pequenas se ven. Lo que se pierde —la composicion— vuelve como
 *   el porcentaje escrito al lado del importe.
 * - **Se ocultan las categorias en cero.** Una barra de longitud nula no
 *   informa de nada y son cinco de las nueve en un mes normal.
 */
@Component({
  selector: 'app-expense-by-category',
  imports: [CurrencyPipe],
  templateUrl: './expense-by-category.html',
  styleUrl: './expense-by-category.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseByCategory {
  /**
   * Las nueve categorias con su total, en cualquier orden y con ceros
   * incluidos: quien llama entrega lo que devolvio el servicio sin filtrar ni
   * ordenar, y este componente decide como se presenta.
   *
   * Se llama `expenses` y no `data`: el nombre de un `input()` es lo que se lee
   * en la plantilla de quien lo monta, y `[data]` no dice nada sobre lo que
   * entra.
   */
  readonly expenses = input.required<readonly CategoryExpense[]>();

  protected readonly moneyDigits = MONEY_DIGITS;

  /**
   * Las barras listas para pintar: un solo `computed` que hace todo el trabajo.
   *
   * **La plantilla no llama a ningun metodo.** La primera version tenia
   * `width(row)` y `share(row)` invocados desde el `@for`, y eso son 18
   * llamadas en cada ciclo de deteccion de cambios en vez de una lectura de
   * propiedad — barato aqui, pero es el patron que hace impredecible el coste
   * de una plantilla y el que las guias de Angular desaconsejan de plano. Con
   * el modelo de vista, el calculo se memoriza en el `computed` y solo se
   * rehace cuando cambia el `input()`.
   *
   * Derivarlo todo aqui tambien quita el otro riesgo de aquella version: `max`
   * y `total` eran `computed` separados que volvian a recorrer la lista, y los
   * tres tenian que estar de acuerdo sobre que filas entraban.
   *
   * **`filter` antes que `sort` no es casualidad**: `filter` devuelve un array
   * nuevo, asi que `sort` ordena la copia. Encadenado al reves —o llamando a
   * `sort()` sobre `this.expenses()` directamente— estaria reordenando en el
   * sitio el array del padre, que es el que `Overview` guarda en su signal:
   * mutar la entrada de un `input()` es escribir en el estado de otro
   * componente sin que se entere.
   *
   * De mayor a menor y no en el orden del dominio porque la pregunta que se le
   * hace a este grafico es "en que se me va el dinero", y la respuesta tiene
   * que ser la primera fila.
   */
  protected readonly bars = computed<ExpenseBar[]>(() => {
    const spent = this.expenses()
      .filter(expense => expense.total > 0)
      .sort((a, b) => b.total - a.total);

    // Ambos son > 0 siempre que haya una fila, porque el filtro de arriba ya
    // descarto los ceros. Con la lista vacia no se llega al `map`.
    const max = spent[0]?.total ?? 0;
    const total = spent.reduce((sum, expense) => sum + expense.total, 0);

    return spent.map(expense => ({
      category: expense.category,
      label: CATEGORY_LABELS[expense.category],
      total: expense.total,
      width: (expense.total / max) * 100,
      share: formatShare(expense.total, total)
    }));
  });

  protected readonly isEmpty = computed(() => this.bars().length === 0);
}

/**
 * El peso de una categoria sobre el gasto del periodo.
 *
 * **`<1%` en vez de `0%`** para lo que no llega a medio punto. Redondear a cero
 * un gasto que existe y que esta escrito con su importe al lado dice que no
 * cuenta, que es distinto de que cuente poco; y como esas filas son
 * precisamente las que llevan la barra en su minimo de 2px, el "0%" era la
 * segunda senal seguida de que ahi no hay nada.
 *
 * Los porcentajes redondeados no suman 100 exactamente, y por eso la pantalla
 * no afirma en ningun sitio que lo hagan: cada uno se lee como "cuanto pesa
 * esta", no como un reparto que haya que cuadrar.
 *
 * Funcion suelta y no metodo: no lee estado del componente, asi que no tiene
 * por que estar en su superficie.
 */
function formatShare(amount: number, total: number): string {
  const percent = (amount / total) * 100;
  return percent < 0.5 ? '<1%' : `${Math.round(percent)}%`;
}

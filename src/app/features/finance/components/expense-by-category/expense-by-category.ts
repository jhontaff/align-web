import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { CategoryAmount, ExpenseCategory } from '../../models/transaction.model';
import { MONEY_DIGITS } from '../../money';
import { CATEGORY_LABELS } from '../../transaction-labels';

/**
 * Una barra ya resuelta: todo lo que la plantilla necesita, sin calcular nada.
 *
 * No es el DTO que entra —ese es `CategoryAmount`— sino el modelo de vista que
 * sale del unico `computed` de esta clase. Ver `bars` abajo para por que existe.
 */
interface ExpenseBar {
  readonly category: ExpenseCategory;
  readonly label: string;
  readonly amount: number;
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
 * un DTO de dominio, y esta recibe `CategoryAmount[]` y sabe traducir un
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
 * - **Las categorias en cero no se pintan porque no llegan.** Una barra de
 *   longitud nula no informa de nada, y son cinco de las nueve en un mes
 *   normal; el endpoint agregado ya las omite, asi que aqui no hay filtro.
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
   * Las categorias con gasto en el periodo, tal y como las devuelve
   * `GET /api/transactions/summary/by-category`: ya ordenadas de mayor a menor
   * y sin las que no tuvieron movimientos.
   *
   * **Este componente ya no ordena ni filtra, y esa es la diferencia con la
   * version anterior** (2026-09-04). Antes recibia las nueve categorias con sus
   * ceros —el cliente pedia un total por cada una— y tenia que quitar los ceros
   * y ordenar de mayor a menor por su cuenta. Reordenar aqui lo que el servidor
   * ya ordeno son dos autoridades para la misma decision; se confia en el DTO,
   * que es lo que el tipo declara.
   *
   * Se llama `expenses` y no `data`: el nombre de un `input()` es lo que se lee
   * en la plantilla de quien lo monta, y `[data]` no dice nada sobre lo que
   * entra.
   */
  readonly expenses = input.required<readonly CategoryAmount<ExpenseCategory>[]>();

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
   * Lo unico que queda por calcular es el ancho, porque es lo unico que el
   * servidor no puede saber: depende de la escala elegida aqui (al maximo, no
   * al total — ver arriba). El peso de cada categoria viene en `percentage` y
   * se usa el del servidor; recalcularlo con la suma de esta lista daria el
   * mismo numero por otro camino, y dos caminos para la misma cifra es como se
   * acaba con dos cifras.
   *
   * **`max` sale de la primera fila porque la respuesta viene ordenada.** Si
   * algun dia dejara de venirlo, esto no falla: se rompe visualmente —alguna
   * barra pasaria del 100 %—, que es lo que hace que se note.
   *
   * No se copia ni se reordena el array del `input()`: `sort()` ordena en el
   * sitio, y el array que llega es el que `Overview` guarda en su signal.
   * Mutarlo seria escribir en el estado de otro componente sin que se entere.
   */
  protected readonly bars = computed<ExpenseBar[]>(() => {
    const spent = this.expenses();
    const max = spent[0]?.amount ?? 0;

    return spent.map(expense => ({
      category: expense.category,
      label: CATEGORY_LABELS[expense.category],
      amount: expense.amount,
      width: (expense.amount / max) * 100,
      share: formatShare(expense.percentage)
    }));
  });

  protected readonly isEmpty = computed(() => this.bars().length === 0);
}

/**
 * El peso que manda el servidor, escrito para leerse.
 *
 * **`<1%` en vez de `0%`** para lo que no llega a medio punto. El backend
 * redondea a cero decimales con `HALF_UP`, asi que una categoria con gasto real
 * pero minimo llega con `percentage: 0`; escribir "0%" al lado de un importe que
 * existe dice que no cuenta, que es distinto de que cuente poco. Y como esas
 * filas son precisamente las que llevan la barra en su minimo de 2px, el "0%"
 * era la segunda senal seguida de que ahi no hay nada.
 *
 * Solo puede darse con importe mayor que cero, porque el endpoint no devuelve
 * categorias sin movimientos.
 *
 * Los porcentajes redondeados no suman 100 exactamente, y por eso la pantalla
 * no afirma en ningun sitio que lo hagan: cada uno se lee como "cuanto pesa
 * esta", no como un reparto que haya que cuadrar.
 *
 * Funcion suelta y no metodo: no lee estado del componente, asi que no tiene
 * por que estar en su superficie.
 */
function formatShare(percentage: number): string {
  return percentage === 0 ? '<1%' : `${percentage}%`;
}

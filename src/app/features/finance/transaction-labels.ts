import {
  ExpenseCategory,
  IncomeCategory,
  TransactionCategory,
  TransactionType
} from './models/transaction.model';

/**
 * Etiquetas en español y agrupación por tipo de las categorías.
 *
 * Vive fuera de `models/` a propósito: ese archivo es contrato de tipos puro,
 * como `task.model.ts`. Esto son datos de presentación, y los consumen tres
 * pantallas (resumen, movimientos y formulario), así que tampoco puede vivir
 * dentro de ninguna de ellas — en Tareas los mapas de etiquetas están dentro
 * de `TaskList` justamente porque solo los usa `TaskList`.
 *
 * Módulo utilitario plano: sin DI, sin clase, kebab-case y sin sufijo, igual
 * que `token-storage.ts` o `speech-recognition.ts`.
 */

/**
 * El orden es el de la pantalla, no el del backend: primero lo que más se
 * registra. `OTHER_*` cierra cada grupo porque es el cajón de sastre y ponerlo
 * arriba invita a usarlo sin mirar el resto.
 */
export const EXPENSE_CATEGORIES = [
  'FOOD',
  'TRANSPORT',
  'HOUSING',
  'UTILITIES',
  'HEALTH',
  'SHOPPING',
  'ENTERTAINMENT',
  'EDUCATION',
  'OTHER_EXPENSE'
] as const satisfies readonly ExpenseCategory[];

export const INCOME_CATEGORIES = [
  'SALARY',
  'FREELANCE',
  'INVESTMENT',
  'GIFT',
  'OTHER_INCOME'
] as const satisfies readonly IncomeCategory[];

/**
 * Los dos arrays cubren su unión entera, comprobado por el compilador.
 *
 * **No salía gratis con `readonly ExpenseCategory[]`**, que es como estaban
 * declarados: ese tipo dice que todo elemento *pertenece* a la unión, no que la
 * unión esté *cubierta*. Olvidar una categoría compilaba sin una queja.
 *
 * Dejó de ser un detalle en cuanto el gráfico de gastos por categoría empezó a
 * recorrer `EXPENSE_CATEGORIES` para pedir un total por cada una: una categoría
 * ausente del array no pinta barra y, peor, sus gastos desaparecen de la suma —
 * las barras dejan de sumar el total de "Gastos" que está tres centímetros más
 * arriba en la misma pantalla, y nada falla de forma visible.
 *
 * `as const satisfies` es lo que lo hace posible: `satisfies` valida que cada
 * elemento sea de la unión (lo que daba la anotación de tipo) sin ensanchar el
 * tipo inferido, así que `[number]` sigue siendo la unión de literales escritos
 * y `Exclude` puede restarla de la unión completa. Si el resto no es `never`,
 * no se cumple la restricción de `AssertEmpty` y el compilador nombra la
 * categoría que falta: "Type 'UTILITIES' does not satisfy the constraint
 * 'never'".
 *
 * **La comprobación va en la restricción de un tipo, no en una asignación.**
 * El primer intento fue `const _x: [Missing] = [undefined as never]`, y no
 * comprobaba nada: `never` es asignable a cualquier tipo, así que la
 * asignación pasaba también con una categoría ausente. Se descubrió borrando
 * `UTILITIES` del array a propósito y viendo que `tsc` seguía limpio — que es
 * la única forma de saber que una aserción de este tipo funciona.
 */
type AssertEmpty<T extends never> = T;

type _ExpenseCategoriesAreExhaustive = AssertEmpty<
  Exclude<ExpenseCategory, (typeof EXPENSE_CATEGORIES)[number]>
>;
type _IncomeCategoriesAreExhaustive = AssertEmpty<
  Exclude<IncomeCategory, (typeof INCOME_CATEGORIES)[number]>
>;

/**
 * `Record` completo y no un objeto suelto: así, añadir una variante a la unión
 * sin darle etiqueta rompe la compilación en vez de pintar una celda vacía.
 * Es la misma idea que el `@default never;` de los `@switch`.
 */
export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  FOOD: 'Alimentación',
  TRANSPORT: 'Transporte',
  HOUSING: 'Vivienda',
  UTILITIES: 'Suministros',
  HEALTH: 'Salud',
  SHOPPING: 'Compras',
  ENTERTAINMENT: 'Ocio',
  EDUCATION: 'Educación',
  OTHER_EXPENSE: 'Otros gastos',
  SALARY: 'Nómina',
  FREELANCE: 'Autónomo',
  INVESTMENT: 'Inversión',
  GIFT: 'Regalo',
  OTHER_INCOME: 'Otros ingresos'
};

export const TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto'
};

/**
 * A qué tipo pertenece una categoría.
 *
 * Solo hace falta **antes** de que el servidor conteste: `TransactionResponse`
 * ya trae su `type` calculado, y recalcularlo sobre una respuesta sería
 * duplicar la autoridad del backend. Los dos usos legítimos son el formulario
 * de alta (avisar de si se está registrando un gasto o un ingreso mientras se
 * rellena) y el filtro por tipo.
 *
 * Se deriva del array en vez de mantener un segundo `Record` categoría → tipo:
 * con dos estructuras habría que acordarse de tocar las dos.
 */
export function categoryType(category: TransactionCategory): TransactionType {
  return (INCOME_CATEGORIES as readonly string[]).includes(category) ? 'INCOME' : 'EXPENSE';
}

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
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'FOOD',
  'TRANSPORT',
  'HOUSING',
  'UTILITIES',
  'HEALTH',
  'SHOPPING',
  'ENTERTAINMENT',
  'EDUCATION',
  'OTHER_EXPENSE'
];

export const INCOME_CATEGORIES: readonly IncomeCategory[] = [
  'SALARY',
  'FREELANCE',
  'INVESTMENT',
  'GIFT',
  'OTHER_INCOME'
];

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

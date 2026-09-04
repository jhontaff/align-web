/**
 * Contratos de Finanzas, verificados contra la spec viva del backend
 * (`/v3/api-docs`) el 2026-08-28, no contra el resumen de CLAUDE.md — que en
 * dos puntos estaba desactualizado (ver `TransactionUpdateRequest`).
 */

export type TransactionType = 'INCOME' | 'EXPENSE';

/**
 * Las categorías van partidas en dos uniones y no en una sola lista plana.
 *
 * El backend deriva el `type` de la categoría y `TransactionRequest` no tiene
 * campo `type`, así que el frontend necesita saber a qué grupo pertenece cada
 * una para dos cosas: agrupar el `<select>` del formulario en `<optgroup>` y
 * pintar el signo antes de que el servidor conteste.
 *
 * Partiendo la unión, esa pertenencia la conoce el compilador: los arrays de
 * `transaction-labels.ts` se declaran `as const satisfies readonly
 * ExpenseCategory[]` y una aserción de exhaustividad al lado convierte el
 * olvido de una categoría en un error de compilación. Con una unión plana y un
 * `Record` de categoría a tipo, el mismo olvido pasa desapercibido hasta
 * producción.
 */
export type ExpenseCategory =
  | 'FOOD'
  | 'TRANSPORT'
  | 'HOUSING'
  | 'HEALTH'
  | 'ENTERTAINMENT'
  | 'EDUCATION'
  | 'SHOPPING'
  | 'UTILITIES'
  | 'OTHER_EXPENSE';

export type IncomeCategory =
  | 'SALARY'
  | 'FREELANCE'
  | 'INVESTMENT'
  | 'GIFT'
  | 'OTHER_INCOME';

export type TransactionCategory = ExpenseCategory | IncomeCategory;

/**
 * Alta. `date` es opcional: el backend pone hoy si no llega.
 *
 * No hay campo `type` y no es un olvido — lo deriva el servidor a partir de
 * `category`. No añadir un selector de tipo al formulario.
 */
export interface TransactionRequest {
  amount: number;
  category: TransactionCategory;
  /** `maxLength: 255` en el backend. */
  description?: string;
  /** ISO `yyyy-MM-dd`. */
  date?: string;
}

/**
 * Edición. **No es el mismo DTO que el alta**, aunque CLAUDE.md lo diera por
 * idéntico: aquí `date` es obligatorio. La spec lo declara en su `required`, y
 * mandarlo sin fecha responde 400.
 *
 * Reemplazo completo, no parche: se envían todos los campos.
 */
export interface TransactionUpdateRequest {
  amount: number;
  category: TransactionCategory;
  description?: string;
  /** ISO `yyyy-MM-dd`. Obligatorio, a diferencia del alta. */
  date: string;
}

export interface TransactionResponse {
  /**
   * UUID, no número — igual que `TaskResponse.id`, y por el mismo motivo hay
   * que resistirse a convertirlo: leer el segmento de la URL con
   * `numberAttribute` produce `NaN` en silencio y la petición sale contra
   * `/api/transactions/NaN`. Ya pasó una vez en Tareas.
   */
  id: string;
  type: TransactionType;
  amount: number;
  category: TransactionCategory;
  description: string | null;
  /** ISO `yyyy-MM-dd`. */
  date: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Filtros de `GET /api/transactions` y `GET /api/transactions/summary`.
 *
 * La spec marca el objeto `filter` como `required`, pero es un artefacto de
 * springdoc al bindear un objeto a query params: los cuatro campos son
 * opcionales y omitirlos devuelve todo. Lo que no hay que hacer es mandarlos
 * vacíos (`category=`), de ahí el filtrado en `TransactionService.toParams`.
 */
export interface TransactionFilter {
  type?: TransactionType;
  category?: TransactionCategory;
  /** ISO `yyyy-MM-dd`, inclusivo. */
  from?: string;
  /** ISO `yyyy-MM-dd`, inclusivo. */
  to?: string;
}

export interface FinancialSummaryResponse {
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

/**
 * El gasto acumulado de **una** categoría en un rango.
 *
 * **No es un contrato del backend, y por eso lleva esta advertencia en un
 * archivo que solo tiene contratos verificados.** No existe ningún endpoint
 * agregado por categoría: `GET /api/transactions/summary` devuelve tres
 * escalares (`totalIncome`, `totalExpense`, `balance`) y acepta `category` como
 * filtro, así que el desglose se compone en el cliente pidiendo el resumen una
 * vez por categoría — ver `TransactionService.expenseByCategory()`.
 *
 * Vive aquí y no junto al componente que lo pinta porque es la forma en que
 * viajan los datos entre el servicio y la pantalla, igual que los demás DTO. Y
 * está deliberadamente modelado como lo devolvería el endpoint que falta
 * (`GET /api/transactions/summary/by-category`): el día que exista, cambia el
 * cuerpo de un método y ni este tipo ni ningún componente se enteran.
 */
export interface CategoryExpense {
  category: ExpenseCategory;
  /** Magnitud positiva, como `amount`: el signo lo pone la presentación. */
  total: number;
}

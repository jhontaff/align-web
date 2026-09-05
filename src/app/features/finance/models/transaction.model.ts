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
 * Una categoría con lo acumulado en ella dentro del rango consultado.
 *
 * **Ahora sí es un contrato del backend**: hasta el 2026-09-04 este archivo
 * declaraba un `CategoryExpense` con una advertencia de que no lo era, porque
 * el desglose se componía en el cliente pidiendo `GET /api/transactions/summary`
 * una vez por categoría. Ese endpoint existe (`GET /api/transactions/summary/by-category`)
 * y devuelve `CategoryAmount` tal cual — verificado contra el controlador, no
 * contra CLAUDE.md.
 *
 * El parámetro de tipo no es adorno: el mismo `record` de Java sirve a las dos
 * listas de la respuesta, pero cada una solo puede traer categorías de su tipo.
 * Declararlo así es lo que permite que el gráfico de gastos reciba
 * `ExpenseCategory` y pueda indexar `CATEGORY_LABELS` sin comprobaciones, y lo
 * que impediría montar la lista de ingresos donde va la de gastos.
 */
export interface CategoryAmount<C extends TransactionCategory = TransactionCategory> {
  category: C;
  /** Magnitud positiva, como `amount`: el signo lo pone la presentación. */
  amount: number;
  /**
   * Cuánto pesa esta categoría sobre el total de **su** lista, en el rango.
   *
   * Entero de 0 a 100: el servidor redondea a cero decimales con `HALF_UP`, así
   * que un gasto que no llegue al 0,5 % llega como `0` teniendo un importe
   * mayor que cero. Quien lo pinte tiene que distinguir ese caso (ver
   * `ExpenseByCategory`), o escribirá "0%" al lado de una cifra que existe.
   *
   * Se usa el del servidor en vez de recalcularlo: es el mismo denominador que
   * tendría el cliente, y dos fuentes para el mismo porcentaje son dos
   * oportunidades de que no coincidan.
   */
  percentage: number;
}

/**
 * Respuesta de `GET /api/transactions/summary/by-category`.
 *
 * Dos detalles del servidor que la presentación da por hechos y por eso quedan
 * escritos aquí:
 *
 * - **Solo aparecen las categorías con movimientos.** El backend agrupa las
 *   transacciones del rango, no recorre el enum, así que un mes normal trae
 *   cuatro o cinco entradas de gasto y ninguna en cero.
 * - **Vienen ordenadas de mayor a menor importe.**
 *
 * `incomes` todavía no lo pinta nadie: entra porque es lo que el endpoint
 * devuelve, y recortarlo del tipo sería mentir sobre el cuerpo de la respuesta.
 */
export interface CategoryBreakdownResponse {
  expenses: CategoryAmount<ExpenseCategory>[];
  incomes: CategoryAmount<IncomeCategory>[];
}

/**
 * Un mes del histórico con sus tres cifras, tal y como las devuelve
 * `GET /api/transactions/summary/monthly`.
 *
 * **`month` es `yyyy-MM`, no `yyyy-MM-dd`.** El backend lo declara como
 * `YearMonth` y Jackson lo serializa en ISO (`"2026-09"`) porque Spring Boot
 * desactiva `WRITE_DATES_AS_TIMESTAMPS` por defecto — verificado contra el
 * `pom.xml` y `application.properties`, que no lo sobreescriben. Es la razón de
 * que `parseIsoDate` de `core/date/` **no sirva** aquí: `new Date('2026-09')`
 * es válido y devuelve medianoche UTC del día 1, con el desfase de zona horaria
 * de siempre. Se parte en año y mes a mano (ver `parseIsoMonth`).
 *
 * `income` y `expense` son magnitudes positivas, igual que `amount`; `balance`
 * es `income - expense` y **sí puede ser negativo**. Esa es la única de las tres
 * que cruza el cero, y es lo que obliga a que el gráfico tenga una línea base
 * colocada por los datos en vez de apoyada en el suelo.
 *
 * El servidor rellena los meses sin movimientos con ceros —recorre el rango mes
 * a mes en vez de agrupar solo lo que existe—, así que la lista nunca tiene
 * huecos y el gráfico no necesita inventarlos.
 */
export interface MonthlyPoint {
  /** ISO `yyyy-MM`. */
  month: string;
  income: number;
  expense: number;
  /** `income - expense`. Puede ser negativo. */
  balance: number;
}

/** Respuesta de `GET /api/transactions/summary/monthly`. */
export interface MonthlySummaryResponse {
  months: MonthlyPoint[];
}

/**
 * Filtros de `GET /api/transactions/summary/monthly`.
 *
 * **`from` y `to` son meses (`yyyy-MM`), no fechas**, y por eso este filtro no
 * es un `DateRange`: pasarle uno mandaría `2026-09-01` a un `YearMonth` y el
 * binder de Spring responde 400. El tipo distinto es lo que impide escribir ese
 * error.
 *
 * Los cuatro campos son opcionales, pero conviene mandar siempre `from` y `to`:
 * sin ellos el servidor elige una ventana propia (hasta 12 meses, recortada al
 * primer movimiento del usuario y con un suelo de 3), así que el número de
 * barras cambiaría solo de un día para otro. Tres límites suyos que la pantalla
 * da por hechos:
 *
 * - `from` posterior a `to` responde 400, no una lista vacía.
 * - Más de 36 meses de separación responde 400.
 * - Meses futuros son legales y vuelven en cero — de ahí que la ventana se
 *   recorte al mes en curso en `monthWindow()`.
 */
export interface MonthlySummaryFilter {
  /** ISO `yyyy-MM`, inclusivo. */
  from?: string;
  /** ISO `yyyy-MM`, inclusivo. */
  to?: string;
  type?: TransactionType;
  category?: TransactionCategory;
}

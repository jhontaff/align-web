/**
 * Cómo se escriben los importes en Finanzas.
 *
 * Sube a constante compartida en su **tercer** consumidor, que es donde
 * `overview.ts` dejó anotado que subiría ("sube cuando `activity/` sea el
 * segundo"): `finance/overview`, la tarjeta de Inicio y ahora el gráfico de
 * gastos por categoría. Con tres copias del mismo `'1.0-0'` y del mismo párrafo
 * de justificación, cambiar de criterio significaba acordarse de tres sitios.
 *
 * Módulo utilitario plano, sin DI, igual que `transaction-labels.ts`.
 */

/**
 * `digitsInfo` de `CurrencyPipe`: sin decimales.
 *
 * El peso colombiano no usa céntimos en la práctica —nadie escribe
 * "$ 3.500.000,00"— y arrastrarlos cuesta tres glifos por cifra, que es justo
 * lo que hacía que los importes no cupieran en las tarjetas.
 *
 * **No incluye el código de moneda**: quien lo usa pasa `undefined` como
 * segundo argumento del pipe para no pisar `DEFAULT_CURRENCY_CODE`. El formato
 * de dígitos y la divisa son decisiones distintas, y la divisa ya se declara
 * una vez en `app.config.ts`.
 */
export const MONEY_DIGITS = '1.0-0';

/**
 * Un control vacio vale `''`, y `''` no es un valor valido para los campos que
 * el contrato declara opcionales: una `LocalDate` o una `LocalTime` no se
 * parsean desde cadena vacia — el backend responde 400. `undefined` desaparece
 * del JSON, que es lo que "no hay valor" significa para el backend.
 *
 * El corolario es lo que la hace util al EDITAR: `PUT` es un reemplazo, no un
 * parche, asi que vaciar el campo en el formulario y omitirlo en el cuerpo es
 * exactamente como se borra un valor ya guardado.
 *
 * ---
 *
 * **Vive en `core/http/` porque la usan tres features** (`tasks`, `finance`,
 * `habits`), y las features no se importan entre si. Nacio duplicada en
 * `task-form.ts` y `transaction-form.ts`; la tercera copia es la que la subio
 * aqui, siguiendo la regla del segundo uso. Acompana a
 * `extract-error-message.ts` y `to-http-params.ts`: modulos planos, sin DI, que
 * viven en la frontera con el backend.
 */
export function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

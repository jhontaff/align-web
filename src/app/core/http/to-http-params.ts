import { HttpParams } from '@angular/common/http';

/**
 * Convierte objetos de filtro y paginación a query params.
 *
 * Era un método privado de `TransactionService`. Sube a `core/http/` por su
 * segundo consumidor —`TaskService`, que ahora acepta `status` y paginación
 * para el resumen de Inicio— y no por Finanzas: son dos features distintas y
 * la pieza compartida sube en vez de importarse de lado. Función pura sin DI,
 * igual que su vecina `extract-error-message.ts`.
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 * 1. **`HttpParams` es inmutable.** `.set()` devuelve una instancia nueva en
 *    vez de mutar la existente, así que el retorno hay que reasignarlo. Un
 *    bucle que llame a `params.set(...)` ignorando el resultado manda la
 *    petición sin ningún filtro y sin ningún error: la lista sale completa y
 *    parece que el backend ignora los filtros.
 * 2. **Se omiten las claves vacías.** Mandar `category=` no es lo mismo que no
 *    mandar `category`: el backend intentaría convertir la cadena vacía al enum
 *    y responde 400. Lo mismo con `status=` en Tareas.
 *
 * Acepta varias fuentes en vez de un solo objeto porque quien llama tiene el
 * filtro y la paginación en dos parámetros distintos, y ambos son opcionales:
 * fundirlos aquí evita un `{ ...filter, ...pageable }` repetido en cada
 * servicio, que es justo donde se cuela un `undefined` mal esparcido.
 */
export function toHttpParams(...sources: (object | undefined)[]): HttpParams {
  let params = new HttpParams();

  for (const source of sources) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, value);
      }
    }
  }

  return params;
}

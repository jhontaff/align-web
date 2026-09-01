export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

/**
 * Parámetros de paginación de Spring, el gemelo del lado petición de `Page<T>`.
 *
 * Vivía en `features/finance/models/transaction.model.ts` con la nota de que
 * subiría a `core/` cuando hubiera un segundo consumidor. Lo hay: el resumen de
 * Inicio pide `/api/tasks` con `size` y `sort` para sacar las próximas tareas y
 * el contador de pendientes en una sola petición. Importarlo desde Finanzas
 * sería la importación cruzada entre features que el árbol prohíbe — la pieza
 * compartida sube, no se importa de lado.
 */
export interface Pageable {
  /** Base 0. */
  page?: number;
  size?: number;
  /** Formato de Spring: `campo,direccion`. Por ejemplo `date,desc`. */
  sort?: string;
}

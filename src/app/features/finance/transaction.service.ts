import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';
import { toHttpParams } from '../../core/http/to-http-params';
import { Page, Pageable } from '../../core/models/page.model';
import {
  CategoryExpense,
  FinancialSummaryResponse,
  TransactionFilter,
  TransactionRequest,
  TransactionResponse,
  TransactionUpdateRequest
} from './models/transaction.model';
import { EXPENSE_CATEGORIES } from './transaction-labels';

/**
 * Cliente HTTP de Finanzas. Sin estado, como `TaskService`: el estado lo posee
 * la pantalla que llama.
 *
 * Los tipos de retorno son el DTO **ya desenvuelto** — `unwrapInterceptor`
 * quita el `ApiResponse` antes de que el servicio vea el cuerpo. Nunca se
 * declara `Observable<ApiResponse<T>>`.
 *
 * El alta, la edición y el borrado entraron con `transaction-form/` y
 * `transaction-detail/`, que son las pantallas que los consumen.
 */
@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly http = inject(HttpClient);

  /**
   * Listado paginado.
   *
   * Conviene pasar siempre `sort: 'date,desc'`: sin él el orden lo decide el
   * backend y una lista de movimientos sin fecha descendente parece rota
   * aunque los datos sean correctos.
   */
  list(filter?: TransactionFilter, pageable?: Pageable): Observable<Page<TransactionResponse>> {
    return this.http.get<Page<TransactionResponse>>('/api/transactions', {
      params: toHttpParams(filter, pageable)
    });
  }

  get(id: string): Observable<TransactionResponse> {
    return this.http.get<TransactionResponse>(`/api/transactions/${id}`);
  }

  create(request: TransactionRequest): Observable<TransactionResponse> {
    return this.http.post<TransactionResponse>('/api/transactions', request);
  }

  update(id: string, request: TransactionUpdateRequest): Observable<TransactionResponse> {
    return this.http.put<TransactionResponse>(`/api/transactions/${id}`, request);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/transactions/${id}`);
  }

  /** Totales del mismo conjunto que devolvería `list()` con ese filtro. */
  summary(filter?: TransactionFilter): Observable<FinancialSummaryResponse> {
    return this.http.get<FinancialSummaryResponse>('/api/transactions/summary', {
      params: toHttpParams(filter)
    });
  }

  /**
   * El gasto de cada categoría en el rango, para el gráfico comparativo.
   *
   * **Esto es un N+1 declarado, y el sitio donde está es la decisión.** El
   * backend no tiene ningún endpoint agregado por categoría: `/summary`
   * devuelve tres escalares y acepta `category` como filtro, así que un
   * desglose de nueve categorías son nueve peticiones. No hay forma de
   * evitarlo desde el frontend; lo que sí se puede elegir es que el coste
   * quede encerrado detrás de una firma que no lo delata. Cuando exista
   * `GET /api/transactions/summary/by-category` cambia el cuerpo de este
   * método y no se entera nadie más: ni el componente, ni el tipo que devuelve.
   *
   * **Por qué no se agrega en cliente desde `list()`**, que sería una sola
   * petición: ese endpoint está paginado. Pedir un `size` grande y sumar la
   * página es el fallo silencioso que este repo ya rechazó para el buscador de
   * Tareas — en cuanto el rango tenga más movimientos que el `size`, el gráfico
   * infra-reporta sin error alguno y sus barras dejan de sumar el `totalExpense`
   * que la misma pantalla muestra justo encima. Aquí cada cifra la calcula el
   * servidor sobre el rango entero, cueste lo que cueste en round-trips.
   *
   * `forkJoin` sobre un array conserva el orden, así que el resultado sale en
   * el orden de `EXPENSE_CATEGORIES`. Es determinista a propósito: ordenar de
   * mayor a menor es una decisión de presentación y la toma quien pinta.
   *
   * Falla entero si falla una: un gráfico al que le falta una barra en silencio
   * es peor que un gráfico que no se pinta, precisamente porque las barras
   * tienen que sumar el total de al lado.
   *
   * `type` no se manda. Sobra —el backend deriva el tipo de la categoría, y
   * `FOOD` solo puede ser gasto— y mandarlo abriría la puerta a un filtro
   * contradictorio (`type=INCOME&category=FOOD`) que devolvería ceros.
   */
  expenseByCategory(filter?: TransactionFilter): Observable<CategoryExpense[]> {
    return forkJoin(
      EXPENSE_CATEGORIES.map(category =>
        this.summary({ ...filter, category }).pipe(
          // De los tres escalares solo uno tiene sentido aquí: con la categoría
          // fijada a un gasto, `totalIncome` es siempre 0 y `balance` es el
          // mismo número cambiado de signo.
          map(summary => ({ category, total: summary.totalExpense }))
        )
      )
    );
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { toHttpParams } from '../../core/http/to-http-params';
import { Page, Pageable } from '../../core/models/page.model';
import {
  FinancialSummaryResponse,
  TransactionFilter,
  TransactionResponse
} from './models/transaction.model';

/**
 * Cliente HTTP de Finanzas. Sin estado, como `TaskService`: el estado lo posee
 * la pantalla que llama.
 *
 * Los tipos de retorno son el DTO **ya desenvuelto** — `unwrapInterceptor`
 * quita el `ApiResponse` antes de que el servicio vea el cuerpo. Nunca se
 * declara `Observable<ApiResponse<T>>`.
 *
 * Solo están los dos endpoints de lectura: son los que consumen las pantallas
 * que existen. El alta, la edición y el borrado entran cuando entre el
 * formulario, no antes.
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

  /** Totales del mismo conjunto que devolvería `list()` con ese filtro. */
  summary(filter?: TransactionFilter): Observable<FinancialSummaryResponse> {
    return this.http.get<FinancialSummaryResponse>('/api/transactions/summary', {
      params: toHttpParams(filter)
    });
  }
}

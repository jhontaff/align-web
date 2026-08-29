import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page } from '../../core/models/page.model';
import {
  FinancialSummaryResponse,
  Pageable,
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
      params: this.toParams(filter, pageable)
    });
  }

  /** Totales del mismo conjunto que devolvería `list()` con ese filtro. */
  summary(filter?: TransactionFilter): Observable<FinancialSummaryResponse> {
    return this.http.get<FinancialSummaryResponse>('/api/transactions/summary', {
      params: this.toParams(filter)
    });
  }

  /**
   * Filtro y paginación a query params.
   *
   * Dos cosas que parecen detalles y no lo son:
   *
   * 1. **`HttpParams` es inmutable.** `.set()` devuelve una instancia nueva en
   *    vez de mutar la existente, así que el retorno hay que reasignarlo. Un
   *    bucle que llame a `params.set(...)` ignorando el resultado manda la
   *    petición sin ningún filtro y sin ningún error: el listado sale completo
   *    y parece que el backend ignora los filtros.
   * 2. **Se omiten las claves vacías.** Mandar `category=` no es lo mismo que
   *    no mandar `category`: el backend intentaría convertir la cadena vacía al
   *    enum y responde 400.
   */
  private toParams(filter?: TransactionFilter, pageable?: Pageable): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries({ ...filter, ...pageable })) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, value);
      }
    }

    return params;
  }
}

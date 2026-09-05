import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DateRange } from '../../core/date/date-range';
import { toHttpParams } from '../../core/http/to-http-params';
import { Page, Pageable } from '../../core/models/page.model';
import {
  CategoryBreakdownResponse,
  FinancialSummaryResponse,
  MonthlySummaryFilter,
  MonthlySummaryResponse,
  TransactionFilter,
  TransactionRequest,
  TransactionResponse,
  TransactionUpdateRequest
} from './models/transaction.model';

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
   * El desglose por categoría del rango, para el gráfico comparativo.
   *
   * **Era un N+1 y ya no lo es** (2026-09-04). Hasta hoy este método hacía un
   * `forkJoin` de nueve `GET /summary`, uno por categoría de gasto, porque el
   * backend no agregaba por categoría; el comentario que ocupaba este sitio
   * anunciaba que el día que existiera `GET /api/transactions/summary/by-category`
   * cambiaría el cuerpo del método y no se enteraría nadie más. Existe, y eso
   * es exactamente lo que pasó: una petición en vez de nueve.
   *
   * **Toma un `DateRange` y no un `TransactionFilter`, y la firma es la
   * corrección importante.** Este endpoint solo acepta `from` y `to` —los lee
   * como `@RequestParam` sueltos, no bindea el objeto de filtro—, así que un
   * `category` o un `type` colados en el filtro viajarían en la URL para que el
   * servidor los ignore en silencio: el gráfico saldría con el desglose entero
   * bajo un encabezado que promete otra cosa. Con el tipo estrecho, ese error no
   * se puede escribir.
   *
   * Sin rango, el servidor responde el mes en curso — no el histórico, que es lo
   * que hace `/summary`. No se depende de eso: la pantalla manda siempre su
   * rango, que es el mismo con el que pide las cifras de arriba.
   */
  categoryBreakdown(range?: DateRange): Observable<CategoryBreakdownResponse> {
    return this.http.get<CategoryBreakdownResponse>('/api/transactions/summary/by-category', {
      params: toHttpParams(range)
    });
  }

  /**
   * El histórico mes a mes, para el gráfico de flujo.
   *
   * **Toma un `MonthlySummaryFilter` y no un `DateRange`**, justo al revés que
   * el método de arriba y por el mismo tipo de motivo: aquí el servidor lee
   * `from` y `to` como `YearMonth`, así que un `2026-09-01` no se convierte y
   * responde 400. Los dos endpoints se llaman casi igual y esperan
   * granularidades distintas; que sus tipos no encajen es lo que impide
   * confundirlos.
   *
   * Sin `from`/`to` el servidor elige la ventana por su cuenta —hasta 12 meses,
   * recortada al primer movimiento del usuario y con un suelo de 3—, así que el
   * número de barras cambiaría solo según cuántos datos hubiera. La pantalla
   * manda siempre la suya para que el gráfico tenga la misma forma cada día.
   */
  monthlySummary(filter?: MonthlySummaryFilter): Observable<MonthlySummaryResponse> {
    return this.http.get<MonthlySummaryResponse>('/api/transactions/summary/monthly', {
      params: toHttpParams(filter)
    });
  }
}

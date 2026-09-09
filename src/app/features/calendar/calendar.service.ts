import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { toHttpParams } from '../../core/http/to-http-params';
import { Page, Pageable } from '../../core/models/page.model';
import { EventFilter, EventRequest, EventResponse } from './models/event.model';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);

  /**
   * `filter` casi siempre debe llevar `from`/`to` (ver `calendar-date.ts`):
   * sin ellos el backend devuelve TODO el historial del usuario sin acotar a
   * ningún mes — verificado en `EventServiceImpl.list`, no hay default de
   * "mes en curso" como sí tiene el resumen de Finanzas.
   */
  list(filter?: EventFilter, pageable?: Pageable): Observable<Page<EventResponse>> {
    return this.http.get<Page<EventResponse>>('/api/calendar/events', {
      params: toHttpParams(filter, pageable)
    });
  }

  get(id: string): Observable<EventResponse> {
    return this.http.get<EventResponse>(`/api/calendar/events/${id}`);
  }

  create(request: EventRequest): Observable<EventResponse> {
    return this.http.post<EventResponse>('/api/calendar/events', request);
  }

  /**
   * `PUT`, reemplazo completo. Un solo `EventRequest` para alta y edición —
   * ver el comentario del modelo.
   */
  update(id: string, request: EventRequest): Observable<EventResponse> {
    return this.http.put<EventResponse>(`/api/calendar/events/${id}`, request);
  }

  /**
   * El backend responde `200` con `ApiResponse<Void>` (`data: null`), así
   * que aquí no hay DTO que devolver — mismo caso que `TaskService.remove`.
   */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/calendar/events/${id}`);
  }
}

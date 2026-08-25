import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page } from '../../core/models/page.model';
import { TaskRequest, TaskResponse } from './models/task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  list(): Observable<Page<TaskResponse>> {
    return this.http.get<Page<TaskResponse>>('/api/tasks');
  }

  /**
   * Detalle de una tarea. Devuelve el DTO ya desenvuelto: `unwrapInterceptor`
   * quita el `ApiResponse` antes de que el servicio vea el cuerpo, igual que en
   * `list()` — nunca se tipa como `Observable<ApiResponse<TaskResponse>>`.
   */
  get(id: number): Observable<TaskResponse> {
    return this.http.get<TaskResponse>(`/api/tasks/${id}`);
  }

  create(request: TaskRequest): Observable<TaskResponse> {
    return this.http.post<TaskResponse>('/api/tasks', request);
  }

  /**
   * El backend responde 204/200 sin `data`, así que aquí no hay DTO que
   * devolver. El cuerpo vacío tampoco encaja con la forma de `ApiResponse`,
   * de modo que `unwrapInterceptor` lo deja pasar tal cual — no hay nada que
   * desenvolver ni ningún tipo que declarar más allá de `void`.
   */
  remove(id: number): Observable<void> {
    return this.http.delete<void>(`/api/tasks/${id}`);
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { toHttpParams } from '../../core/http/to-http-params';
import { Page, Pageable } from '../../core/models/page.model';
import { TaskFilter, TaskRequest, TaskResponse } from './models/task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  /**
   * Listado paginado, con filtro por estado opcional.
   *
   * Ambos parametros son opcionales y `TaskList` sigue llamandolo sin
   * argumentos; los anadio el resumen de Inicio, que necesita
   * `status=PENDING&size=3&sort=dueDate,asc`.
   *
   * El filtro va al servidor y no al array devuelto a proposito. Contar o
   * buscar en cliente solo ve la pagina cargada, asi que con paginacion el
   * numero seria falso en cuanto haya mas tareas que el tamano de pagina —
   * es el mismo motivo por el que el buscador de tareas sigue sin construirse.
   * El contador honesto es `totalElements`, y viene en la misma respuesta que
   * el `content`: una peticion, dos datos.
   */
  list(filter?: TaskFilter, pageable?: Pageable): Observable<Page<TaskResponse>> {
    return this.http.get<Page<TaskResponse>>('/api/tasks', {
      params: toHttpParams(filter, pageable)
    });
  }

  /**
   * Detalle de una tarea. Devuelve el DTO ya desenvuelto: `unwrapInterceptor`
   * quita el `ApiResponse` antes de que el servicio vea el cuerpo, igual que en
   * `list()` — nunca se tipa como `Observable<ApiResponse<TaskResponse>>`.
   */
  get(id: string): Observable<TaskResponse> {
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
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/tasks/${id}`);
  }
}

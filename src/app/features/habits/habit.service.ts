import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HabitRequest, HabitResponse } from './models/habit.model';

/**
 * Cliente HTTP de Habitos. Sin estado, como `TaskService` y
 * `TransactionService`: el estado lo posee la pantalla que llama.
 *
 * Siete metodos, uno por endpoint del recurso: la feature ya consume la API de
 * Habitos entera.
 */
@Injectable({ providedIn: 'root' })
export class HabitService {
  private readonly http = inject(HttpClient);

  /**
   * **No devuelve `Page<T>`**, a diferencia de Tareas y Finanzas: este endpoint
   * no pagina y responde con el array completo. Se espera una N pequena (una
   * lista personal de habitos), asi que no hay nada que paginar.
   */
  list(): Observable<HabitResponse[]> {
    return this.http.get<HabitResponse[]>('/api/habits');
  }

  get(id: string): Observable<HabitResponse> {
    return this.http.get<HabitResponse>(`/api/habits/${id}`);
  }

  /**
   * `HabitRequest` **sirve tambien para editar**: el backend no tiene un
   * `HabitUpdateRequest` porque los dos campos (`name`, `scheduledTime`) tienen
   * las mismas reglas al crear que al editar. Por eso el tipo no lleva sufijo
   * `Create`.
   */
  create(request: HabitRequest): Observable<HabitResponse> {
    return this.http.post<HabitResponse>('/api/habits', request);
  }

  update(id: string, request: HabitRequest): Observable<HabitResponse> {
    return this.http.put<HabitResponse>(`/api/habits/${id}`, request);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/habits/${id}`);
  }

  /**
   * Marca el habito como hecho **hoy**. Sin cuerpo: la fecha la pone el
   * servidor con su propio reloj, que es lo unico coherente con que
   * `currentStreak` tambien lo calcule el.
   *
   * **Idempotente**: repetirlo el mismo dia es un no-op seguro, no un error.
   * Por eso el boton que lo dispara no se deshabilita tras el primer clic —
   * solo mientras la peticion esta en vuelo, que es otra cosa.
   *
   * Devuelve el habito ya actualizado, asi que quien llama sustituye su fila
   * con la respuesta en vez de recargar la lista entera.
   */
  complete(id: string): Observable<HabitResponse> {
    return this.http.post<HabitResponse>(`/api/habits/${id}/completions`, null);
  }

  /**
   * Deshace la completacion de hoy: `DELETE` sobre la MISMA URL que la crea.
   *
   * No es un metodo aparte por capricho de simetria — es que la completacion de
   * hoy es un recurso, y `POST` la crea igual que `DELETE` la borra. Por eso no
   * existe un `toggle(id, done)` aqui: esconderia que son dos verbos HTTP
   * distintos, y la regla de esta capa es un metodo por endpoint.
   *
   * Devuelve el habito entero con las **dos** rachas ya recalculadas, asi que
   * quien llama sustituye su fila con la respuesta igual que al marcar.
   *
   * Verificado contra el backend vivo el 2026-09-09: `longestStreak` NO es un
   * maximo congelado —baja si la completacion que se quita era parte del
   * record—, y repetir el `DELETE` es un no-op seguro que responde 200, igual
   * que repetir el `POST`. El guard de la pantalla existe por la interfaz, no
   * porque el backend se queje.
   */
  uncomplete(id: string): Observable<HabitResponse> {
    return this.http.delete<HabitResponse>(`/api/habits/${id}/completions`);
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HabitRequest, HabitResponse } from './models/habit.model';

/**
 * Cliente HTTP de Habitos. Sin estado, como `TaskService` y
 * `TransactionService`: el estado lo posee la pantalla que llama.
 *
 * Tres metodos, que son los que la pantalla dispara hoy. La edicion
 * (`PUT /api/habits/{id}`) y el borrado existen en el backend pero todavia no
 * tienen boton, y entran cuando lo tengan — mismo criterio que dejo a
 * `TransactionService` con dos metodos.
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

  /**
   * `HabitRequest` es `{ name }` y **sirve tambien para editar**: el backend no
   * tiene un `HabitUpdateRequest` porque el dominio solo tiene un campo
   * editable. Por eso el tipo no lleva sufijo `Create`.
   */
  create(request: HabitRequest): Observable<HabitResponse> {
    return this.http.post<HabitResponse>('/api/habits', request);
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
}

import { Injectable, computed, signal } from '@angular/core';
import { UserResponse } from '../models/user-response.model';
import { clearToken, getToken, setToken } from './token-storage';

/**
 * La sesión: el token y el usuario actual, en un solo sitio.
 *
 * Existe separado de `AuthStateService` por una razón concreta: el 401 se
 * detecta en `authInterceptor`, y hasta ahora ese interceptor llamaba a
 * `clearToken()` a pelo. Eso borraba el token pero dejaba intactos los signals
 * de `AuthStateService`, así que `isAuthenticated()` seguía en `true` y el
 * shell seguía pintando header, sidebar y chat alrededor de la pantalla de
 * login — que es lo que se veía como un "modal de login sobre Home".
 *
 * El interceptor no puede inyectar `AuthStateService` sin arrastrar su
 * `HttpClient` (el ciclo HttpClient → interceptor → servicio → HttpClient).
 * Este servicio no tiene dependencias, así que se inyecta desde cualquier
 * sitio: interceptor, guard y `AuthStateService` miran todos el mismo estado.
 *
 * Regla que sostiene el arreglo: **token y signals cambian siempre juntos**.
 * Nadie fuera de aquí importa `token-storage`.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly _token = signal<string | null>(getToken());
  private readonly _user = signal<UserResponse | null>(null);

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();

  /**
   * Derivado del token, no un signal propio: dos booleanos para la misma
   * pregunta es exactamente la desincronización que este servicio viene a
   * eliminar.
   */
  readonly isAuthenticated = computed(() => this._token() !== null);

  start(token: string): void {
    setToken(token);
    this._token.set(token);
  }

  setUser(user: UserResponse): void {
    this._user.set(user);
  }

  /** Cierre de sesión completo: token fuera de `localStorage` y estado a cero. */
  clear(): void {
    clearToken();
    this._token.set(null);
    this._user.set(null);
  }
}

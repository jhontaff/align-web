import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { AuthStateService } from '../../core/auth/auth-state.service';
import { UserResponse } from '../../core/models/user-response.model';
import { PasswordUpdateRequest } from './models/password-update.model';
import { ProfileUpdateRequest } from './models/profile-update.model';

/**
 * Edición de perfil: `PUT /me` y las tres operaciones de avatar. Stateless
 * como el resto de servicios de feature — el estado del usuario en sesión
 * sigue viviendo en `AuthStateService`.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly authState = inject(AuthStateService);

  /** Se revoca antes de pedir uno nuevo — ver `avatarUrl`. */
  private previousAvatarUrl: string | null = null;

  /**
   * URL local del avatar real, o `null` si no hay foto subida.
   *
   * Deriva de `hasAvatar` con `toObservable` + `switchMap` (no un `effect()`
   * escribiendo un signal: eso es el antipatrón que CLAUDE.md prohíbe para
   * sincronizar dos signals). `GET /api/users/me/avatar` exige el mismo
   * `Authorization` que cualquier otra petición, así que no puede ser un
   * `<img src="/api/...">` a pelo — de ahí el blob local.
   */
  readonly avatarUrl = toSignal(
    toObservable(computed(() => this.authState.user()?.hasAvatar ?? false)).pipe(
      switchMap(hasAvatar => {
        if (this.previousAvatarUrl) {
          URL.revokeObjectURL(this.previousAvatarUrl);
          this.previousAvatarUrl = null;
        }

        if (!hasAvatar) {
          return of(null);
        }

        return this.http.get('/api/users/me/avatar', { responseType: 'blob' }).pipe(
          map(blob => {
            const url = URL.createObjectURL(blob);
            this.previousAvatarUrl = url;
            return url;
          }),
          catchError(() => of(null))
        );
      })
    ),
    { initialValue: null }
  );

  updateProfile(request: ProfileUpdateRequest): Observable<UserResponse> {
    return this.http.put<UserResponse>('/api/users/me', request);
  }

  uploadAvatar(file: File): Observable<void> {
    const body = new FormData();
    body.append('file', file);
    return this.http.put<void>('/api/users/me/avatar', body);
  }

  deleteAvatar(): Observable<void> {
    return this.http.delete<void>('/api/users/me/avatar');
  }

  /**
   * `ApiResponse<Void>` — no hay `UserResponse` que aplicar a la sesión, y el
   * backend no invalida el JWT actual ni otras sesiones al cambiar la contraseña.
   */
  changePassword(request: PasswordUpdateRequest): Observable<void> {
    return this.http.put<void>('/api/users/me/password', request);
  }
}

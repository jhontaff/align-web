import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, tap } from 'rxjs';
import { AuthResponse } from '../models/auth-response.model';
import { UserResponse } from '../models/user-response.model';
import { PushService } from '../notifications/push.service';
import { SessionService } from './session.service';

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

/**
 * Las operaciones de sesión que hablan con el backend.
 *
 * El estado en sí vive en `SessionService`; aquí solo se re-expone para que los
 * consumidores (shell, header, Home) no tengan que cambiar de servicio ni
 * conocer al de abajo. La división es la que permite que `authInterceptor`
 * cierre la sesión sin inyectar nada que dependa de `HttpClient`.
 */
@Injectable({ providedIn: 'root' })
export class AuthStateService {
    private readonly http = inject(HttpClient);
    private readonly session = inject(SessionService);
    private readonly push = inject(PushService);

    readonly user = this.session.user;
    readonly isAuthenticated = this.session.isAuthenticated;

    private applyAuthResponse(auth: AuthResponse): Observable<UserResponse> {
        this.session.start(auth.accessToken);
        return this.hydrateUser();
    }

    login(credentials: LoginRequest): Observable<UserResponse> {
        return this.http.post<AuthResponse>('/auth/login', credentials).pipe(
            switchMap(auth => this.applyAuthResponse(auth))
        );
    }

    register(request: RegisterRequest): Observable<UserResponse> {
        return this.http.post<AuthResponse>('/auth/register', request).pipe(
            switchMap(auth => this.applyAuthResponse(auth))
        );
    }

    hydrateUser(): Observable<UserResponse> {
        return this.http.get<UserResponse>('/auth/me').pipe(
            tap(user => this.session.setUser(user))
        );
    }

    hydrateIfAuthenticated(): void {
        if (!this.session.isAuthenticated()) {
            return;
        }

        // Esta es la primera petición de la app con el token guardado, o sea la
        // que descubre que caducó mientras la pestaña estaba cerrada. La rama
        // de error está vacía a propósito: el 401 ya lo trata `authInterceptor`
        // (cierra sesión y lleva a /login); lo único que hace falta aquí es no
        // dejar el error sin manejar.
        this.hydrateUser().subscribe({ error: () => {} });
    }

    /**
     * Da de baja el dispositivo **antes** de limpiar la sesión.
     *
     * Ese orden es el arreglo, no un detalle: el `DELETE` de la suscripción
     * necesita el `Authorization`, y borrando el token primero saldría sin él
     * —401, y `authInterceptor` limpiando otra vez—. La suscripción sobreviviría
     * apuntando a este usuario, y como el backend identifica la fila por
     * `endpoint` (el navegador, no la persona), quien entre después en el mismo
     * equipo recibiría **sus** notificaciones sin poder quitárselas: la baja
     * filtra por usuario, así que su "Desactivar" no toca una fila ajena.
     *
     * Si la baja falla, la sesión se cierra igual. Negarle el logout a alguien
     * porque el backend no está disponible es el peor de los dos males, y el
     * caso ya tiene red debajo: el servidor borra la suscripción en cuanto el
     * servicio de push le responde `410`.
     *
     * No hay riesgo de quedarse colgado esperando: `disable()` sale sola si no
     * hay suscripción, que es siempre el caso cuando el Service Worker no está
     * activo (o sea, en desarrollo).
     */
    async logout(): Promise<void> {
        await this.push.disable().catch(() => {});
        this.session.clear();
    }
}

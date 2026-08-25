import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionService } from '../auth/session.service';

/**
 * Adjunta el token a cada petición y trata el 401 como fin de sesión.
 *
 * El 401 es el único error con una sola respuesta correcta para toda la app
 * (por eso vive aquí y no en cada `catchError` de cada servicio): el backend
 * emite un JWT de 24h y no tiene endpoint de refresco, así que un 401 solo
 * puede significar "vuelve a entrar".
 *
 * Se inyecta `SessionService` y no `AuthStateService` a propósito: el segundo
 * depende de `HttpClient` y crearlo desde dentro de un interceptor invita al
 * ciclo HttpClient → interceptor → servicio → HttpClient. `SessionService` no
 * tiene dependencias.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const session = inject(SessionService);
  const token = session.token();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      // Se ramifica por código de estado, nunca por el mensaje: el backend
      // devuelve el mismo "Authentication required." tanto si no hay token
      // como si está caducado o es inválido.
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // Doble función. Cierra la sesión de verdad (token + signals a la vez,
        // que es lo que hace que el shell se desmonte y el login quede a
        // pantalla completa), y sirve de guarda contra el 401 duplicado: una
        // pantalla que dispara varias peticiones recibe varios 401, y sin esto
        // cada uno navegaría a /login por su cuenta.
        if (session.isAuthenticated()) {
          session.clear();
          router.navigate(['/login']);
        }
      }

      // Se relanza igualmente: quien llamó decide si además muestra un error.
      // Un login con credenciales malas también es 401, y esa pantalla necesita
      // el error para pintarlo (ahí `isAuthenticated()` ya es false, así que la
      // rama de arriba no se activa).
      return throwError(() => err);
    })
  );
};

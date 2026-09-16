import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SessionService } from './session.service';

/**
 * El inverso de `authGuard`, para rutas públicas que no tienen sentido con
 * sesión activa. El caso real: el `start_url` de la PWA instalada apunta a
 * `/login` para saltarse el landing (ver `public/manifest.webmanifest`), así
 * que con un token ya válido hay que entrar directo a Home en vez de mostrar
 * el formulario.
 */
export const redirectIfAuthenticatedGuard: CanActivateFn = () => {
  const router = inject(Router);

  if (inject(SessionService).isAuthenticated()) {
    router.navigate(['/']);
    return false;
  }

  return true;
};

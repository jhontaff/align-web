import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SessionService } from './session.service';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);

  // Mismo signal que lee el shell para decidir si pinta el cromo. Si el guard
  // mirase `localStorage` por su cuenta habría dos respuestas posibles a "hay
  // sesión", y son justo las que se desincronizaron.
  if (inject(SessionService).isAuthenticated()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

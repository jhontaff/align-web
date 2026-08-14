import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { getToken } from './token-storage';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);

  if (getToken()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

import type { CanDeactivateFn } from '@angular/router';
import type { Profile } from './profile';

// Deja que /profile anime su salida antes de que el router lo destruya.
// Imports `type`-only para no romper el lazy-loading de `Profile` (ver
// `app.routes.ts`).
export const profileExitGuard: CanDeactivateFn<Profile> = component => component.animateOut();

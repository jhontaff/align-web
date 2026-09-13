import { Injectable, effect, inject, untracked } from '@angular/core';
import { AuthStateService } from '../auth/auth-state.service';
import { BreakpointService } from '../layout/breakpoint.service';
import { buildShellOnboardingSteps } from './shell-onboarding-steps';
import { TourRunnerService } from './tour-runner.service';

/**
 * Lanza el tour de bienvenida del shell la primera vez que hay sesión en
 * este navegador.
 *
 * Sin plantilla propia, así que vive en `core/` (lógica sin UI) y no como un
 * componente de `layout/`. El molde es el mismo que `ThemeService`: un
 * `effect()` que sincroniza un signal con una API imperativa externa — aquí,
 * `TourRunnerService`, que es quien de verdad sabe hablar con `driver.js`.
 *
 * El backend sí manda `createdAt` en `UserResponse`, pero no sirve como flag de
 * "usuario nuevo": es la fecha de creación de la cuenta, no de la primera
 * visita de este navegador. "Primera vez" se resuelve 100% en cliente vía
 * `localStorage` (dentro de `TourRunnerService`/`tour-storage.ts`), sin
 * distinguir login fresco de retomar una sesión guardada.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingTourService {
  private readonly authState = inject(AuthStateService);
  private readonly breakpoint = inject(BreakpointService);
  private readonly tourRunner = inject(TourRunnerService);

  constructor() {
    effect(() => {
      if (this.authState.isAuthenticated()) {
        // untracked(): leer el breakpoint aquí no debe registrar una
        // dependencia del effect. Sin esto, redimensionar la ventana
        // cruzando el umbral a mitad de tour volvería a llamar a
        // `runOnce()` — inofensivo gracias al cerrojo de
        // `TourRunnerService`, pero es más limpio no re-ejecutar el effect
        // sin necesidad.
        const steps = untracked(() => buildShellOnboardingSteps(this.breakpoint.isDesktop()));
        this.tourRunner.runOnce('shell', steps);
      } else {
        this.tourRunner.stop('shell');
      }
    });
  }
}

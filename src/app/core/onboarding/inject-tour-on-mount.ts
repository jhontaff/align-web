import { DestroyRef, afterNextRender, assertInInjectionContext, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { DriveStep } from 'driver.js';
import { filter, take } from 'rxjs';
import { hasSeenTour } from './tour-storage';
import { TourRunnerService } from './tour-runner.service';

/**
 * Lanza el tour `tourId` tras el primer pintado real del componente que
 * llama a esta función desde su constructor.
 *
 * Hace falta `afterNextRender()` y no basta un `effect()` a secas: a
 * diferencia del tour del shell (disparado por un signal —`isAuthenticated`—
 * cuyo contenido, el nav, ya está montado por ese mismo signal), el
 * componente ruteado de cada pantalla ES el contenido de la ruta — su propia
 * plantilla no existe todavía cuando corre su constructor.
 *
 * Se llama, sin paréntesis de por medio, como primera línea de un
 * constructor: `inject()`/`afterNextRender()` dentro de una función invocada
 * síncronamente desde ahí ven el mismo contexto de inyección que el propio
 * constructor.
 *
 * `waitFor` (opcional, hoy solo lo usa `home` con `'shell'`): si ese otro tour
 * sigue corriendo, este espera a que termine antes de arrancar, en vez de
 * perder el cerrojo global y quedar pendiente para la próxima visita — así
 * los dos se ven en la MISMA sesión de un usuario nuevo. La espera se
 * suscribe con `takeUntilDestroyed()`: si este componente se desmonta antes
 * de que `waitFor` termine (el usuario navegó a otra pantalla), se cancela en
 * vez de disparar el tour más tarde sobre una plantilla que ya no es la suya.
 */
export function injectTourOnMount(tourId: string, steps: DriveStep[], waitFor?: string): void {
  assertInInjectionContext(injectTourOnMount);
  const tourRunner = inject(TourRunnerService);
  const destroyRef = inject(DestroyRef);

  afterNextRender(() => {
    if (!waitFor || hasSeenTour(tourId) || !tourRunner.isActive(waitFor)) {
      tourRunner.runOnce(tourId, steps);
      return;
    }

    tourRunner.finished$
      .pipe(
        filter(id => id === waitFor),
        take(1),
        takeUntilDestroyed(destroyRef)
      )
      .subscribe(() => tourRunner.runOnce(tourId, steps));
  });
}

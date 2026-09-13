import { Injectable } from '@angular/core';
import { driver, type Driver, type DriveStep } from 'driver.js';
import { Subject } from 'rxjs';
import { hasSeenTour, markTourSeen } from './tour-storage';

/**
 * Arranca un tour de `driver.js` identificado por `tourId`, una vez por
 * navegador, y sabe limpiarlo si hace falta interrumpirlo desde fuera.
 *
 * Generalización de lo que antes vivía inline en `OnboardingTourService`
 * (el tour del shell): con varias pantallas teniendo su propio tour, la
 * construcción de la config de `driver()` y el punto de escritura del flag
 * visto tenían que dejar de estar atados a un único `Driver` en un campo
 * privado.
 */
@Injectable({ providedIn: 'root' })
export class TourRunnerService {
  /**
   * Un `Map` plano, no un signal: ningún template ni `computed()` necesita
   * leer qué tours están activos, es contabilidad puramente interna para el
   * cerrojo y la limpieza.
   */
  private readonly active = new Map<string, Driver>();

  /**
   * Emite `tourId` cuando ese tour termina de verdad — completado, cerrado
   * con X/Escape o clic en el velo. `stop()` (interrupción forzada, p. ej. al
   * cerrar sesión) NO emite aquí a propósito: no cuenta como "lo vio", y
   * encadenar algo detrás de una interrupción sería la señal equivocada.
   *
   * Sirve para encadenar un tour detrás de otro (ver `injectTourOnMount`,
   * caso `home` tras `shell`) o para que algo fuera de este servicio
   * reaccione a "ya lo vio" sin sondear `hasSeenTour()`.
   */
  readonly finished$ = new Subject<string>();

  /**
   * Arranca `tourId` si no se ha visto todavía Y no hay ya otro tour activo.
   *
   * El cerrojo es GLOBAL (`active.size > 0`), no por id. `isAuthenticated`
   * se siembra síncronamente desde `localStorage` al arrancar la sesión, así
   * que en una recarga con token válido el `effect()` del tour del shell
   * puede quedar listo para disparar casi al mismo tiempo que el
   * `afterNextRender()` de una pantalla de feature — el orden relativo entre
   * el scheduler de effects y la fase de render no es un contrato que este
   * código pueda asumir. Con un cerrojo por id, dos tours con ids distintos
   * (p. ej. `shell` y `tasks`) podrían arrancar casi a la vez si el usuario
   * entra directo a `/tasks` por marcador con sesión ya activa. Con el
   * cerrojo global, el que pierde la carrera simplemente no se muestra esta
   * vez — como su flag nunca se marca visto, sale en la siguiente visita.
   */
  runOnce(tourId: string, steps: DriveStep[]): void {
    if (hasSeenTour(tourId) || this.active.size > 0) {
      return;
    }

    const driverObj = driver({
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Siguiente',
      prevBtnText: 'Anterior',
      doneBtnText: 'Entendido',
      disableActiveInteraction: true,
      overlayColor: readScrimColor(),
      popoverClass: 'onboarding-popover',
      steps,
      // Terminar todos los pasos, cerrar con la X, Escape o clic en el velo
      // cuentan igual: "ya lo vio". Un solo punto de escritura del flag.
      onDestroyed: () => {
        this.active.delete(tourId);
        markTourSeen(tourId);
        this.finished$.next(tourId);
      }
    });

    this.active.set(tourId, driverObj);
    driverObj.drive();
  }

  /** Si `tourId` está corriendo ahora mismo. Ver `injectTourOnMount`. */
  isActive(tourId: string): boolean {
    return this.active.has(tourId);
  }

  /**
   * Interrumpe `tourId` si está activo.
   *
   * Borra la entrada del `Map` ella misma, sin depender solo de que
   * `onDestroyed` lo haga: driver.js solo invoca ese callback si su
   * transición de entrada (400ms, vía `requestAnimationFrame`) ya resolvió.
   * Llamar a `destroy()` antes de eso limpia el DOM pero no dispara
   * `onDestroyed` — y si el borrado del `Map` dependiera solo de él, la
   * entrada quedaría huérfana para siempre, bloqueando el cerrojo global de
   * `runOnce` de por vida.
   */
  stop(tourId: string): void {
    this.active.get(tourId)?.destroy();
    this.active.delete(tourId);
  }
}

function readScrimColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-scrim').trim();
}

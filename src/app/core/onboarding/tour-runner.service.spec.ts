import { TestBed } from '@angular/core/testing';
import type { DriveStep } from 'driver.js';
import { TourRunnerService } from './tour-runner.service';

/**
 * driver.js pinta directamente sobre `document.body`, sin ningún componente
 * Angular de por medio — por eso estas pruebas dejan que corra de verdad en
 * vez de simular su API: es más simple y más fiel que mockear un módulo cuyo
 * único consumidor es esta clase. Lo que se afirma es el contrato propio (el
 * cerrojo, el punto de escritura del flag), no el posicionamiento del
 * popover ni su animación — eso se valida a ojo, igual que el arrastre real
 * de `angular-gridster2`.
 */
describe('TourRunnerService', () => {
  const WELCOME_STEP: DriveStep[] = [{ popover: { title: 'Hola' } }];

  function key(tourId: string): string {
    return `align_onboarding_seen_${tourId}`;
  }

  function cleanupDriverDom(): void {
    document.querySelectorAll('.driver-popover, svg.driver-overlay, #driver-dummy-element')
      .forEach(el => el.remove());
    document.body.classList.remove('driver-active', 'driver-fade', 'driver-simple', 'driver-no-scroll');
  }

  beforeEach(() => {
    localStorage.removeItem(key('a'));
    localStorage.removeItem(key('b'));
  });

  afterEach(() => {
    cleanupDriverDom();
    localStorage.removeItem(key('a'));
    localStorage.removeItem(key('b'));
  });

  it('sin verlo todavía, arranca el tour', () => {
    TestBed.inject(TourRunnerService).runOnce('a', WELCOME_STEP);

    expect(document.querySelector('.driver-popover')).not.toBeNull();
  });

  it('con el flag ya puesto, no lo arranca', () => {
    localStorage.setItem(key('a'), '1');

    TestBed.inject(TourRunnerService).runOnce('a', WELCOME_STEP);

    expect(document.querySelector('.driver-popover')).toBeNull();
  });

  it('el cerrojo es global: dos ids en el mismo tick, solo el primero se pinta y el segundo queda pendiente', () => {
    const runner = TestBed.inject(TourRunnerService);

    runner.runOnce('a', WELCOME_STEP);
    runner.runOnce('b', WELCOME_STEP);

    expect(document.querySelectorAll('.driver-popover').length).toBe(1);
    expect(localStorage.getItem(key('b'))).toBeNull(); // sigue pendiente para su próxima visita
  });

  it('cerrar el tour marca el flag visto y no revienta con doble destroy', async () => {
    const runner = TestBed.inject(TourRunnerService);

    runner.runOnce('a', WELCOME_STEP);
    expect(document.querySelector('.driver-popover')).not.toBeNull();

    // driver.js solo invoca `onDestroyed` si su transición de entrada (400ms
    // por defecto, animada vía requestAnimationFrame) ya resolvió — cerrar
    // antes de eso limpia el DOM pero no llega a llamar al callback. Un
    // usuario real tarda mucho más que eso en leer el paso, así que se espera
    // la animación real en vez de simularla.
    await new Promise(resolve => setTimeout(resolve, 450));

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));

    expect(localStorage.getItem(key('a'))).toBe('1');
    expect(document.querySelector('.driver-popover')).toBeNull();

    // `stop()` no debe reventar si ya se cerró solo (doble destroy).
    expect(() => runner.stop('a')).not.toThrow();
  });

  it('stop() interrumpe un tour activo y libera el cerrojo para el siguiente', async () => {
    const runner = TestBed.inject(TourRunnerService);

    runner.runOnce('a', WELCOME_STEP);
    runner.stop('a');

    expect(document.querySelector('.driver-popover')).toBeNull();

    // El cerrojo global quedó libre: otro tour puede arrancar de inmediato.
    runner.runOnce('b', WELCOME_STEP);
    expect(document.querySelector('.driver-popover')).not.toBeNull();
  });

  it('isActive() dice si un tour está corriendo ahora mismo', () => {
    const runner = TestBed.inject(TourRunnerService);

    expect(runner.isActive('a')).toBe(false);

    runner.runOnce('a', WELCOME_STEP);
    expect(runner.isActive('a')).toBe(true);

    runner.stop('a');
    expect(runner.isActive('a')).toBe(false);
  });

  it('finished$ emite el id al terminar de verdad, no al interrumpirlo con stop()', async () => {
    const runner = TestBed.inject(TourRunnerService);
    const seen: string[] = [];
    runner.finished$.subscribe(id => seen.push(id));

    // Interrumpido enseguida: ni onDestroyed ni finished$ llegan a correr
    // (misma razón que documenta stop()).
    runner.runOnce('a', WELCOME_STEP);
    runner.stop('a');
    expect(seen).toEqual([]);

    // Cerrado de verdad, con la transición de entrada ya resuelta.
    runner.runOnce('b', WELCOME_STEP);
    await new Promise(resolve => setTimeout(resolve, 450));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));

    expect(seen).toEqual(['b']);
  });
});

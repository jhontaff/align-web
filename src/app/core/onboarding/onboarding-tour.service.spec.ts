import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthStateService } from '../auth/auth-state.service';
import { BreakpointService } from '../layout/breakpoint.service';
import { OnboardingTourService } from './onboarding-tour.service';
import { TourRunnerService } from './tour-runner.service';

/**
 * `TourRunnerService` ya tiene su propio spec contra driver.js real
 * (`tour-runner.service.spec.ts`): aquí solo se afirma el contrato de ESTE
 * servicio — cuándo llama a `runOnce`/`stop` y con qué id — así que se
 * mockea en vez de dejar correr driver.js de verdad.
 */
describe('OnboardingTourService', () => {
  let runOnce: jasmine.Spy;
  let stop: jasmine.Spy;

  function configure(isAuthenticated: boolean) {
    const authenticated = signal(isAuthenticated);
    runOnce = jasmine.createSpy('runOnce');
    stop = jasmine.createSpy('stop');

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStateService, useValue: { isAuthenticated: authenticated } },
        { provide: BreakpointService, useValue: { isDesktop: signal(true) } },
        { provide: TourRunnerService, useValue: { runOnce, stop } }
      ]
    });

    return authenticated;
  }

  it('sin sesión, no arranca el tour', () => {
    configure(false);

    TestBed.inject(OnboardingTourService);
    TestBed.tick();

    expect(runOnce).not.toHaveBeenCalled();
  });

  it('al autenticarse, arranca el tour del shell', () => {
    const isAuthenticated = configure(false);

    TestBed.inject(OnboardingTourService);
    TestBed.tick();
    isAuthenticated.set(true);
    TestBed.tick();

    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(runOnce.calls.mostRecent().args[0]).toBe('shell');
  });

  it('al perder la sesión, interrumpe el tour del shell', () => {
    const isAuthenticated = configure(true);

    TestBed.inject(OnboardingTourService);
    TestBed.tick();
    isAuthenticated.set(false);
    TestBed.tick();

    expect(stop).toHaveBeenCalledWith('shell');
  });
});

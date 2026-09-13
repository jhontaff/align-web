import { buildHomeOnboardingSteps } from './home-onboarding-steps';

describe('buildHomeOnboardingSteps', () => {
  it('apunta al botón de crear y al resumen de tarjetas', () => {
    const steps = buildHomeOnboardingSteps();

    expect(steps).toHaveSize(3);
    expect(steps[0].element).toBeUndefined(); // bienvenida, centrada
    expect(steps[1].element).toBe('[aria-label="Crear"]');
    expect(steps[2].element).toBe('.home-grid');
  });
});

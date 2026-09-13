import { buildHabitCardOnboardingSteps } from './habit-card-onboarding-steps';

describe('buildHabitCardOnboardingSteps', () => {
  it('apunta al enlace de detalle, el lápiz de editar y el check', () => {
    const steps = buildHabitCardOnboardingSteps();

    expect(steps).toHaveSize(4);
    expect(steps[0].element).toBeUndefined(); // bienvenida, centrada
    expect(steps[1].element).toBe('.habit-card__link');
    expect(steps[2].element).toBe('.habit-card__edit');
    expect(steps[3].element).toBe('.habit-check');
  });
});

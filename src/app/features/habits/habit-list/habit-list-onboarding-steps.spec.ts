import { buildHabitListOnboardingSteps } from './habit-list-onboarding-steps';

describe('buildHabitListOnboardingSteps', () => {
  it('apunta al alta rápida de hábitos', () => {
    const steps = buildHabitListOnboardingSteps();

    expect(steps).toHaveSize(2);
    expect(steps[0].element).toBeUndefined(); // bienvenida, centrada
    expect(steps[1].element).toBe('app-habit-fields');
  });
});

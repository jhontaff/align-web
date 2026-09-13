import { buildTaskListOnboardingSteps } from './task-list-onboarding-steps';

describe('buildTaskListOnboardingSteps', () => {
  it('apunta al botón de crear tarea', () => {
    const steps = buildTaskListOnboardingSteps();

    expect(steps).toHaveSize(2);
    expect(steps[0].element).toBeUndefined(); // bienvenida, centrada
    expect(steps[1].element).toBe('a[href="/tasks/new"]');
  });
});

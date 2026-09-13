import { buildTaskItemOnboardingSteps } from './task-item-onboarding-steps';

describe('buildTaskItemOnboardingSteps', () => {
  it('apunta al título, los badges de estado/prioridad y el botón de eliminar', () => {
    const steps = buildTaskItemOnboardingSteps();

    expect(steps).toHaveSize(4);
    expect(steps[0].element).toBeUndefined(); // bienvenida, centrada
    expect(steps[1].element).toBe('.task-item__link');
    expect(steps[2].element).toBe('.task-item__meta');
    expect(steps[3].element).toBe('.task-item__delete');
  });
});

import { buildDetailOnboardingSteps } from './detail-onboarding-steps';

describe('buildDetailOnboardingSteps', () => {
  it('apunta a la tarjeta de información, editar y eliminar, con el prefijo dado', () => {
    const steps = buildDetailOnboardingSteps('task', 'la tarea');

    expect(steps).toHaveSize(4);
    expect(steps[0].element).toBeUndefined(); // bienvenida, centrada
    expect(steps[0].popover?.description).toContain('la tarea');
    expect(steps[1].element).toBe('article.card');
    expect(steps[2].element).toBe('.task-detail__edit');
    expect(steps[3].element).toBe('.task-detail__delete');
  });

  it('cambia el selector según el prefijo de la feature', () => {
    const steps = buildDetailOnboardingSteps('habit', 'el hábito');

    expect(steps[2].element).toBe('.habit-detail__edit');
    expect(steps[3].element).toBe('.habit-detail__delete');
  });
});

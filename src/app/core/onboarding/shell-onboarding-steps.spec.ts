import { buildShellOnboardingSteps } from './shell-onboarding-steps';

describe('buildShellOnboardingSteps', () => {
  it('en escritorio, apunta a los enlaces del sidebar y a la burbuja de chat', () => {
    const steps = buildShellOnboardingSteps(true);

    expect(steps).toHaveSize(6);
    expect(steps[0].element).toBeUndefined(); // paso de bienvenida, centrado
    expect(steps[1].element).toBe('.sidebar-nav__link[href="/"]');
    expect(steps[2].element).toBe('.sidebar-nav__link[href="/tasks"]');
    expect(steps[3].element).toBe('.sidebar-nav__link[href="/finance"]');
    expect(steps[4].element).toBe('.sidebar-nav__link[href="/habits"]');
    expect(steps[5].element).toBe('.chat-fab');
  });

  it('en móvil, apunta a los enlaces de la barra inferior y a su botón de chat', () => {
    const steps = buildShellOnboardingSteps(false);

    expect(steps[1].element).toBe('.bottom-nav__link[href="/"]');
    expect(steps[2].element).toBe('.bottom-nav__link[href="/tasks"]');
    expect(steps[3].element).toBe('.bottom-nav__link[href="/finance"]');
    expect(steps[4].element).toBe('.bottom-nav__link[href="/habits"]');
    expect(steps[5].element).toBe('button.bottom-nav__link');
  });
});

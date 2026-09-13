import { buildOverviewOnboardingSteps } from './overview-onboarding-steps';

describe('buildOverviewOnboardingSteps', () => {
  it('apunta a los elementos que siempre están, con o sin movimientos', () => {
    const steps = buildOverviewOnboardingSteps();

    expect(steps).toHaveSize(6);
    expect(steps[0].element).toBeUndefined(); // bienvenida, centrada
    expect(steps[1].element).toBe('app-date-range-picker');
    expect(steps[2].element).toBe('section[aria-labelledby="balance-heading"]');
    expect(steps[3].element).toBe('.dashboard-action');
    expect(steps[4].element).toBe('a[href="/finance/new"]');
    expect(steps[5].element).toBe('[aria-labelledby="recent-heading"]');
  });
});

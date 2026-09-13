import { hasSeenTour, markTourSeen } from './tour-storage';

describe('tour-storage', () => {
  afterEach(() => {
    localStorage.removeItem('align_onboarding_seen_a');
    localStorage.removeItem('align_onboarding_seen_b');
  });

  it('sin flag guardado, no se ha visto', () => {
    expect(hasSeenTour('a')).toBeFalse();
  });

  it('tras marcarlo, se ha visto', () => {
    markTourSeen('a');
    expect(hasSeenTour('a')).toBeTrue();
    expect(localStorage.getItem('align_onboarding_seen_a')).toBe('1');
  });

  it('cada tour tiene su propia clave, independiente de las demás', () => {
    markTourSeen('a');
    expect(hasSeenTour('b')).toBeFalse();
  });
});

import { buildChatPanelOnboardingSteps } from './chat-panel-onboarding-steps';

describe('buildChatPanelOnboardingSteps', () => {
  it('apunta al campo, el micrófono y el botón de enviar del compositor', () => {
    const steps = buildChatPanelOnboardingSteps();

    expect(steps).toHaveSize(4);
    expect(steps[0].element).toBeUndefined(); // bienvenida, centrada
    expect(steps[1].element).toBe('.chat-composer textarea');
    expect(steps[2].element).toBe('.chat-composer__mic');
    expect(steps[3].element).toBe('.chat-composer__send');
  });
});

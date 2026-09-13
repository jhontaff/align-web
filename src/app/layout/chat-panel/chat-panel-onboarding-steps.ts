import type { DriveStep } from 'driver.js';

/**
 * Solo selectores string, nunca imports de `features/chat/`: es el mismo
 * acoplamiento débil que ya usa `shell-onboarding-steps.ts` contra
 * `SidebarNav`/`BottomNav`, y es lo que permite que este archivo viva en
 * `layout/chat-panel/` sin romper la regla "layout → feature, nunca al
 * revés".
 *
 * El paso del micrófono se centra solo si no existe (Firefox no soporta
 * `SpeechRecognition`, y `chat-composer` oculta el botón entero ahí) —
 * driver.js degrada con gracia ante un `element` que no resuelve, no hace
 * falta `skipMissingElement`.
 */
export function buildChatPanelOnboardingSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: 'Tu asistente',
        description: 'Pídele que cree o consulte tareas, movimientos y hábitos por ti.'
      }
    },
    {
      element: '.chat-composer textarea',
      popover: { title: 'Escribe aquí', description: 'Cuéntale lo que necesitas.' }
    },
    {
      element: '.chat-composer__mic',
      popover: { title: 'Dictado por voz', description: 'Mantén pulsado para hablar en vez de escribir.' }
    },
    {
      element: '.chat-composer__send',
      popover: { title: 'Enviar', description: 'Manda tu mensaje al asistente.' }
    }
  ];
}

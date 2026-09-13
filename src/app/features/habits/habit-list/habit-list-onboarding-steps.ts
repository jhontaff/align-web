import type { DriveStep } from 'driver.js';

/**
 * Solo el alta rápida: el bloque de notificaciones es condicional
 * (`@if (push.supported())`) y las tarjetas de hábito no existen con la
 * lista vacía, que es el caso normal en una cuenta nueva.
 */
export function buildHabitListOnboardingSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: 'Hábitos',
        description: 'Sigue tu racha diaria.'
      }
    },
    {
      element: 'app-habit-fields',
      popover: { title: 'Crea tu primer hábito', description: 'Escribe el nombre y añádelo.' }
    }
  ];
}

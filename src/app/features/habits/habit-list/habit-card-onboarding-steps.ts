import type { DriveStep } from 'driver.js';

/**
 * Se dispara al crear el primer hábito, no al montar la pantalla: hasta ese
 * momento no hay ninguna `.habit-card` real que señalar (ver
 * `habit-list-onboarding-steps.ts`, que se limita al alta rápida por esa
 * misma razón).
 */
export function buildHabitCardOnboardingSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: '¡Hábito creado!',
        description: 'Así se ve tu tarjeta. Un vistazo rápido a lo que puedes hacer con ella.'
      }
    },
    {
      element: '.habit-card__link',
      popover: { title: 'Ver detalle', description: 'Toca el nombre para ver toda la información.' }
    },
    {
      element: '.habit-card__edit',
      popover: { title: 'Editar', description: 'El lápiz te deja cambiar el nombre.' }
    },
    {
      element: '.habit-check',
      popover: { title: 'Marcar como hecho', description: 'Pulsa el check cuando completes el hábito hoy.' }
    }
  ];
}

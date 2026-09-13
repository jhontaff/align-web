import type { DriveStep } from 'driver.js';

/**
 * Se dispara cuando la lista tiene al menos una tarea, no al montar la
 * pantalla: hasta entonces no hay ningún `.task-item` real que señalar (ver
 * `task-list-onboarding-steps.ts`, que por eso se limita al botón de crear).
 * En la práctica, la primera vez que esto ocurre es justo al volver de crear
 * la primera tarea.
 *
 * A diferencia de Hábitos, aquí no hay lápiz de editar ni check dentro de la
 * fila: editar se hace desde el detalle (tocando el título), y no existe un
 * "marcar hecho" de un toque — el estado se cambia desde el propio detalle.
 */
export function buildTaskItemOnboardingSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: '¡Tarea creada!',
        description: 'Así se ve cada tarea en tu lista.'
      }
    },
    {
      element: '.task-item__link',
      popover: { title: 'Ver y editar', description: 'Toca el título para abrir el detalle completo.' }
    },
    {
      element: '.task-item__meta',
      popover: {
        title: 'Estado y prioridad',
        description: 'De un vistazo, cómo va y qué tan urgente es.'
      }
    },
    {
      element: '.task-item__delete',
      popover: { title: 'Eliminar', description: 'La papelera la borra de forma permanente.' }
    }
  ];
}

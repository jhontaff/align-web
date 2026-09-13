import type { DriveStep } from 'driver.js';

/**
 * Se limita a lo que `task-list.html` siempre tiene, con o sin tareas: una
 * cuenta nueva no tiene ninguna, así que un paso apuntando a `.task-item`
 * fallaría (o driver.js lo centraría en silencio) para el caso justo que más
 * importa, el primero.
 */
export function buildTaskListOnboardingSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: 'Tareas',
        description: 'Aquí organizas tus pendientes.'
      }
    },
    {
      element: 'a[href="/tasks/new"]',
      popover: { title: 'Crea una tarea', description: 'Empieza por aquí.' }
    }
  ];
}

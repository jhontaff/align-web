import type { DriveStep } from 'driver.js';

/**
 * Pasos genéricos para una pantalla de detalle (tarea, movimiento, hábito):
 * la tarjeta de información, editar y eliminar.
 *
 * Las tres pantallas comparten la misma anatomía —`.<featurePrefix>-detail__edit`,
 * `.<featurePrefix>-detail__delete`, un `article.card` con el cuerpo— y solo
 * cambia el texto, así que esto vive en `core/` en vez de triplicarse en cada
 * feature: es exactamente el caso que la regla de "Folder placement" de
 * CLAUDE.md contempla — una pieza que varias features necesitan sube, no se
 * importa cruzada entre ellas.
 */
export function buildDetailOnboardingSteps(featurePrefix: string, noun: string): DriveStep[] {
  return [
    {
      popover: {
        title: 'Detalle',
        description: `Aquí ves toda la información de ${noun}.`
      }
    },
    {
      element: 'article.card',
      popover: { title: 'La información', description: 'Todo lo que se guardó, de un vistazo.' }
    },
    {
      element: `.${featurePrefix}-detail__edit`,
      popover: { title: 'Editar', description: 'Cambia lo que haga falta.' }
    },
    {
      element: `.${featurePrefix}-detail__delete`,
      popover: { title: 'Eliminar', description: 'La borra de forma permanente.' }
    }
  ];
}

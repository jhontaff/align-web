import type { DriveStep } from 'driver.js';

/**
 * El botón de crear es el paso importante: es el único atajo que permite dar
 * de alta una tarea, un movimiento o un hábito sin salir de Inicio ni elegir
 * antes a qué pantalla ir. `[aria-label="Crear"]` y no una clase nueva: el
 * botón ya tiene un nombre accesible fijo (no cambia con el estado abierto/
 * cerrado del panel), así que sirve igual de bien como selector.
 */
export function buildHomeOnboardingSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: 'Inicio',
        description: 'Tu resumen del día: tareas, finanzas y hábitos de un vistazo.'
      }
    },
    {
      element: '[aria-label="Crear"]',
      popover: {
        title: 'Crea al instante',
        description: 'Da de alta una tarea, un movimiento o un hábito sin cambiar de pantalla.'
      }
    },
    {
      element: '.home-grid',
      popover: {
        title: 'Tu resumen',
        description: 'El calendario y el estado de cada área, todo en un vistazo.'
      }
    }
  ];
}

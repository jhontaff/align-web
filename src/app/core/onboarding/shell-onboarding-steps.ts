import type { DriveStep } from 'driver.js';

/**
 * Los pasos del tour de bienvenida.
 *
 * Se limita a cromo del shell (nav + chat) a propósito: este servicio vive en
 * `core/` y se dispara al autenticarse desde cualquier ruta —un
 * `hydrateIfAuthenticated()` en recarga puede aterrizar directamente en
 * `/finance` o `/tasks/42`—, así que un `element` de una pantalla ruteada
 * fallaría o se saltaría en silencio la mitad de las veces. `SidebarNav`,
 * `BottomNav` y `ChatPanel` están siempre montados cuando hay sesión, que es
 * la única garantía que esto necesita.
 */
export function buildShellOnboardingSteps(isDesktop: boolean): DriveStep[] {
  const navSelector = isDesktop ? '.sidebar-nav__link' : '.bottom-nav__link';
  // El botón de chat comparte clase con los enlaces de navegación en
  // `bottom-nav`, pero es un `<button>` mientras los destinos son `<a>`.
  const chatSelector = isDesktop ? '.chat-fab' : 'button.bottom-nav__link';

  return [
    {
      popover: {
        title: 'Bienvenido a Align',
        description: 'Una vuelta rápida por lo esencial antes de empezar.'
      }
    },
    {
      element: `${navSelector}[href="/home"]`,
      popover: {
        title: 'Inicio',
        description: 'Tu resumen del día: tareas, finanzas y hábitos de un vistazo.'
      }
    },
    {
      element: `${navSelector}[href="/tasks"]`,
      popover: { title: 'Tareas', description: 'Organiza tus pendientes por aquí.' }
    },
    {
      element: `${navSelector}[href="/finance"]`,
      popover: { title: 'Finanzas', description: 'Sigue tus ingresos y gastos del mes.' }
    },
    {
      element: `${navSelector}[href="/habits"]`,
      popover: { title: 'Hábitos', description: 'Marca tu racha diaria y sigue tu progreso.' }
    },
    {
      element: chatSelector,
      popover: {
        title: 'Tu asistente',
        description: 'Pídele que cree tareas, movimientos o hábitos por ti.'
      }
    }
  ];
}

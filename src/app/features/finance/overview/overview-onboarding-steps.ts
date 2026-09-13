import type { DriveStep } from 'driver.js';

/**
 * Los seis pasos existen siempre, con o sin movimientos en el periodo: las
 * tres cifras, el selector y "Últimos movimientos" tienen su propio estado
 * vacío en vez de desaparecer.
 */
export function buildOverviewOnboardingSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: 'Finanzas',
        description: 'Tu resumen de ingresos y gastos.'
      }
    },
    {
      element: 'app-date-range-picker',
      popover: { title: 'Periodo', description: 'Elige qué mes o rango quieres ver.' }
    },
    {
      element: 'section[aria-labelledby="balance-heading"]',
      popover: { title: 'Tus cifras', description: 'Ingresos, gastos y balance del periodo.' }
    },
    {
      element: '.dashboard-action',
      popover: {
        title: 'Personalizar',
        description: 'Arrastra y redimensiona las tarjetas a tu gusto.'
      }
    },
    {
      element: 'a[href="/finance/new"]',
      popover: { title: 'Nuevo movimiento', description: 'Registra un ingreso o un gasto.' }
    },
    {
      element: '[aria-labelledby="recent-heading"]',
      popover: { title: 'Últimos movimientos', description: 'Tu actividad más reciente.' }
    }
  ];
}

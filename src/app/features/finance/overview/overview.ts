import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Pantalla de aterrizaje de Finanzas — todavía un marcador de posición.
 *
 * Existe porque el nav ya ofrece "Finanzas": sin una ruta real, el enlace
 * caería en el comodín `**` y devolvería al usuario a Inicio sin explicación,
 * que es peor que una pantalla honesta diciendo que aún no está.
 *
 * Cuando llegue la feature de verdad, esto se sustituye por el resumen contra
 * `GET /api/transactions/summary` y entra `activity/` como pantalla hermana —
 * momento en el que sí hace falta un `finance.routes.ts` con su contenedor y
 * su propio `<router-outlet />`. Hoy, con una sola pantalla, ese archivo sería
 * simetría vacía.
 *
 * Sin `.scss`: no hay nada que no cubran `.page` / `.empty-state`.
 */
@Component({
  selector: 'app-finance-overview',
  templateUrl: './overview.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Overview {}

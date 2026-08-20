import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NAV_LINKS } from '../nav-links';

/**
 * Barra de navegación inferior, visible por debajo del breakpoint de
 * escritorio.
 *
 * Es un componente aparte de `sidebar-nav`, y no el mismo con otra clase,
 * porque el marcado y las proporciones son distintos (icono sobre etiqueta,
 * ancho repartido a partes iguales, área táctil mínima). Lo que NO se
 * duplica es la lista de destinos: ambos leen `NAV_LINKS`.
 *
 * Se monta siempre; CSS decide si se ve.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BottomNav {
  protected readonly links = NAV_LINKS;
}

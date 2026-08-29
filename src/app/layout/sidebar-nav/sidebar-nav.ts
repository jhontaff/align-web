import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NAV_LINKS } from '../nav-links';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Navegación lateral, visible a partir del breakpoint de escritorio.
 *
 * Se monta SIEMPRE; es CSS quien decide si se ve (ver `sidebar-nav.scss`).
 * Alternarla con `@if` sobre un signal de breakpoint funcionaría, pero
 * parpadearía en la primera pintura y metería en TypeScript una decisión que
 * es de layout. El signal de breakpoint se reserva para lo que CSS no puede
 * hacer.
 *
 * No inyecta nada: los enlaces vienen de `NAV_LINKS`, compartido con
 * `bottom-nav`.
 */
@Component({
  selector: 'app-sidebar-nav',
  imports: [RouterLink, RouterLinkActive, Icon],
  templateUrl: './sidebar-nav.html',
  styleUrl: './sidebar-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarNav {
  protected readonly links = NAV_LINKS;
}

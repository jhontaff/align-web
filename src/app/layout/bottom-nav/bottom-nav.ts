import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NAV_LINKS } from '../nav-links';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Barra inferior, visible por debajo del breakpoint de escritorio.
 *
 * Cuatro pestañas: los tres destinos de `NAV_LINKS` más el chat. El chat NO
 * está en `NAV_LINKS` a propósito: esa constante son *rutas*, y las consume
 * también `sidebar-nav`. El chat no navega, alterna un panel — meterlo dentro
 * obligaría a convertir `NavLink` en una unión discriminada y a que el sidebar
 * filtrase la variante que no sabe pintar, para un solo elemento. Se declara
 * aquí, que es el único sitio donde se usa.
 *
 * El estado abierto/cerrado del panel NO vive aquí: lo posee `App`, que es
 * quien monta a la vez esta barra y `ChatPanel`. Duplicarlo en los dos daría
 * dos verdades para la misma pregunta; subirlo a un servicio global sería
 * inventar un singleton para coordinar a dos hermanos que ya tienen padre.
 */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, Icon],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BottomNav {
  protected readonly links = NAV_LINKS;

  readonly chatOpen = input(false);

  readonly chatToggle = output<void>();

  /**
   * Navegar con el chat abierto tiene que cerrarlo: en móvil el panel tapa la
   * pantalla entera, así que si no, el usuario cambia de sección y no ve nada
   * cambiar.
   *
   * No hace falta comprobar el breakpoint para saber que esto es móvil: en
   * escritorio esta barra es `display: none` y sus enlaces no se pueden pulsar.
   */
  readonly chatClose = output<void>();
}

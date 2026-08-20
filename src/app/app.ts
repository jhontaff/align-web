import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStateService } from './core/auth/auth-state.service';
import { AppHeader } from './layout/app-header/app-header';
import { BottomNav } from './layout/bottom-nav/bottom-nav';
import { ChatPanel } from './layout/chat-panel/chat-panel';
import { SidebarNav } from './layout/sidebar-nav/sidebar-nav';

/**
 * El shell. Un solo `<router-outlet />` que no se desmonta nunca, y a su lado
 * el cromo persistente (header y panel de chat).
 *
 * `AppHeader` y `ChatPanel` se importan de forma estática, no con
 * `loadComponent`: no son rutas, están montados desde el primer pintado y
 * sobreviven a toda navegación. Ese es justamente el motivo de que el chat
 * viva aquí y no dentro de un componente ruteado, donde Angular lo destruiría
 * y lo recrearía en cada navegación, perdiendo la conversación en pantalla.
 *
 * `SidebarNav` y `BottomNav` se montan los dos a la vez, siempre: CSS decide
 * cuál se ve. No hay dos shells intercambiables por breakpoint, porque eso
 * movería el `<router-outlet />` de rama y destruiría la pantalla ruteada al
 * cruzar el umbral.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppHeader, SidebarNav, BottomNav, ChatPanel],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  protected readonly authState = inject(AuthStateService);

  constructor() {
    // Un token guardado tiene que rehidratar user/isAuthenticated antes de que
    // el guard evalúe la primera ruta.
    this.authState.hydrateIfAuthenticated();
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStateService } from './core/auth/auth-state.service';
import { AppUpdateService } from './core/pwa/app-update.service';
import { PushService } from './core/notifications/push.service';
import { AppHeader } from './layout/app-header/app-header';
import { BottomNav } from './layout/bottom-nav/bottom-nav';
import { ChatPanel } from './layout/chat-panel/chat-panel';
import { SidebarNav } from './layout/sidebar-nav/sidebar-nav';
import { UpdateBanner } from './layout/update-banner/update-banner';

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
 * `SidebarNav` (escritorio) y `BottomNav` (móvil) se montan los dos a la vez,
 * siempre: CSS decide cuál se ve. No hay dos shells intercambiables por
 * breakpoint, porque eso movería el `<router-outlet />` de rama y destruiría
 * la pantalla ruteada al cruzar el umbral.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppHeader, SidebarNav, BottomNav, ChatPanel, UpdateBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  protected readonly authState = inject(AuthStateService);

  /**
   * Si el panel de chat está abierto.
   *
   * Vive aquí y no dentro de `ChatPanel` porque hay dos disparadores en dos
   * ramas distintas del árbol: la burbuja del propio panel (escritorio) y la
   * pestaña "Chat IA" de `BottomNav` (móvil). `App` es el padre común de los
   * dos, así que es el sitio natural del estado — no hace falta un servicio
   * global para que dos hermanos se pongan de acuerdo.
   */
  protected readonly chatOpen = signal(false);

  protected toggleChat(): void {
    this.chatOpen.update(open => !open);
  }

  protected closeChat(): void {
    this.chatOpen.set(false);
  }

  private readonly push = inject(PushService);
  private readonly appUpdate = inject(AppUpdateService);

  constructor() {
    // Un token guardado tiene que rehidratar user/isAuthenticated antes de que
    // el guard evalúe la primera ruta.
    this.authState.hydrateIfAuthenticated();

    // Los clics en una notificación y los push que llegan con la app abierta se
    // enganchan aquí y no en la pantalla de Hábitos: si vivieran allí, abrir la
    // app desde una notificación cayendo en Inicio no engancharía nada. El
    // shell está montado siempre, que es la única condición que esto pide.
    this.push.listen();

    // Una PWA instalada no se recarga sola: sin esto, el móvil se queda en la
    // versión con la que se instaló aunque el despliegue ya esté hecho. Va aquí
    // por el mismo motivo que `push.listen()` — el shell es lo único montado
    // en todo momento.
    this.appUpdate.listen();
  }
}

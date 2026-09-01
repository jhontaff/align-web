import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStateService } from '../../core/auth/auth-state.service';
import { SessionMenu } from '../session-menu/session-menu';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

/**
 * Marca y acciones de sesión. Cromo del shell: persiste entre navegaciones y
 * no pertenece a ningún dominio, por eso vive en `layout/`.
 *
 * No contiene enlaces de navegación: los destinos se declaran en
 * `layout/nav-links.ts` y los pintan `sidebar-nav` (≥ desktop) y `bottom-nav`
 * (< desktop).
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink, ThemeToggle, SessionMenu],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  /**
   * Se espera a que termine el logout antes de navegar. Dos motivos: la baja
   * del push necesita el token todavía puesto, y navegar antes dejaría /login
   * pintado un instante con el header y el panel de chat encima, que siguen
   * montados mientras la sesión existe.
   */
  protected async onLogout(): Promise<void> {
    await this.authState.logout();
    this.router.navigate(['/login']);
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStateService } from '../../core/auth/auth-state.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

/**
 * Marca y acciones de sesión. Cromo del shell: persiste entre navegaciones y
 * no pertenece a ningún dominio, por eso vive en `layout/`.
 *
 * Ya no contiene enlaces de navegación: los destinos se declaran en
 * `layout/nav-links.ts` y los pintan `sidebar-nav` y `bottom-nav`.
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink, ThemeToggle],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  protected onLogout(): void {
    this.authState.logout();
    this.router.navigate(['/login']);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStateService } from '../../core/auth/auth-state.service';
import { UserService } from '../../features/user/user.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Marca y avatar. Cromo del shell: persiste entre navegaciones y no
 * pertenece a ningún dominio, por eso vive en `layout/`.
 *
 * Tema y cerrar sesión viven en `/profile` (alcanzable desde el avatar, en
 * todos los tamaños de pantalla) — no en el header. Inyecta `UserService`
 * (una feature) por el mismo motivo que `pending-delete-confirm/`: el shell
 * necesita mostrar un dato real de una feature, no reusar su componente.
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink, Avatar, Icon],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);

  protected readonly user = this.authState.user;
  protected readonly avatarUrl = this.userService.avatarUrl;

  // 'anon' de respaldo: mismo caso que `dashboard-layout.ts` (construirse
  // antes de que `GET /api/users/me` resuelva).
  protected readonly avatarSeed = computed(() => this.user()?.id ?? 'anon');

  protected readonly profileLabel = computed(() => {
    const current = this.user();
    return current ? `Perfil de ${current.firstName} ${current.lastName}` : 'Perfil';
  });

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** El engranaje solo vive dentro de /profile — en Home u otra feature no aporta nada. */
  protected readonly showSettings = computed(() => this.currentUrl().startsWith('/profile'));

  // Un `routerLink` a la misma URL no navega: si ya está en /profile, un
  // segundo clic tiene que volver atrás (y así disparar `profileExitGuard`).
  protected onAvatarClick(): void {
    if (this.currentUrl().startsWith('/profile')) {
      this.router.navigateByUrl('/home');
    } else {
      this.router.navigateByUrl('/profile');
    }
  }
}

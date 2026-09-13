import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthStateService } from '../../core/auth/auth-state.service';
import {
  hasDismissedNotificationPrompt,
  markNotificationPromptDismissed
} from '../../core/notifications/notification-prompt-storage';
import { PushService } from '../../core/notifications/push.service';
import { hasSeenTour } from '../../core/onboarding/tour-storage';
import { TourRunnerService } from '../../core/onboarding/tour-runner.service';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';

/**
 * Pide activar notificaciones tras el onboarding de Inicio, una sola vez.
 *
 * Se muestra mientras `push.status()` siga en `'default'` (nunca decidido) y
 * no se haya descartado antes — en cuanto el usuario decide (activa, lo
 * bloquea desde el navegador, o pulsa "Ahora no"), no vuelve a aparecer. Si
 * dice que no, sigue pudiendo activarlas después desde `/profile`.
 *
 * **Espera a que termine el tour `home`** (ver `TourRunnerService.finished$`)
 * en vez de aparecer apenas hay sesión: los dos son overlays de pantalla
 * completa, y mostrarlos a la vez apilaría uno sobre otro. Para un usuario
 * que ya vio ese tour en otra sesión, `hasSeenTour('home')` siembra la
 * condición en `true` desde el arranque y este diálogo se comporta como
 * antes — solo cambia el caso de alguien viéndolo por primera vez.
 */
@Component({
  selector: 'app-notification-prompt',
  imports: [ConfirmDialog],
  templateUrl: './notification-prompt.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationPrompt {
  private readonly authState = inject(AuthStateService);
  private readonly tourRunner = inject(TourRunnerService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly push = inject(PushService);

  private readonly dismissed = signal(hasDismissedNotificationPrompt());
  private readonly homeTourDone = signal(hasSeenTour('home'));

  constructor() {
    this.tourRunner.finished$
      .pipe(
        filter(tourId => tourId === 'home'),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.homeTourDone.set(true));
  }

  protected readonly show = computed(
    () =>
      this.authState.isAuthenticated() &&
      this.push.supported() &&
      this.push.status() === 'default' &&
      !this.dismissed() &&
      this.homeTourDone()
  );

  protected async onConfirm(): Promise<void> {
    await this.push.enable();
  }

  protected onCancel(): void {
    this.dismissed.set(true);
    markNotificationPromptDismissed();
  }
}

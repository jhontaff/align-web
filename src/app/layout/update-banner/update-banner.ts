import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AppUpdateService } from '../../core/pwa/app-update.service';

/**
 * El aviso de "hay versión nueva", con el botón que la aplica.
 *
 * Va en `layout/` y no en una feature: es cromo del shell, no pertenece a
 * ningún dominio y tiene que estar montado siempre —también en login, y sobre
 * todo mientras el usuario está en cualquier pantalla—.
 *
 * **Se ofrece, no se impone.** La alternativa era recargar en cuanto la versión
 * está lista, y eso borra sin avisar el formulario a medio rellenar o el
 * mensaje a medio escribir en el chat. La recarga en sí es barata (el token
 * vive en `localStorage` y la sesión se rehidrata sola); lo que se pierde es lo
 * que hay en pantalla, y eso no es del shell decidirlo.
 *
 * El host es la región `role="status"` y está en el DOM desde el primer
 * pintado, con el aviso apareciendo dentro. Es a propósito: un lector de
 * pantalla no anuncia de forma fiable una región viva que entra en el DOM ya
 * con su contenido: la región tiene que existir antes para que el cambio se
 * note. Mismo motivo que la región del dictado en `chat-composer`.
 */
@Component({
  selector: 'app-update-banner',
  templateUrl: './update-banner.html',
  styleUrl: './update-banner.scss',
  host: { role: 'status' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpdateBanner {
  private readonly updates = inject(AppUpdateService);

  protected readonly ready = this.updates.ready;

  /**
   * El botón se deshabilita al pulsarlo porque entre `activateUpdate()` y la
   * recarga hay unos milisegundos en los que sigue siendo pulsable, y activar
   * dos veces no es una operación inofensiva.
   */
  protected readonly applying = signal(false);

  protected apply(): void {
    if (this.applying()) return;

    this.applying.set(true);
    void this.updates.apply();
  }
}

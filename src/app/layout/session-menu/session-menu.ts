import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthStateService } from '../../core/auth/auth-state.service';
import { BreakpointService } from '../../core/layout/breakpoint.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Cajón deslizante de cuenta para móvil y tablet: tema y cerrar sesión.
 *
 * Sobre el rechazo del 2026-08-20 en `CLAUDE.md`: lo que se descartó entonces
 * fue "un overlay modal entero, con trampa de foco y bloqueo de scroll", y la
 * objeción era el coste —mucha maquinaría de accesibilidad escrita a mano para
 * esconder dos botones—. Ese coste ya no existe: `<dialog>` + `showModal()`
 * trae del navegador la trampa de foco, el cierre con Escape, la inercia del
 * fondo, el top layer y la restauración del foco al cerrar; y el bloqueo de
 * scroll es una regla CSS con `:has()` en `_base.scss`. Lo que queda escrito
 * aquí son cuatro métodos. La decisión de producto (el cajón) es del usuario;
 * lo que cambió es que ya no se paga el precio que motivó el rechazo.
 *
 * Sigue sin contener ni un solo destino: la navegación está en `bottom-nav`,
 * a la vista y a un toque. La otra mitad de aquel rechazo —duplicar la
 * navegación dentro de un cajón— sigue en pie.
 */
@Component({
  selector: 'app-session-menu',
  imports: [ThemeToggle, Icon],
  templateUrl: './session-menu.html',
  styleUrl: './session-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionMenu {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);
  private readonly breakpoint = inject(BreakpointService);

  // Opcional y no `.required`: el efecto de abajo puede correr antes de que la
  // vista exista, y `.required` lanzaría en ese primer paso.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Cerrar el cajón al cruzar a escritorio.
    //
    // Este es el uso legítimo de `effect`: sincronizar un signal con una API
    // imperativa externa (el DOM), igual que `ThemeService` escribiendo
    // `data-theme`. No propaga estado entre signals, que es lo que sí está
    // prohibido.
    //
    // Sin esto, el `:host { display: none }` de escritorio ocultaría un
    // `<dialog>` que sigue abierto: el foco quedaría atrapado en un elemento
    // invisible y `body:has(dialog[open])` mantendría el scroll bloqueado. La
    // app parecería congelada, y se llega ahí solo con rotar un iPad.
    effect(() => {
      if (this.breakpoint.isDesktop()) {
        this.dialog()?.nativeElement.close();
      }
    });
  }

  protected openDrawer(): void {
    this.dialog()?.nativeElement.showModal();
  }

  /**
   * No hay que devolver el foco al disparador a mano: cerrar un `<dialog>`
   * abierto con `showModal()` lo devuelve al elemento que lo tenía antes de
   * abrirse. Escribirlo igualmente sería duplicar el comportamiento del
   * navegador, y hacerlo mal el día que el foco venga de otro sitio.
   */
  protected close(): void {
    this.dialog()?.nativeElement.close();
  }

  /**
   * Un clic sobre el `::backdrop` llega como un `click` cuyo `target` es el
   * propio `<dialog>`; uno sobre el contenido trae el elemento interno. Esa
   * comparación es todo el "cerrar al tocar fuera", y solo funciona con el
   * `<dialog>` sin padding: el relleno también reportaría el diálogo como
   * target y cerraría al pulsar el borde del panel.
   */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.close();
    }
  }

  /** Se espera al logout antes de navegar; ver `AppHeader.onLogout`. */
  protected async onLogout(): Promise<void> {
    this.close();
    await this.authState.logout();
    this.router.navigate(['/login']);
  }
}

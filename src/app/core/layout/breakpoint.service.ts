import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

/**
 * El umbral de escritorio, en píxeles.
 *
 * Está duplicado a propósito con `$breakpoint-desktop` de `styles/_layout.scss`:
 * no hay forma de compartir un número entre SCSS y TypeScript sin build tooling
 * extra, y no compensa. **Si cambia uno, cambia el otro** — igual que la clave
 * `align_theme` entre `index.html` y `ThemeService`.
 */
export const DESKTOP_BREAKPOINT_PX = 1024;

/**
 * Si la ventana está en el rango de escritorio.
 *
 * Mismo patrón que `ThemeService`: un `signal` alimentado por un listener de
 * `matchMedia`, expuesto en solo lectura. Sin `@angular/cdk` — traer el CDK
 * entero para envolver una llamada a `matchMedia` es la abstracción prematura
 * que la filosofía del proyecto descarta.
 *
 * Existe para lo que CSS no puede hacer, no para elegir el layout: la
 * conmutación sidebar/barra inferior sigue siendo media queries. Su primer y
 * único consumidor es `SessionMenu`, que necesita **cerrar** su `<dialog>` al
 * cruzar a escritorio; un `display: none` lo ocultaría dejándolo abierto, con
 * el foco atrapado y el scroll bloqueado, y la app parecería congelada. Eso no
 * es un problema teórico: un iPad en vertical (768px) que rota a horizontal
 * (1024px) cruza el umbral con el cajón abierto.
 */
@Injectable({ providedIn: 'root' })
export class BreakpointService {
  private readonly document = inject(DOCUMENT);

  private readonly query = this.document.defaultView?.matchMedia(
    `(min-width: ${DESKTOP_BREAKPOINT_PX}px)`
  );

  private readonly _isDesktop = signal(this.query?.matches ?? false);

  readonly isDesktop = this._isDesktop.asReadonly();

  constructor() {
    this.query?.addEventListener('change', event => this._isDesktop.set(event.matches));
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';

const PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: 'sistema',
  light: 'claro',
  dark: 'oscuro'
};

const NEXT_LABEL: Record<ThemePreference, string> = {
  system: 'claro',
  light: 'oscuro',
  dark: 'sistema'
};

/**
 * Botón cíclico de tema: sistema → claro → oscuro → sistema.
 *
 * Dos presentaciones del mismo control, porque tiene dos sitios donde vivir:
 * suelto en el header de escritorio (`icon`) y como fila del desplegable de
 * móvil (`menu`). Es la variante ganada al segundo uso que pide el design
 * system, no una API adivinada de antemano: lo único que cambia es la pintura
 * y si la etiqueta se ve o solo se anuncia.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [],
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThemeToggle {
  private readonly themeService = inject(ThemeService);

  /** `icon` = solo icono (header). `menu` = fila con etiqueta (desplegable). */
  readonly variant = input<'icon' | 'menu'>('icon');

  protected readonly preference = this.themeService.preference;

  protected readonly currentLabel = computed(() => PREFERENCE_LABEL[this.preference()]);
  protected readonly nextLabel = computed(() => NEXT_LABEL[this.preference()]);

  // Con dos estados el botón podía anunciar el destino; con tres, el usuario
  // perdería de vista en cuál está. Así que el icono muestra el estado actual
  // y la etiqueta carga con la acción.
  protected readonly label = computed(
    () => `Tema: ${this.currentLabel()}. Cambiar a ${this.nextLabel()}`
  );

  protected readonly status = computed(() => `Tema: ${this.currentLabel()}`);

  protected readonly buttonClass = computed(() =>
    this.variant() === 'menu' ? 'menu-item' : 'btn btn-ghost btn-icon'
  );

  /**
   * En la variante `menu` el texto ya está en pantalla, así que un `aria-label`
   * lo SUSTITUIRÍA por otro distinto: el nombre accesible dejaría de contener
   * la etiqueta visible y rompería el criterio de "label in name" (WCAG 2.5.3),
   * que es lo que permite a quien usa control por voz decir lo que lee. Ahí el
   * nombre se compone del texto visible más un sufijo oculto.
   */
  protected readonly ariaLabel = computed(() => (this.variant() === 'icon' ? this.label() : null));

  protected onCycle(): void {
    this.themeService.cycle();
  }
}

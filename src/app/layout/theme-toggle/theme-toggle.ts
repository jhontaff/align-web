import { Component, computed, inject } from '@angular/core';
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

@Component({
  selector: 'app-theme-toggle',
  imports: [],
  templateUrl: './theme-toggle.html'
})
export class ThemeToggle {
  private readonly themeService = inject(ThemeService);

  protected readonly preference = this.themeService.preference.asReadonly();

  // Con dos estados el botón podía anunciar el destino; con tres, el usuario
  // perdería de vista en cuál está. Así que el icono muestra el estado actual
  // y la etiqueta carga con la acción.
  protected readonly label = computed(() => {
    const current = this.preference();
    return `Tema: ${PREFERENCE_LABEL[current]}. Cambiar a ${NEXT_LABEL[current]}`;
  });

  protected readonly status = computed(() => `Tema: ${PREFERENCE_LABEL[this.preference()]}`);

  protected onCycle(): void {
    this.themeService.cycle();
  }
}

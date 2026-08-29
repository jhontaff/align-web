import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ICONS, IconName } from './icon-set';

/**
 * Un icono del set de Bootstrap Icons (vía Iconify), pintado como SVG en línea.
 *
 * Primitiva de `shared/ui/`: solo inputs, sin dominio, sin inyección de
 * servicios de negocio. Recibe un nombre —un primitivo— y nada más.
 *
 * Hereda color y tamaño del texto (`currentColor`, `1em`), así que el
 * consumidor lo dimensiona con `font-size` desde su propia hoja en vez de
 * pasar un input de tamaño: es una decisión de layout del sitio donde se monta.
 *
 * `aria-hidden` es fijo y no configurable: un icono siempre acompaña a un
 * nombre accesible que pone el consumidor (texto visible, `aria-label` o un
 * `visually-hidden`). Dejar que un icono aporte el nombre accesible es cómo se
 * acaba con botones que se anuncian como "imagen".
 */
@Component({
  selector: 'app-icon',
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Icon {
  readonly name = input.required<IconName>();

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly viewBox = computed(() => ICONS[this.name()].viewBox);

  /**
   * El sanitizador de Angular borra los elementos SVG de un `innerHTML`, así
   * que sin el bypass el icono se inserta vacío.
   *
   * Es seguro porque el contenido no es dato de usuario ni respuesta del
   * backend: es una constante compilada por `tools/generate-icons.mjs` desde un
   * paquete npm, fijada en el bundle. La regla que lo mantiene seguro es que
   * `name` sea una `IconName` —una union cerrada— y no un `string` cualquiera.
   */
  protected readonly body = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()].body)
  );
}

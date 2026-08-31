import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/ui/icon/icon';
import { IconName } from '../../../../shared/ui/icon/icon-set';

/**
 * Contador para dar un `id` unico a cada encabezado.
 *
 * Hace falta porque la tarjeta es una `<section>` con `aria-labelledby`, y ese
 * atributo apunta a un id: con tres instancias en la misma pagina, un id fijo
 * las dejaria a las tres nombradas "Tareas". Un contador de modulo basta —
 * nunca se reinicia dentro de una carga de pagina, que es el unico ambito en
 * el que un id debe ser unico.
 */
let nextId = 0;

/**
 * El armazon de una tarjeta del panel de Inicio: cabecera con icono y titulo,
 * el cuerpo que le proyecten, y un pie opcional con enlace a la seccion.
 *
 * **Tonto**: solo inputs y `ng-content`, sin inyeccion de servicios ni DTOs de
 * dominio. Las tres tarjetas de Inicio son las que saben de tareas, dinero y
 * habitos; esta solo sabe de un titulo, un icono y una ruta.
 *
 * Vive en `features/home/components/` y **no** en `shared/ui/` aunque tenga
 * tres consumidores: los tres estan dentro de Home. `shared/ui/` es para
 * primitivas que usan dos features distintas, y subirlo antes de que exista la
 * segunda es adivinar la API con un solo caso real. Si manana Finanzas quiere
 * este mismo armazon, entonces sube.
 *
 * La alternativa era triplicar el cromo en las tres hojas o subir las clases a
 * `_components.scss`. Lo segundo es lo que se hizo con `.menu-item`, pero alli
 * eran cuatro declaraciones de pintura sobre un elemento que el consumidor ya
 * escribia; esto tiene estructura y variantes, que es el otro lado del corte.
 */
@Component({
  selector: 'app-summary-card',
  imports: [RouterLink, Icon],
  templateUrl: './summary-card.html',
  styleUrl: './summary-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryCard {
  readonly heading = input.required<string>();
  readonly icon = input.required<IconName>();

  /**
   * Ruta de la seccion completa, o `undefined` si todavia no existe.
   *
   * Opcional a proposito y no una cadena vacia: Habitos no tiene pantalla, y
   * la regla del proyecto es que **un enlace muerto es peor que su ausencia**
   * — la misma que dejo al resumen de Finanzas sin "ver todos" mientras no
   * existiera `activity/`. Sin `link`, el pie no se pinta.
   */
  readonly link = input<string>();

  /**
   * Texto del enlace del pie. Se escribe entero ("Ver todas las tareas") en vez
   * de un "Ver todas" generico: en una pagina con tres tarjetas, tres enlaces
   * llamados igual son indistinguibles al navegar por lista de enlaces.
   */
  readonly linkLabel = input<string>('');

  protected readonly headingId = `summary-card-${nextId++}`;
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
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
 * El tono de dominio de una tarjeta.
 *
 * Es una union cerrada y no un `string` de clase suelto: el mapeo dominio ->
 * semantica lo decide el sistema de diseno, no cada consumidor. Con `string`,
 * una tarjeta podria pedir `'brand'` y quedarse sin pintar sin un solo error.
 */
export type SummaryTone = 'primary' | 'success' | 'warning';

/**
 * El armazon de una tarjeta del panel de Inicio: cabecera con icono, titulo y
 * distintivo de alcance, el cuerpo que le proyecten, y un pie opcional con
 * enlace a la seccion.
 *
 * **Tonto**: solo inputs y `ng-content`, sin inyeccion de servicios ni DTOs de
 * dominio. Las tres tarjetas de Inicio son las que saben de tareas, dinero y
 * habitos; esta solo sabe de un titulo, un icono, un tono y una ruta.
 *
 * Vive en `features/home/components/` y **no** en `shared/ui/` aunque tenga
 * tres consumidores: los tres estan dentro de Home. `shared/ui/` es para
 * primitivas que usan dos features distintas, y subirlo antes de que exista la
 * segunda es adivinar la API con un solo caso real. Si manana Finanzas quiere
 * este mismo armazon, entonces sube.
 *
 * La alternativa era triplicar el cromo en las tres hojas o subir las clases a
 * `_components.scss`. Lo segundo es lo que se hizo con `.menu-item` y con la
 * anatomia del cuerpo (`.card-metric`, `.card-row`), pero alli son
 * declaraciones de pintura sobre elementos que el consumidor ya escribe; esto
 * tiene estructura y variantes, que es el otro lado del corte.
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
   * Tono de dominio: tine el icono de la cabecera y el distintivo.
   *
   * Sale del mapeo que ya usan los badges de Tareas y las cifras de Finanzas
   * —tareas a `primary`, dinero a `success`, habitos a `warning`—, asi que el
   * tema oscuro sale gratis y ninguna tarjeta define un color propio.
   */
  readonly tone = input<SummaryTone>('primary');

  /**
   * Texto del distintivo de la cabecera ("Este mes", "Pendientes").
   *
   * Dice el **alcance de la cifra**, que es lo que una cifra grande sin
   * contexto no puede decir por si sola: "$1.240" no distingue el mes en curso
   * del historico entero. Sin `badge`, no se pinta.
   */
  readonly badge = input<string>();

  /**
   * Ruta de la seccion completa, o `undefined` si todavia no existe.
   *
   * Opcional a proposito y no una cadena vacia: la regla del proyecto es que
   * **un enlace muerto es peor que su ausencia** — la misma que dejo al
   * resumen de Finanzas sin "ver todos" mientras no existiera `activity/`.
   * Sin `link`, el pie no se pinta.
   */
  readonly link = input<string>();

  /**
   * Texto del enlace del pie. Se escribe entero ("Ver todas las tareas") en vez
   * de un "Ver todas" generico: en una pagina con tres tarjetas, tres enlaces
   * llamados igual son indistinguibles al navegar por lista de enlaces.
   */
  readonly linkLabel = input<string>('');

  /**
   * `[class]` con una cadena calculada, y no tres `[class.badge--x]`.
   *
   * Se puede porque el elemento **no lleva `class` estatico**: no hay nada que
   * Angular tenga que fusionar, asi que la cadena es la lista completa. En la
   * `<section>` no se hace igual —alli si hay clases estaticas (`card`)— y por
   * eso el tono va con enlaces booleanos.
   */
  protected readonly badgeClass = computed(() => `badge badge--${this.tone()}`);

  protected readonly headingId = `summary-card-${nextId++}`;
}

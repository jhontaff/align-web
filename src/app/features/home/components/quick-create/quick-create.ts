import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  inject,
  output,
  signal,
  viewChild,
  viewChildren
} from '@angular/core';
import { DataRefreshService } from '../../../../core/data/data-refresh.service';
import { prefersReducedMotion } from '../../../../core/dom/prefers-reduced-motion';
import { Icon } from '../../../../shared/ui/icon/icon';
import { IconName } from '../../../../shared/ui/icon/icon-set';
import { EventFields } from '../../../calendar/components/event-fields/event-fields';
import { HabitFields } from '../../../habits/components/habit-fields/habit-fields';
import { TaskFields } from '../../../tasks/components/task-fields/task-fields';
import { TransactionFields } from '../../../finance/components/transaction-fields/transaction-fields';

/** Mismo motivo que en `event-edit`/`confirm-dialog`: `id` es global al documento. */
let nextId = 0;

export type QuickCreateTabId = 'event' | 'task' | 'transaction' | 'habit';

interface QuickCreateTab {
  readonly id: QuickCreateTabId;
  readonly label: string;
  readonly icon: IconName;
  /** Lo que anuncia la región `role="status"` de Inicio al terminar. */
  readonly createdLabel: string;
}

/**
 * Las pestañas se nombran por LO QUE SE CREA, no por el dominio: "Movimiento" y
 * no "Finanzas", "Hábito" y no "Hábitos". La pregunta que responde una pestaña
 * aquí es "¿qué estoy creando?", y mezclar entidades con secciones —"Evento",
 * "Tarea", "Finanzas"— deja al usuario adivinando si "Finanzas" abre un
 * formulario o un informe. Coinciden además con el título que ya usan las
 * pantallas de alta ("Nuevo movimiento", "Nueva tarea").
 */
const TABS: readonly QuickCreateTab[] = [
  { id: 'event', label: 'Evento', icon: 'bi:calendar3', createdLabel: 'Evento creado.' },
  { id: 'task', label: 'Tarea', icon: 'bi:check2-circle', createdLabel: 'Tarea creada.' },
  { id: 'transaction', label: 'Movimiento', icon: 'bi:wallet2', createdLabel: 'Movimiento creado.' },
  { id: 'habit', label: 'Hábito', icon: 'bi:fire', createdLabel: 'Hábito creado.' }
];

/**
 * El panel de creación rápida de Inicio: un cuadro flotante con una pestaña por
 * dominio, cada una con el formulario de alta de ese dominio.
 *
 * **La chrome es la misma burbuja que `EventEdit`** (`<dialog>` + `showModal()`,
 * `::backdrop` con `--color-scrim`, entrada con `@starting-style`); lo único que
 * se añade dentro es la barra de pestañas. Los cuatro formularios son los
 * mismos componentes que usan las pantallas de alta —`EventFields`,
 * `TaskFields`, `TransactionFields`, `HabitFields`—, no copias: por eso existe
 * ese corte, ver el comentario de `TaskFields`.
 *
 * **Vive en `features/home/` porque importa de cuatro features a la vez**, que
 * es la excepción direccional de Inicio (`home -> feature`) que ya usa
 * `CalendarWidget`. No va en `layout/`: no es cromo del shell, no sobrevive a la
 * navegación y solo lo abre un botón de una pantalla.
 *
 * **Los cuatro paneles se montan a la vez y se ocultan con `[hidden]`**, en vez
 * de un `@switch` que destruya el que se deja. Cambiar de pestaña con media
 * tarea escrita y volver para encontrarla en blanco es pérdida de datos
 * silenciosa; `display: none` los saca igual del orden de tabulación y del árbol
 * de accesibilidad, así que no hay que pagar nada por conservarlos. Lo que NO
 * sobrevive es cerrar el diálogo: ahí el componente entero se desmonta, que es
 * lo que un modal promete.
 */
@Component({
  selector: 'app-quick-create',
  imports: [Icon, EventFields, TaskFields, TransactionFields, HabitFields],
  templateUrl: './quick-create.html',
  styleUrl: './quick-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuickCreate {
  private readonly dataRefresh = inject(DataRefreshService);
  private readonly injector = inject(Injector);

  /** La animación de alto en curso, para poder cancelarla — ver `select()`. */
  private resize: Animation | null = null;

  readonly close = output<void>();

  /** Se creó algo. Lo anuncia Inicio, que sigue montado cuando este panel ya no. */
  readonly created = output<string>();

  private readonly id = nextId++;
  protected readonly titleId = `quick-create-title-${this.id}`;

  // Opcional a propósito, mismo motivo que en `event-edit`: el efecto de abajo
  // puede correr antes de que la vista exista.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  protected readonly tabs = TABS;
  protected readonly active = signal<QuickCreateTabId>('event');

  constructor() {
    // `afterRenderEffect` y no `effect`: hay que LEER si la vista existe ya, y
    // eso solo es cierto una vez pintada. Mismo patrón que `EventEdit`.
    afterRenderEffect(() => {
      const el = this.dialog()?.nativeElement;

      if (!el || el.open) {
        return;
      }

      el.showModal();

      // `showModal()` deja el foco en el primer elemento enfocable, que aquí es
      // la X de cerrar — aterrizar en "cerrar" al abrir algo es justo lo
      // contrario de lo que se venía a hacer. Se lleva a la pestaña activa, que
      // además es lo que anuncia que hay pestañas. Va dentro del `if` y no
      // fuera, así que ocurre una vez por apertura y no en cada repintado.
      this.focusActiveTab();
    });
  }

  protected tabId(id: QuickCreateTabId): string {
    return `quick-create-tab-${this.id}-${id}`;
  }

  protected panelId(id: QuickCreateTabId): string {
    return `quick-create-panel-${this.id}-${id}`;
  }

  /**
   * Cambia de pestaña y lleva el diálogo a su alto nuevo animado.
   *
   * **Por qué esto no es CSS.** La altura del diálogo no está declarada: la
   * decide su contenido. `transition: height` no dispara porque el valor
   * computado es `auto` antes y después — no hay cambio de propiedad que
   * interpolar, solo un reflow. Y `interpolate-size: allow-keywords` tampoco
   * sirve: habilita `auto` como EXTREMO cuando el valor declarado cambia (de `0`
   * a `auto`, por ejemplo), no cuando el contenido se reorganiza bajo un `auto`
   * constante. La única vía es medir los dos altos y animar entre ellos, que es
   * la misma técnica FLIP que ya usa `HabitList` para reordenar tarjetas.
   *
   * Se mide ANTES de tocar el signal (el alto viejo) y otra vez en
   * `afterNextRender` (el nuevo, que solo es correcto una vez pintado el panel
   * de la pestaña nueva) — mismo motivo que documenta `reorderAnimated`.
   *
   * No lleva `fill`, así que al terminar el elemento vuelve a su alto natural y
   * no queda ningún estilo en línea que pelee con el `max-height`.
   */
  protected select(id: QuickCreateTabId): void {
    if (id === this.active()) {
      return;
    }

    const el = this.dialog()?.nativeElement;

    // Un cambio de tamaño de media pantalla es justo el movimiento que hay que
    // no hacer si el usuario pidió menos.
    if (!el || prefersReducedMotion()) {
      this.active.set(id);
      return;
    }

    const from = el.getBoundingClientRect().height;
    this.active.set(id);

    afterNextRender(
      () => {
        const to = el.getBoundingClientRect().height;

        // Los dos formularios tocaban el tope de `max-height`, así que no hay
        // nada que animar: sin esto se lanzaría una animación de cero píxeles en
        // cada toque.
        if (Math.abs(to - from) < 1) {
          return;
        }

        // Se cancela la anterior en vez de dejar que se solapen: tocando rápido
        // entre pestañas se acumulan animaciones sobre la misma propiedad y el
        // alto va dando tirones hacia atrás.
        this.resize?.cancel();
        this.resize = el.animate(
          [{ height: `${from}px` }, { height: `${to}px` }],
          // Salida rápida y frenada larga, igual que el reordenado de Hábitos: el
          // ojo engancha el arranque y llega con tiempo de sobra al destino.
          { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
        );
      },
      { injector: this.injector }
    );
  }

  /**
   * Flechas, Inicio y Fin entre pestañas, con activación automática — el patrón
   * de tabs de WAI-ARIA. Sin esto, `role="tablist"` le promete a un lector de
   * pantalla una navegación que no existe: anunciaría "pestaña 2 de 4" y las
   * flechas no harían nada.
   *
   * Escape NO se intercepta: lo cierra el `<dialog>` nativo, y hacerlo aquí
   * duplicaría el camino de cierre.
   */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = this.tabs.length - 1;
    let next: number;

    switch (event.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    // Solo cuando se ha reconocido la tecla: con un `preventDefault` arriba, un
    // Tab o una letra dejarían de funcionar dentro de la barra.
    event.preventDefault();
    this.select(this.tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  /**
   * Alta correcta en cualquiera de las cuatro pestañas.
   *
   * **Invalida y cierra.** Lo primero es obligatorio aquí y no lo era en las
   * rutas de alta: allí se navegaba a una pantalla que volvía a pedir sus datos,
   * y aquí no se navega a ninguna parte — sin `invalidate()`, el usuario crearía
   * una tarea y vería el mismo Inicio de antes, con las tarjetas y el calendario
   * sin enterarse.
   */
  protected onCreated(tab: QuickCreateTab): void {
    this.dataRefresh.invalidate();
    this.created.emit(tab.createdLabel);
    this.onCloseClick();
  }

  /** El evento `close` nativo cubre Escape y el clic fuera; la X y Cancelar caen en el mismo sitio. */
  protected onNativeClose(): void {
    this.close.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.dialog()?.nativeElement.close();
    }
  }

  protected onCloseClick(): void {
    this.dialog()?.nativeElement.close();
  }

  private focusActiveTab(): void {
    const index = this.tabs.findIndex(tab => tab.id === this.active());
    this.tabButtons()[index]?.nativeElement.focus();
  }
}

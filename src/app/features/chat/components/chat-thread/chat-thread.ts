import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  afterRenderEffect,
  inject,
  input
} from '@angular/core';
import { ChatMessage } from '../../models/chat.model';

/**
 * A cuántos píxeles del fondo se sigue considerando que el usuario está "abajo".
 *
 * No es cero porque el scroll de un contenedor con `gap` y subpíxeles rara vez
 * cae exacto, y porque quien está a media línea del final claramente quiere
 * seguir la conversación, no está leyendo hacia atrás.
 */
const FOLLOW_THRESHOLD_PX = 48;

/**
 * Pinta la conversación. No inyecta nada de dominio: recibe todo por input, así
 * el panel del shell y el widget de Home pueden componerlo contra el mismo
 * store.
 *
 * Vive en `features/chat/` y no en `shared/ui/` porque recibe un DTO de
 * dominio (`ChatMessage`); una primitiva compartida solo recibe primitivos.
 *
 * Es además el **contenedor con scroll** (`:host` lleva `overflow-y: auto`), y
 * por eso el desplazamiento automático al último mensaje vive aquí y no en el
 * panel: quien tiene la barra es quien la mueve. Efecto lateral bueno — el
 * `assistant-widget` de Home lo hereda sin escribir nada.
 */
@Component({
  selector: 'app-chat-thread',
  imports: [],
  templateUrl: './chat-thread.html',
  styleUrl: './chat-thread.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatThread {
  readonly messages = input.required<ChatMessage[]>();
  readonly loadingHistory = input(false);
  readonly sending = input(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Si el usuario está pegado al fondo. Property plana y no signal a propósito:
   * la escribe el listener de scroll, que corre fuera de la zona, y nadie la
   * pinta — solo decide si el próximo mensaje arrastra la vista o no.
   *
   * Arranca en `true`: recién montado no hay historia que respetar.
   */
  private atBottom = true;

  /** Si ya se colocó al fondo una vez teniendo contenido real. */
  private settled = false;

  constructor() {
    this.trackUserScroll();

    // `afterRenderEffect` y no `effect`: hay que LEER `scrollHeight`, y solo da
    // el número correcto una vez pintado el mensaje nuevo. Un `effect` corre
    // antes del render y dejaría la vista en el alto anterior — o sea, con el
    // último mensaje justo por debajo del borde.
    afterRenderEffect(() => {
      // Dependencias explícitas. `sending` está porque la burbuja
      // "Escribiendo..." también ocupa alto: sin ella, el indicador aparece
      // fuera de pantalla y el chat parece no haber reaccionado al envío.
      const messages = this.messages();
      this.sending();
      this.loadingHistory();

      this.followLatest(messages);
    });
  }

  /**
   * El seguimiento se decide con la posición **anterior** del usuario, no con
   * la distancia al fondo medida después de insertar.
   *
   * Medirla después es el bug clásico: el mensaje recién añadido ya cuenta en
   * `scrollHeight`, así que una respuesta larga del agente deja al usuario
   * "lejos del fondo" aunque estuviera pegado a él, y el hilo deja de seguirse
   * justo cuando más falta hace.
   *
   * Fuera de la zona de Angular porque `scroll` dispara decenas de veces por
   * segundo y con Zone.js cada evento provocaría una detección de cambios de
   * toda la app. Aquí no hace falta ninguna: solo se escribe un booleano que
   * nadie pinta. Es la misma razón por la que el cronómetro del dictado corría
   * con `runOutsideAngular` antes de eliminarse.
   */
  private trackUserScroll(): void {
    const el = this.host.nativeElement;

    this.zone.runOutsideAngular(() => {
      const onScroll = (): void => {
        this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX;
      };

      el.addEventListener('scroll', onScroll, { passive: true });
      this.destroyRef.onDestroy(() => el.removeEventListener('scroll', onScroll));
    });
  }

  private followLatest(messages: ChatMessage[]): void {
    const el = this.host.nativeElement;

    // Todavía sin nada que enseñar (el GET de historial no ha vuelto). No se
    // marca `settled`: la primera colocación de verdad es cuando llega el
    // historial, y esa tiene que ser un salto seco, no una animación.
    if (messages.length === 0 && !this.sending()) {
      return;
    }

    const primeraVez = !this.settled;

    if (!primeraVez && !this.shouldFollow(messages)) {
      return;
    }

    this.settled = true;

    el.scrollTo({
      top: el.scrollHeight,
      // Al abrir se salta, no se recorre: animar toda la conversación de arriba
      // abajo se lee como un fallo y hace esperar para leer lo último, que es
      // justo lo que se venía a ver.
      behavior: primeraVez || prefersReducedMotion() ? 'auto' : 'smooth'
    });

    // El scroll suave emite eventos intermedios que apagarían `atBottom` a
    // mitad de animación. Se afirma aquí porque la intención ya está tomada.
    this.atBottom = true;
  }

  private shouldFollow(messages: ChatMessage[]): boolean {
    // El usuario acaba de escribir: se le lleva a su propio mensaje aunque
    // estuviera leyendo más arriba. Pulsar Enviar es pedir ver el resultado.
    if (messages.at(-1)?.role === 'user') {
      return true;
    }

    // Si se había ido a leer hacia atrás, un mensaje nuevo no le arrastra: eso
    // es perder el sitio a media lectura, y es la queja clásica de los chats
    // que hacen autoscroll incondicional.
    return this.atBottom;
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

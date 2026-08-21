import { ChangeDetectionStrategy, Component, OnInit, inject, model } from '@angular/core';
import { ChatComposer } from '../../features/chat/components/chat-composer/chat-composer';
import { ChatThread } from '../../features/chat/components/chat-thread/chat-thread';
import { ChatStore } from '../../features/chat/chat.store';

/**
 * El montaje del chat en el shell. Tiene dos formas y las dos son este mismo
 * componente, nunca dos: en escritorio, burbuja flotante y panel anclado a
 * ella; por debajo del breakpoint, la burbuja desaparece y el panel ocupa la
 * pantalla como una sección más, abierto desde la cuarta pestaña de
 * `bottom-nav`. La conmutación es CSS, así que el componente —y con él la
 * conversación en pantalla— sobrevive a cruzar el breakpoint.
 *
 * Es cromo de la app, igual que `theme-toggle`, y por eso vive en `layout/` y
 * no en `features/chat/`.
 *
 * El dominio (estado, HTTP, voz, las piezas de la conversación) sigue en
 * `features/chat/`. La flecha va layout → feature y nunca al revés: ninguna
 * feature importa este componente, lo monta `app.html`.
 */
@Component({
  selector: 'app-chat-panel',
  imports: [ChatThread, ChatComposer],
  templateUrl: './chat-panel.html',
  styleUrl: './chat-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPanel implements OnInit {
  private readonly store = inject(ChatStore);

  protected readonly messages = this.store.messages;
  protected readonly loadingHistory = this.store.loadingHistory;
  protected readonly sending = this.store.sending;

  /**
   * Abierto/cerrado, como `model()` y no como signal interno: en móvil el chat
   * es una pestaña de `bottom-nav`, así que hay un segundo disparador fuera de
   * este componente. El dueño del estado es `App`, que monta a los dos; aquí
   * llega por two-way binding para que la burbuja de escritorio y el botón de
   * cerrar sigan funcionando sin conocer a nadie.
   */
  readonly open = model(false);

  ngOnInit(): void {
    // El store se encarga de que esto sea un único GET por sesión, aunque
    // aparezca un segundo montaje (el assistant-widget de Home).
    this.store.loadHistory();
  }

  protected toggle(): void {
    this.open.update(value => !value);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onSend(text: string): void {
    this.store.send(text);
  }
}

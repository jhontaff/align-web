import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ChatComposer } from '../../features/chat/components/chat-composer/chat-composer';
import { ChatThread } from '../../features/chat/components/chat-thread/chat-thread';
import { ChatStore } from '../../features/chat/chat.store';

/**
 * El montaje del chat en el shell: la burbuja flotante, la posición fija y el
 * abrir/cerrar. Es cromo de la app, igual que `theme-toggle`, y por eso vive en
 * `layout/` y no en `features/chat/`.
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

  protected readonly open = signal(false);

  ngOnInit(): void {
    // El store se encarga de que esto sea un único GET por sesión, aunque
    // aparezca un segundo montaje (el assistant-widget de Home).
    this.store.loadHistory();
  }

  protected toggle(): void {
    this.open.update(value => !value);
  }

  protected onSend(text: string): void {
    this.store.send(text);
  }
}

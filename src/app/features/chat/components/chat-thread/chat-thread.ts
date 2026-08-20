import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChatMessage } from '../../models/chat.model';

/**
 * Pinta la conversación. No inyecta nada: recibe todo por input, así el panel
 * del shell y el widget de Home pueden componerlo contra el mismo store.
 *
 * Vive en `features/chat/` y no en `shared/ui/` porque recibe un DTO de
 * dominio (`ChatMessage`); una primitiva compartida solo recibe primitivos.
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
}

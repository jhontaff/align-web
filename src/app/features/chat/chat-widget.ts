import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from './chat.service';
import { ChatMessage } from './models/chat.model';

@Component({
  selector: 'app-chat-widget',
  imports: [FormsModule],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss'
})
export class ChatWidget implements OnInit {
  private readonly chatService = inject(ChatService);

  protected readonly open = signal(false);
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly loadingHistory = signal(true);
  protected readonly sending = signal(false);
  protected draft = '';

  ngOnInit(): void {
    this.chatService.history().subscribe({
      next: response => {
        this.messages.set(response.turns.map(turn => ({ role: turn.role, text: turn.content })));
        this.loadingHistory.set(false);
      },
      error: () => {
        this.loadingHistory.set(false);
      }
    });
  }

  protected toggle(): void {
    this.open.update(value => !value);
  }

  protected send(): void {
    const text = this.draft.trim();
    if (!text || this.sending()) {
      return;
    }

    this.messages.update(msgs => [...msgs, { role: 'user', text }]);
    this.draft = '';
    this.sending.set(true);

    this.chatService.send(text).subscribe({
      next: response => {
        this.messages.update(msgs => [...msgs, { role: 'assistant', text: response.reply }]);
        this.sending.set(false);
      },
      error: () => {
        this.messages.update(msgs => [...msgs, { role: 'assistant', text: 'Hubo un error, intenta de nuevo.' }]);
        this.sending.set(false);
      }
    });
  }
}

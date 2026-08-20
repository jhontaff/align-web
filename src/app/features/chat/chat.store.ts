import { Injectable, inject, signal } from '@angular/core';
import { DataRefreshService } from '../../core/data/data-refresh.service';
import { ChatService } from './chat.service';
import { ChatMessage } from './models/chat.model';

/**
 * Estado de la conversación con el agente.
 *
 * Excepción deliberada al "servicio stateless" del resto de la app, y la razón
 * es del backend: hay **una** conversación por usuario, sin threads. En cuanto
 * el chat tiene dos montajes (el panel flotante del shell y el futuro
 * assistant-widget de Home), dos componentes con su propio `messages()`
 * mostrarían historiales divergentes de la misma conversación — un bug
 * visible, no una imperfección.
 *
 * El segundo trabajo del store es que `GET /api/agent/history` se llame una
 * vez por sesión y no una por montaje: el endpoint devuelve la conversación
 * entera cada vez, sin cursor ni paginación.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  private readonly chatService = inject(ChatService);
  private readonly dataRefresh = inject(DataRefreshService);

  private readonly _messages = signal<ChatMessage[]>([]);
  private readonly _loadingHistory = signal(false);
  private readonly _sending = signal(false);

  readonly messages = this._messages.asReadonly();
  readonly loadingHistory = this._loadingHistory.asReadonly();
  readonly sending = this._sending.asReadonly();

  /**
   * Se marca antes de disparar la petición, no en el `next`: así un fallo de
   * red tampoco reintenta en cada montaje. El precio es que la conversación no
   * se recupera hasta recargar; con un solo GET por sesión es el trato correcto.
   */
  private loadedOnce = false;

  loadHistory(): void {
    if (this.loadedOnce) {
      return;
    }

    this.loadedOnce = true;
    this._loadingHistory.set(true);

    this.chatService.history().subscribe({
      next: response => {
        this._messages.set(response.turns.map(turn => ({ role: turn.role, text: turn.content })));
        this._loadingHistory.set(false);
      },
      error: () => {
        this._loadingHistory.set(false);
      }
    });
  }

  send(text: string): void {
    const message = text.trim();
    if (!message || this._sending()) {
      return;
    }

    this._messages.update(msgs => [...msgs, { role: 'user', text: message }]);
    this._sending.set(true);

    this.chatService.send(message).subscribe({
      next: response => {
        this._messages.update(msgs => [...msgs, { role: 'assistant', text: response.reply }]);
        this._sending.set(false);

        // Se invalida en **toda** respuesta, no solo cuando el agente escribió
        // algo: el reply es texto libre y no hay forma de distinguir "creé la
        // tarea" de "tienes tres tareas pendientes" sin parsear la prosa, que
        // es frágil y se rompe en cuanto cambie el prompt del backend.
        //
        // El precio es un GET de más por cada pregunta que no modifica nada.
        // Se paga solo por las pantallas montadas, así que es un request contra
        // localhost. La solución real es del backend: que AgentResponse diga
        // qué tocó.
        this.dataRefresh.invalidate();
      },
      error: () => {
        this._messages.update(msgs => [...msgs, { role: 'assistant', text: 'Hubo un error, intenta de nuevo.' }]);
        this._sending.set(false);
      }
    });
  }
}

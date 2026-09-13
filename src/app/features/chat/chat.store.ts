import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { DataRefreshService } from '../../core/data/data-refresh.service';
import { extractErrorMessage } from '../../core/http/extract-error-message';
import { ChatService } from './chat.service';
import { ChatMessage } from './models/chat.model';
import { PendingActionResponse } from './models/pending-action.model';

/**
 * Mensajes de error mostrados como burbuja del propio agente. Variados para
 * que no se sienta un mensaje de sistema repetido; la elección es aleatoria,
 * no rotativa, así que no hay estado que mantener entre errores.
 */
const CHAT_ERROR_MESSAGES = [
  'Se me cruzaron los cables un momento. ¿Lo intentamos de nuevo?',
  'Algo no salió bien de mi lado. ¿Puedes repetir el mensaje?',
  'Ups, no pude procesarlo. Intenta otra vez en un momento.',
  'Perdona, algo falló al responder. ¿Lo intentas de nuevo?',
  'Se me trabó la idea a mitad de camino. Prueba otra vez, seguro sale mejor.',
];

function randomChatErrorMessage(): string {
  return CHAT_ERROR_MESSAGES[Math.floor(Math.random() * CHAT_ERROR_MESSAGES.length)];
}

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
  private readonly _pendingActions = signal<PendingActionResponse[]>([]);

  readonly messages = this._messages.asReadonly();
  readonly loadingHistory = this._loadingHistory.asReadonly();
  readonly sending = this._sending.asReadonly();
  readonly pendingActions = this._pendingActions.asReadonly();

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

    // Una eliminación pudo quedar pendiente de una sesión anterior; se pide
    // junto al historial para que aparezca en cuanto el shell monta el chat,
    // no solo tras el próximo mensaje.
    this.refreshPendingActions();
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

        // La tool de eliminar pudo haber dejado una acción pendiente en este
        // turno; `AgentResponse` no la trae inline (solo `{ reply: string }`),
        // así que hay que volver a pedirla.
        this.refreshPendingActions();
      },
      error: () => {
        this._messages.update(msgs => [...msgs, { role: 'assistant', text: randomChatErrorMessage() }]);
        this._sending.set(false);
      }
    });
  }

  /**
   * Confirma una eliminación propuesta por el agente.
   *
   * Se quita de `pendingActions` de inmediato, antes de que responda el
   * backend: así el diálogo no se vuelve a abrir para la misma acción
   * mientras la petición está en vuelo. Si falla, no se repone — la próxima
   * `refreshPendingActions()` (tras el siguiente mensaje, o al recargar) la
   * trae de vuelta si de verdad sigue pendiente en el servidor.
   */
  confirmAction(id: string): void {
    this._pendingActions.update(actions => actions.filter(action => action.id !== id));

    this.chatService.confirmPendingAction(id).subscribe({
      next: () => this.dataRefresh.invalidate(),
      error: err => this.pushActionError(err)
    });
  }

  /**
   * Rechaza una eliminación propuesta por el agente. A diferencia de
   * `confirmAction`, no invalida datos: rechazar no cambia nada en el servidor.
   */
  rejectAction(id: string): void {
    this._pendingActions.update(actions => actions.filter(action => action.id !== id));

    this.chatService.rejectPendingAction(id).subscribe({
      error: err => this.pushActionError(err)
    });
  }

  private pushActionError(err: unknown): void {
    const message = err instanceof HttpErrorResponse ? extractErrorMessage(err) : randomChatErrorMessage();
    this._messages.update(msgs => [...msgs, { role: 'assistant', text: message }]);
  }

  private refreshPendingActions(): void {
    this.chatService.pendingActions().subscribe({
      next: actions => this._pendingActions.set(actions),
      error: () => {
        // Silencioso a propósito: es un refresco de fondo, no una acción que el
        // usuario disparó. Si falla, la próxima llamada (tras el siguiente
        // mensaje) lo vuelve a intentar.
      }
    });
  }
}

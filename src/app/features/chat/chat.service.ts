import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgentResponse, ChatHistoryResponse, ChatRequest } from './models/chat.model';
import { PendingActionResponse } from './models/pending-action.model';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  send(message: string): Observable<AgentResponse> {
    return this.http.post<AgentResponse>('/api/agent/chat', { message } satisfies ChatRequest);
  }

  history(): Observable<ChatHistoryResponse> {
    return this.http.get<ChatHistoryResponse>('/api/agent/history');
  }

  pendingActions(): Observable<PendingActionResponse[]> {
    return this.http.get<PendingActionResponse[]>('/api/agent/pending-actions');
  }

  confirmPendingAction(id: string): Observable<unknown> {
    return this.http.post(`/api/agent/pending-actions/${id}/confirm`, {});
  }

  rejectPendingAction(id: string): Observable<void> {
    return this.http.post<void>(`/api/agent/pending-actions/${id}/reject`, {});
  }
}

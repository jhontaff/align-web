import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AgentResponse, ChatHistoryResponse, ChatRequest } from './models/chat.model';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  send(message: string): Observable<AgentResponse> {
    return this.http.post<AgentResponse>('/api/agent/chat', { message } satisfies ChatRequest);
  }

  history(): Observable<ChatHistoryResponse> {
    return this.http.get<ChatHistoryResponse>('/api/agent/history');
  }
}

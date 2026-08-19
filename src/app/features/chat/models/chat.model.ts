export interface ChatRequest {
  message: string;
}

export interface AgentResponse {
  reply: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatHistoryResponse {
  turns: ChatTurn[];
}

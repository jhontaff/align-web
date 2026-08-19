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

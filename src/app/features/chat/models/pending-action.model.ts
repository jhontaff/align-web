export interface PendingActionResponse {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  createdAt: string;
}

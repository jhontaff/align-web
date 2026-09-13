const KEY = 'align_notification_prompt_dismissed';

export function hasDismissedNotificationPrompt(): boolean {
  return localStorage.getItem(KEY) === '1';
}

export function markNotificationPromptDismissed(): void {
  localStorage.setItem(KEY, '1');
}

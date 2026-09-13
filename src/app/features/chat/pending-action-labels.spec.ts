import { PendingActionResponse } from './models/pending-action.model';
import { pendingDeleteMessage } from './pending-action-labels';

/**
 * Sin `TestBed` a propósito: es un módulo puro, sin Angular de por medio.
 */

function action(toolName: string, args: Record<string, unknown> = {}): PendingActionResponse {
  return { id: 'a1', toolName, arguments: args, createdAt: '2026-09-12T10:00:00' };
}

describe('pendingDeleteMessage', () => {
  it('reconoce delete_task (nombre real verificado contra el backend) y usa el título si viene', () => {
    expect(pendingDeleteMessage(action('delete_task', { title: 'Comprar leche' })))
      .toBe('Se eliminará la tarea «Comprar leche» de forma permanente.');
  });

  it('delete_task sin título (la forma real hoy: solo trae taskId) usa el mensaje genérico del sustantivo', () => {
    expect(pendingDeleteMessage(action('delete_task', { taskId: '20cab3c6-ca04-4bb9-a46a-f55995db31ab' })))
      .toBe('Se eliminará la tarea de forma permanente.');
  });

  it('cae al genérico "este elemento" para una tool desconocida', () => {
    expect(pendingDeleteMessage(action('delete_budget', { name: 'Viaje' })))
      .toBe('Se eliminará este elemento «Viaje» de forma permanente.');
  });

  it('sin identificador en los argumentos, omite las comillas', () => {
    expect(pendingDeleteMessage(action('delete_transaction', { transactionId: 'xyz' })))
      .toBe('Se eliminará la transacción de forma permanente.');
  });

  it('prioriza title sobre name y description', () => {
    expect(pendingDeleteMessage(action('delete_habit', { title: 'Meditar', name: 'otro', description: 'otro más' })))
      .toBe('Se eliminará el hábito «Meditar» de forma permanente.');
  });
});

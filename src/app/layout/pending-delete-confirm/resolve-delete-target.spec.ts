import { firstValueFrom, of, throwError } from 'rxjs';
import { PendingActionResponse } from '../../features/chat/models/pending-action.model';
import { TransactionResponse } from '../../features/finance/models/transaction.model';
import { TransactionService } from '../../features/finance/transaction.service';
import { HabitService } from '../../features/habits/habit.service';
import { HabitResponse } from '../../features/habits/models/habit.model';
import { TaskService } from '../../features/tasks/task.service';
import { TaskResponse } from '../../features/tasks/models/task.model';
import { DeleteTargetServices, resolveDeleteTarget } from './resolve-delete-target';

function action(toolName: string, args: Record<string, unknown>): PendingActionResponse {
  return { id: 'a1', toolName, arguments: args, createdAt: '2026-09-12T10:00:00' };
}

function services(overrides: Partial<DeleteTargetServices> = {}): DeleteTargetServices {
  return {
    taskService: { get: () => of({} as TaskResponse) } as unknown as TaskService,
    transactionService: { get: () => of({} as TransactionResponse) } as unknown as TransactionService,
    habitService: { get: () => of({} as HabitResponse) } as unknown as HabitService,
    ...overrides
  };
}

describe('resolveDeleteTarget', () => {
  it('delete_task: pide el título a TaskService con el id de arguments', async () => {
    const taskService = { get: (id: string) => of({ id, title: 'Comprar leche' } as TaskResponse) } as unknown as TaskService;

    const result = await firstValueFrom(
      resolveDeleteTarget(action('delete_task', { taskId: 't1' }), services({ taskService }))
    );

    expect(result).toBe('Comprar leche');
  });

  it('delete_transaction: usa description cuando existe', async () => {
    const transactionService = {
      get: () => of({ description: 'Cena', category: 'FOOD' } as TransactionResponse)
    } as unknown as TransactionService;

    const result = await firstValueFrom(
      resolveDeleteTarget(action('delete_transaction', { transactionId: 'x1' }), services({ transactionService }))
    );

    expect(result).toBe('Cena');
  });

  it('delete_transaction: cae a la categoría traducida cuando no hay description', async () => {
    const transactionService = {
      get: () => of({ description: null, category: 'FOOD' } as TransactionResponse)
    } as unknown as TransactionService;

    const result = await firstValueFrom(
      resolveDeleteTarget(action('delete_transaction', { transactionId: 'x1' }), services({ transactionService }))
    );

    expect(result).toBe('Alimentación');
  });

  it('delete_habit: pide el name a HabitService', async () => {
    const habitService = { get: () => of({ name: 'Meditar' } as HabitResponse) } as unknown as HabitService;

    const result = await firstValueFrom(
      resolveDeleteTarget(action('delete_habit', { habitId: 'h1' }), services({ habitService }))
    );

    expect(result).toBe('Meditar');
  });

  it('tool desconocida: null sin llamar a ningún servicio', async () => {
    const taskService = { get: jasmine.createSpy('get') } as unknown as TaskService;

    const result = await firstValueFrom(resolveDeleteTarget(action('delete_budget', { id: 'b1' }), services({ taskService })));

    expect(result).toBeNull();
    expect(taskService.get).not.toHaveBeenCalled();
  });

  it('sin ningún id en arguments: null sin llamar al servicio', async () => {
    const taskService = { get: jasmine.createSpy('get') } as unknown as TaskService;

    const result = await firstValueFrom(resolveDeleteTarget(action('delete_task', {}), services({ taskService })));

    expect(result).toBeNull();
    expect(taskService.get).not.toHaveBeenCalled();
  });

  it('si el GET falla (p. ej. 404, el elemento ya no existe), cae a null en vez de propagar el error', async () => {
    const taskService = { get: () => throwError(() => new Error('404')) } as unknown as TaskService;

    const result = await firstValueFrom(resolveDeleteTarget(action('delete_task', { taskId: 't1' }), services({ taskService })));

    expect(result).toBeNull();
  });
});

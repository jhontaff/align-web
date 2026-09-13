import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { ChatStore } from '../../features/chat/chat.store';
import { PendingActionResponse } from '../../features/chat/models/pending-action.model';
import { TransactionService } from '../../features/finance/transaction.service';
import { TransactionResponse } from '../../features/finance/models/transaction.model';
import { HabitService } from '../../features/habits/habit.service';
import { TaskService } from '../../features/tasks/task.service';
import { TaskResponse } from '../../features/tasks/models/task.model';
import { PendingDeleteConfirm } from './pending-delete-confirm';

/**
 * `arguments` trae solo un id (forma real verificada 2026-09-12) — el nombre
 * legible lo resuelve el componente pidiéndoselo al servicio de la feature
 * dueña, así que los fixtures aquí abajo son ids, no títulos.
 */
const ACTION_A: PendingActionResponse = {
  id: 'a1',
  toolName: 'delete_task',
  arguments: { taskId: 'task-1' },
  createdAt: '2026-09-12T10:00:00'
};

const ACTION_B: PendingActionResponse = {
  id: 'a2',
  toolName: 'delete_transaction',
  arguments: { transactionId: 'tx-1' },
  createdAt: '2026-09-12T10:05:00'
};

const TASK_1 = { id: 'task-1', title: 'Comprar leche' } as TaskResponse;
const TRANSACTION_1 = { id: 'tx-1', description: 'Cena', category: 'FOOD' } as TransactionResponse;

describe('PendingDeleteConfirm', () => {
  let fixture: ComponentFixture<PendingDeleteConfirm>;
  let pendingActions: ReturnType<typeof signal<PendingActionResponse[]>>;
  let confirmAction: jasmine.Spy;
  let rejectAction: jasmine.Spy;
  let taskGet: jasmine.Spy;

  beforeEach(async () => {
    pendingActions = signal<PendingActionResponse[]>([]);
    confirmAction = jasmine.createSpy('confirmAction');
    rejectAction = jasmine.createSpy('rejectAction');
    taskGet = jasmine.createSpy('taskService.get').and.returnValue(of(TASK_1));

    await TestBed.configureTestingModule({
      imports: [PendingDeleteConfirm],
      providers: [
        {
          provide: ChatStore,
          useValue: { pendingActions: pendingActions.asReadonly(), confirmAction, rejectAction }
        },
        { provide: TaskService, useValue: { get: taskGet } },
        { provide: TransactionService, useValue: { get: jasmine.createSpy('transactionService.get').and.returnValue(of(TRANSACTION_1)) } },
        { provide: HabitService, useValue: { get: jasmine.createSpy('habitService.get').and.returnValue(of(null)) } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PendingDeleteConfirm);
    fixture.detectChanges();
  });

  function dialog(): HTMLDialogElement {
    return fixture.nativeElement.querySelector('dialog');
  }

  it('sin acciones pendientes, el diálogo no se abre', () => {
    expect(dialog().open).toBeFalse();
  });

  it('con una acción pendiente, abre el diálogo de inmediato con el mensaje genérico y lo afina cuando el GET resuelve', async () => {
    // Un `Subject` en vez de `of(...)`: controla a mano cuándo "responde" el
    // backend para poder afirmar el estado ANTES de esa respuesta, algo que
    // con un observable síncrono no se puede observar (ya habría resuelto).
    const pending$ = new Subject<TaskResponse>();
    taskGet.and.returnValue(pending$);

    pendingActions.set([ACTION_A]);
    fixture.detectChanges();

    // Abre YA, antes de que el `GET` a TaskService resuelva — una confirmación
    // destructiva no debería esperar a una petición extra para aparecer.
    expect(dialog().open).toBeTrue();
    expect(dialog().textContent).toContain('Se eliminará la tarea de forma permanente.');

    pending$.next(TASK_1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialog().textContent).toContain('Comprar leche');
  });

  it('resuelve el nombre real contra TaskService y actualiza el mensaje', async () => {
    pendingActions.set([ACTION_A]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(taskGet).toHaveBeenCalledWith('task-1');
    expect(dialog().textContent).toContain('Comprar leche');
  });

  it('confirmar delega en store.confirmAction() con el id de la acción actual', () => {
    pendingActions.set([ACTION_A]);
    fixture.detectChanges();

    dialog().querySelector<HTMLButtonElement>('.btn-danger')!.click();

    expect(confirmAction).toHaveBeenCalledWith('a1');
  });

  it('rechazar (o cerrar el diálogo) delega en store.rejectAction()', () => {
    pendingActions.set([ACTION_A]);
    fixture.detectChanges();

    dialog().querySelector<HTMLButtonElement>('.btn-ghost')!.click();

    expect(rejectAction).toHaveBeenCalledWith('a1');
  });

  it('al quitar la acción actual de la lista, pasa a mostrar la siguiente ya resuelta', async () => {
    pendingActions.set([ACTION_A, ACTION_B]);
    fixture.detectChanges();

    pendingActions.set([ACTION_B]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialog().open).toBeTrue();
    expect(dialog().textContent).toContain('Cena');
  });
});

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, of, switchMap } from 'rxjs';
import { ChatStore } from '../../features/chat/chat.store';
import { pendingDeleteMessage } from '../../features/chat/pending-action-labels';
import { TransactionService } from '../../features/finance/transaction.service';
import { HabitService } from '../../features/habits/habit.service';
import { TaskService } from '../../features/tasks/task.service';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { resolveDeleteTarget } from './resolve-delete-target';

/**
 * Segundo montaje del dominio `features/chat/` en `layout/`, igual que
 * `chat-panel/` — el dominio vive en la feature, el montaje en el shell.
 *
 * Va aquí y no dentro de `ChatPanel` porque tiene que aparecer aunque el panel
 * de chat esté cerrado: es la confirmación de una eliminación propuesta por el
 * agente, no algo que deba depender de si el usuario tiene la ventanita
 * abierta en ese momento.
 *
 * Solo la tool de eliminar pasa por aquí — crear y actualizar los sigue
 * ejecutando el agente directo, sin confirmación.
 */
@Component({
  selector: 'app-pending-delete-confirm',
  imports: [ConfirmDialog],
  templateUrl: './pending-delete-confirm.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PendingDeleteConfirm {
  private readonly store = inject(ChatStore);
  private readonly taskService = inject(TaskService);
  private readonly transactionService = inject(TransactionService);
  private readonly habitService = inject(HabitService);

  /**
   * Se muestra de a una, la más antigua primero. Al confirmar/rechazar la
   * actual, `pendingActions()` pierde ese elemento y este `computed` recalcula
   * a la siguiente sola — así una segunda eliminación propuesta en el mismo
   * turno no se pierde, solo espera su turno en el diálogo.
   */
  protected readonly current = computed(() => this.store.pendingActions()[0] ?? null);
  protected readonly hasCurrent = computed(() => this.current() !== null);

  /**
   * Nombre real del elemento, pedido con `resolveDeleteTarget()` a la feature
   * dueña del dato (`arguments` solo trae un id, ver ese archivo). `toSignal`
   * y no un `effect()` escribiendo otro signal: es exactamente el patrón de
   * `TaskDetail` (`taskId$` → `switchMap` → `toSignal`), aquí sobre `current()`
   * convertido a observable en vez de sobre `ActivatedRoute.paramMap`.
   *
   * `distinctUntilChanged` por id evita relanzar el `GET` en cada emisión de
   * `pendingActions()` que no cambie la acción actual (por ejemplo, si
   * `refreshPendingActions()` vuelve a traer la misma lista). `switchMap`
   * cancela una petición en vuelo si la acción actual cambia antes de que
   * responda — la misma razón que en `TaskDetail`.
   */
  private readonly resolvedIdentifier = toSignal(
    toObservable(this.current).pipe(
      distinctUntilChanged((a, b) => a?.id === b?.id),
      switchMap(action =>
        action
          ? resolveDeleteTarget(action, {
              taskService: this.taskService,
              transactionService: this.transactionService,
              habitService: this.habitService
            })
          : of(null)
      )
    ),
    { initialValue: null }
  );

  /**
   * Mientras el nombre se resuelve, el mensaje sale genérico ("Se eliminará
   * la tarea de forma permanente.") y se afina solo en cuanto llega el `GET`
   * — el diálogo no espera a tenerlo para abrirse, porque es una confirmación
   * de una acción destructiva y no debería demorarse por una petición extra.
   */
  protected readonly message = computed(() => {
    const action = this.current();
    return action ? pendingDeleteMessage(action, this.resolvedIdentifier()) : '';
  });

  protected onConfirm(): void {
    const action = this.current();
    if (action) {
      this.store.confirmAction(action.id);
    }
  }

  protected onReject(): void {
    const action = this.current();
    if (action) {
      this.store.rejectAction(action.id);
    }
  }
}

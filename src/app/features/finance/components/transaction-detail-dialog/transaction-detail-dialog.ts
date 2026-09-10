import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { ConfirmDialog } from '../../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../../shared/ui/icon/icon';
import { TransactionResponse } from '../../models/transaction.model';
import { CATEGORY_LABELS } from '../../transaction-labels';
import { TransactionService } from '../../transaction.service';
import { TransactionDetailView } from '../transaction-detail-view/transaction-detail-view';

/** Mismo motivo que en `event-detail`/`confirm-dialog`: `id` es global al documento. */
let nextId = 0;

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; transaction: TransactionResponse };

/**
 * Un movimiento como cuadro flotante, para abrirlo sin salir de Inicio.
 *
 * Gemelo de `TaskDetailDialog`, con el mismo reparto y las mismas razones —ver
 * su comentario, que documenta por qué la petición y el borrado se repiten
 * respecto a la ruta en vez de compartirse.
 */
@Component({
  selector: 'app-transaction-detail-dialog',
  imports: [ConfirmDialog, Icon, TransactionDetailView],
  templateUrl: './transaction-detail-dialog.html',
  styleUrl: './transaction-detail-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionDetailDialog {
  private readonly transactions = inject(TransactionService);
  private readonly locale = inject(LOCALE_ID);

  private readonly id = nextId++;
  protected readonly titleId = `transaction-detail-dialog-title-${this.id}`;

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  readonly transactionId = input.required<string>();

  readonly edit = output<TransactionResponse>();
  readonly deleted = output<string>();
  readonly close = output<void>();

  private readonly id$ = toObservable(this.transactionId).pipe(distinctUntilChanged());

  private readonly state = toSignal(
    this.id$.pipe(
      switchMap(id =>
        this.transactions.get(id).pipe(
          map((transaction): DetailState => ({ status: 'ready', transaction })),
          catchError(err => of<DetailState>({ status: 'error', message: extractErrorMessage(err) })),
          startWith<DetailState>({ status: 'loading' })
        )
      )
    ),
    { initialValue: { status: 'loading' } as DetailState }
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : null;
  });

  protected readonly transaction = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.transaction : null;
  });

  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly confirmOpen = signal(false);

  protected readonly confirmMessage = computed(() => {
    const transaction = this.transaction();
    if (!transaction) {
      return '';
    }

    const amount = transaction.amount.toLocaleString(this.locale);
    return `Se eliminará el movimiento de ${amount} en ${CATEGORY_LABELS[transaction.category]} de forma permanente.`;
  });

  constructor() {
    afterRenderEffect(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
    });
  }

  protected onNativeClose(): void {
    this.close.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.dialog()?.nativeElement.close();
    }
  }

  protected onCloseClick(): void {
    this.dialog()?.nativeElement.close();
  }

  protected onDeleteClick(): void {
    this.confirmOpen.set(true);
  }

  protected onConfirmDelete(): void {
    const transaction = this.transaction();
    if (!transaction) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set(null);

    this.transactions.remove(transaction.id).subscribe({
      next: () => this.deleted.emit(transaction.id),
      error: err => {
        this.deleting.set(false);
        this.deleteError.set(extractErrorMessage(err));
      }
    });
  }

  protected onEditClick(): void {
    const transaction = this.transaction();
    if (transaction) {
      this.edit.emit(transaction);
    }
  }
}

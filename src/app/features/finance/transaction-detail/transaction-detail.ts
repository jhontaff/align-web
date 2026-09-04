import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { parseIsoDate } from '../../../core/date/date-range';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { MONEY_DIGITS } from '../money';
import { TransactionResponse } from '../models/transaction.model';
import { CATEGORY_LABELS, TYPE_LABELS } from '../transaction-labels';
import { TransactionService } from '../transaction.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; transaction: TransactionResponse };

@Component({
  selector: 'app-transaction-detail',
  imports: [CurrencyPipe, RouterLink, ConfirmDialog, Icon],
  templateUrl: './transaction-detail.html',
  styleUrl: './transaction-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionDetail {
  private readonly transactions = inject(TransactionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locale = inject(LOCALE_ID);

  protected readonly moneyDigits = MONEY_DIGITS;

  private readonly transactionId$ = this.route.paramMap.pipe(
    map(params => params.get('id')),
    map(raw => (raw !== null && UUID.test(raw) ? raw : null)),
    distinctUntilChanged()
  );

  private readonly state = toSignal(
    this.transactionId$.pipe(
      switchMap(id => {
        if (id === null) {
          return of<DetailState>({
            status: 'error',
            message: 'El movimiento que buscas no existe.'
          });
        }

        return this.transactions.get(id).pipe(
          map((transaction): DetailState => ({ status: 'ready', transaction })),
          catchError(err => of<DetailState>({ status: 'error', message: extractErrorMessage(err) })),
          startWith<DetailState>({ status: 'loading' })
        );
      })
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

  protected readonly isIncome = computed(() => this.transaction()?.type === 'INCOME');

  protected readonly amount = computed(() => Math.abs(this.transaction()?.amount ?? 0));

  protected readonly typeLabel = computed(() => {
    const transaction = this.transaction();
    return transaction ? TYPE_LABELS[transaction.type] : '';
  });

  protected readonly categoryLabel = computed(() => {
    const transaction = this.transaction();
    return transaction ? CATEGORY_LABELS[transaction.category] : '';
  });

  protected readonly dateLabel = computed(() => {
    const transaction = this.transaction();
    if (!transaction) {
      return '';
    }

    return parseIsoDate(transaction.date).toLocaleDateString(this.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
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
      next: () => this.router.navigate(['/finance']),
      error: err => {
        this.deleting.set(false);
        this.deleteError.set(extractErrorMessage(err));
      }
    });
  }

  protected timestampLabel(iso: string): string {
    return new Date(iso).toLocaleString(this.locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

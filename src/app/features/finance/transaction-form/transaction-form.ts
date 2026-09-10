import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { TransactionResponse } from '../models/transaction.model';
import { TransactionService } from '../transaction.service';
import { TransactionFields } from '../components/transaction-fields/transaction-fields';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La PANTALLA de crear y editar movimiento, montada en `/finance/new` y
 * `/finance/:id/edit`.
 *
 * Solo queda aquí lo que tiene sentido detrás de una ruta: el `:id`, el GET, la
 * chrome de página y adónde se va al terminar. Los campos son de
 * `TransactionFields`, compartido con la pestaña "Finanzas" de `QuickCreate`.
 */
@Component({
  selector: 'app-transaction-form',
  imports: [RouterLink, TransactionFields],
  templateUrl: './transaction-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionForm {
  private readonly transactions = inject(TransactionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly transactionId = ((): string | null => {
    const raw = this.route.snapshot.paramMap.get('id');
    return raw !== null && UUID.test(raw) ? raw : null;
  })();

  protected readonly editing = this.transactionId !== null;

  /** Lo que se le pasa a `TransactionFields`. `null` es el alta, y también el rato que tarda el GET. */
  protected readonly transaction = signal<TransactionResponse | null>(null);

  protected readonly loading = signal(this.editing);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    if (this.transactionId === null) {
      return;
    }

    this.transactions.get(this.transactionId).subscribe({
      next: transaction => {
        this.transaction.set(transaction);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(extractErrorMessage(err));
      }
    });
  }

  /** Al crear no hay detalle previo, así que se va al del movimiento recién creado. */
  protected onSaved(saved: TransactionResponse): void {
    this.router.navigate(['/finance', this.transactionId ?? saved.id]);
  }

  protected onCancel(): void {
    this.router.navigate(this.transactionId ? ['/finance', this.transactionId] : ['/finance']);
  }
}

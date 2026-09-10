import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { parseIsoDate } from '../../../../core/date/date-range';
import { Icon } from '../../../../shared/ui/icon/icon';
import { MONEY_DIGITS } from '../../money';
import { TransactionResponse } from '../../models/transaction.model';
import { CATEGORY_LABELS, TYPE_LABELS } from '../../transaction-labels';

/**
 * Cuerpo de la vista de un movimiento: importe, tipo y lista de campos.
 * Mismo corte que `TaskDetailView`: lo montan la ruta `/finance/:id` y el cuadro flotante de Inicio.
 */
@Component({
  selector: 'app-transaction-detail-view',
  imports: [CurrencyPipe, Icon],
  templateUrl: './transaction-detail-view.html',
  styleUrl: './transaction-detail-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionDetailView {
  private readonly locale = inject(LOCALE_ID);

  protected readonly moneyDigits = MONEY_DIGITS;

  readonly transaction = input.required<TransactionResponse>();

  /** En `/finance/:id` el importe es el `<h1>`; en el diálogo baja a `<h2>`. */
  readonly headingLevel = input<1 | 2>(1);

  /** Lo consume el `aria-labelledby` del diálogo; en la ruta no hace falta. */
  readonly titleId = input<string | null>(null);

  /** Pinta el rótulo "Finanzas" encima del importe — ver `TaskDetailView.showDomain`. */
  readonly showDomain = input(false);

  protected readonly isIncome = computed(() => this.transaction().type === 'INCOME');

  /** El signo lo pone la plantilla, así que aquí el importe va siempre positivo. */
  protected readonly amount = computed(() => Math.abs(this.transaction().amount));

  protected readonly typeLabel = computed(() => TYPE_LABELS[this.transaction().type]);

  protected readonly categoryLabel = computed(() => CATEGORY_LABELS[this.transaction().category]);

  protected readonly dateLabel = computed(() =>
    parseIsoDate(this.transaction().date).toLocaleDateString(this.locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  );

  /** Marcas de auditoría: aquí sí interesa la hora exacta, no solo el día. */
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

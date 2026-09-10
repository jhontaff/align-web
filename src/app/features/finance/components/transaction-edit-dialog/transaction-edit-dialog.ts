import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild
} from '@angular/core';
import { Icon } from '../../../../shared/ui/icon/icon';
import { TransactionResponse } from '../../models/transaction.model';
import { TransactionFields } from '../transaction-fields/transaction-fields';

/** Mismo motivo que en `event-edit`: `id` es global al documento. */
let nextId = 0;

/**
 * Cáscara del cuadro flotante de edición de movimiento; gemelo de `TaskEditDialog`.
 * Los campos y la petición viven en `TransactionFields`, compartido con la ruta y con `QuickCreate`.
 */
@Component({
  selector: 'app-transaction-edit-dialog',
  imports: [Icon, TransactionFields],
  templateUrl: './transaction-edit-dialog.html',
  styleUrl: './transaction-edit-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionEditDialog {
  readonly transaction = input.required<TransactionResponse>();

  readonly saved = output<TransactionResponse>();
  readonly cancel = output<void>();

  private readonly id = nextId++;
  protected readonly titleId = `transaction-edit-dialog-title-${this.id}`;

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterRenderEffect(() => {
      const el = this.dialog()?.nativeElement;
      if (el && !el.open) {
        el.showModal();
      }
    });
  }

  protected onNativeClose(): void {
    this.cancel.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.dialog()?.nativeElement.close();
    }
  }

  protected onCloseClick(): void {
    this.dialog()?.nativeElement.close();
  }
}

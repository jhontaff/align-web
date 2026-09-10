import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { extractErrorMessage } from '../../../../core/http/extract-error-message';
import { optional } from '../../../../core/http/optional';
import { today } from '../../date-ranges';
import {
  TransactionCategory,
  TransactionRequest,
  TransactionResponse,
  TransactionUpdateRequest
} from '../../models/transaction.model';
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TYPE_LABELS,
  categoryType
} from '../../transaction-labels';
import { TransactionService } from '../../transaction.service';

/** Mismo motivo que en `event-fields`: `id` es global al documento. */
let nextId = 0;

const DESCRIPTION_MAX_LENGTH = 255;

interface CategoryOption {
  readonly value: TransactionCategory;
  readonly label: string;
}

function toOptions(categories: readonly TransactionCategory[]): CategoryOption[] {
  return categories.map(value => ({ value, label: CATEGORY_LABELS[value] }));
}

/**
 * El cuerpo del formulario de movimiento: campos, validación y la petición.
 *
 * Mismo corte que `TaskFields` y por el mismo motivo — la chrome y la
 * navegación las pone quien lo monta, que hoy son la ruta `TransactionForm` y la
 * pestaña "Finanzas" de `QuickCreate`. Ver el comentario de `TaskFields`.
 *
 * **No hay selector de tipo** (ingreso/gasto): lo deriva el servidor de la
 * categoría, así que el formulario solo lo ANUNCIA con `typeHint()`.
 */
@Component({
  selector: 'app-transaction-fields',
  imports: [ReactiveFormsModule],
  templateUrl: './transaction-fields.html',
  styleUrl: './transaction-fields.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionFields {
  private readonly fb = inject(FormBuilder);
  private readonly transactions = inject(TransactionService);

  readonly transaction = input<TransactionResponse | null>(null);

  readonly saved = output<TransactionResponse>();
  readonly cancel = output<void>();

  private readonly uid = `transaction-fields-${nextId++}`;

  protected readonly editing = computed(() => this.transaction() !== null);

  protected readonly expenseOptions = toOptions(EXPENSE_CATEGORIES);
  protected readonly incomeOptions = toOptions(INCOME_CATEGORIES);
  protected readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.group({
    amount: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(0)]
    }),
    category: this.fb.nonNullable.control<TransactionCategory | ''>('', {
      validators: [Validators.required]
    }),
    description: this.fb.nonNullable.control('', {
      validators: [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]
    }),
    date: this.fb.nonNullable.control(today(), { validators: [Validators.required] })
  });

  private readonly category = toSignal(this.form.controls.category.valueChanges, {
    initialValue: this.form.controls.category.value
  });

  protected readonly typeHint = computed(() => {
    const category = this.category();
    return category === '' ? null : TYPE_LABELS[categoryType(category)];
  });

  protected readonly typeIsIncome = computed(() => {
    const category = this.category();
    return category !== '' && categoryType(category) === 'INCOME';
  });

  constructor() {
    // Mismo uso legítimo de `effect` que en `event-fields`: sincroniza un signal
    // con una API imperativa externa (`FormGroup.reset`).
    effect(() => {
      const transaction = this.transaction();
      this.form.reset(transaction ? this.toFormValue(transaction) : this.emptyValue());
    });
  }

  protected fieldId(name: string): string {
    return `${this.uid}-${name}`;
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { amount, category } = this.form.getRawValue();
    if (amount === null || category === '') {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const transaction = this.transaction();
    const request$ = transaction
      ? this.transactions.update(transaction.id, this.toUpdateRequest(amount, category))
      : this.transactions.create(this.toCreateRequest(amount, category));

    request$.subscribe({
      next: saved => {
        this.submitting.set(false);
        this.saved.emit(saved);
      },
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  private toFormValue(transaction: TransactionResponse) {
    return {
      amount: transaction.amount,
      category: transaction.category,
      description: transaction.description ?? '',
      date: transaction.date
    };
  }

  /** La fecha arranca en hoy, no vacía: es el caso mayoritario al registrar un movimiento. */
  private emptyValue() {
    return {
      amount: null,
      category: '' as TransactionCategory | '',
      description: '',
      date: today()
    };
  }

  private toCreateRequest(amount: number, category: TransactionCategory): TransactionRequest {
    const { description, date } = this.form.getRawValue();

    return {
      amount,
      category,
      description: optional(description),
      date
    };
  }

  private toUpdateRequest(
    amount: number,
    category: TransactionCategory
  ): TransactionUpdateRequest {
    const { description, date } = this.form.getRawValue();

    return {
      amount,
      category,
      description: optional(description),
      date
    };
  }
}

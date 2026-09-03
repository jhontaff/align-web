import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { today } from '../date-ranges';
import {
  TransactionCategory,
  TransactionRequest,
  TransactionResponse,
  TransactionUpdateRequest
} from '../models/transaction.model';
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TYPE_LABELS,
  categoryType
} from '../transaction-labels';
import { TransactionService } from '../transaction.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DESCRIPTION_MAX_LENGTH = 255;

interface CategoryOption {
  readonly value: TransactionCategory;
  readonly label: string;
}

function toOptions(categories: readonly TransactionCategory[]): CategoryOption[] {
  return categories.map(value => ({ value, label: CATEGORY_LABELS[value] }));
}

@Component({
  selector: 'app-transaction-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransactionForm {
  private readonly fb = inject(FormBuilder);
  private readonly transactions = inject(TransactionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly transactionId = ((): string | null => {
    const raw = this.route.snapshot.paramMap.get('id');
    return raw !== null && UUID.test(raw) ? raw : null;
  })();

  protected readonly editing = this.transactionId !== null;

  protected readonly expenseOptions = toOptions(EXPENSE_CATEGORIES);
  protected readonly incomeOptions = toOptions(INCOME_CATEGORIES);
  protected readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly loading = signal(this.editing);
  protected readonly loadError = signal<string | null>(null);

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

  protected readonly cancelLink = computed(() =>
    this.transactionId ? ['/finance', this.transactionId] : ['/finance']
  );

  constructor() {
    if (this.transactionId === null) {
      return;
    }

    this.transactions.get(this.transactionId).subscribe({
      next: transaction => {
        this.form.patchValue(this.toFormValue(transaction));
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(extractErrorMessage(err));
      }
    });
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

    const id = this.transactionId;
    const request$ = id
      ? this.transactions.update(id, this.toUpdateRequest(amount, category))
      : this.transactions.create(this.toCreateRequest(amount, category));

    request$.subscribe({
      next: created => this.router.navigate(['/finance', id ?? created.id]),
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

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

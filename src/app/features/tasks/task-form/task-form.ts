import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TaskService } from '../task.service';
import { TaskRequest } from '../models/task.model';
import { extractErrorMessage } from '../../../core/http/extract-error-message';

@Component({
  selector: 'app-task-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './task-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskForm {
  private readonly fb = inject(FormBuilder);
  private readonly taskService = inject(TaskService);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    description: [''],
    priority: ['MEDIUM', [Validators.required]],
    dueDate: [''],
    dueTime: ['']
  });

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.taskService.create(this.form.getRawValue() as TaskRequest).subscribe({
      next: () => this.router.navigate(['/tasks']),
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }
}

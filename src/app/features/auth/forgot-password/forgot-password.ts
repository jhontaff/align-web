import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStateService } from '../../../core/auth/auth-state.service';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { Icon } from '../../../shared/ui/icon/icon';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly authState = inject(AuthStateService);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  /**
   * El backend responde `200` con el mismo mensaje exista o no el correo
   * (anti-enumeración) — este signal solo decide si se pinta el formulario
   * o la confirmación, nunca "correo enviado" vs. "correo no encontrado".
   */
  protected readonly sent = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  private readonly submitAttempted = signal(false);

  /**
   * Método y no `computed`: `AbstractControl.invalid`/`.touched` no son
   * reactivos, así que un `computed` encima nunca se recalcularía. Se apoya
   * en que `formControlName` ya marca `touched` al perder el foco, y en
   * `submitAttempted` para el caso de enviar sin haber tocado el campo.
   */
  protected emailInvalid(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.touched || this.submitAttempted());
  }

  protected emailErrorMessage(): string {
    const control = this.form.controls.email;
    if (control.hasError('required')) {
      return 'El correo es obligatorio.';
    }
    if (control.hasError('email')) {
      return 'Ingresa un correo válido.';
    }
    return '';
  }

  protected onSubmit(): void {
    this.submitAttempted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authState.forgotPassword(this.form.getRawValue()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sent.set(true);
      },
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStateService } from '../../../core/auth/auth-state.service';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { Icon } from '../../../shared/ui/icon/icon';
import { PASSWORD_RULES, passwordPolicy, passwordsMatch } from '../password-policy';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  /**
   * `withComponentInputBinding()` liga también query params, así que el
   * token llega aquí sin inyectar `ActivatedRoute` — ver la regla ya fijada
   * en CLAUDE.md para pantallas nuevas con parámetros de ruta/query.
   */
  readonly token = input<string>();

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  /**
   * `true` cuando el enlace es inválido, ya se usó o caducó — el backend
   * colapsa esos tres casos a propósito (anti-enumeración) y aquí se
   * distingue de un error de validación de campos, que sí deja el
   * formulario editable. Es una decisión de presentación del llamante,
   * no de `extractErrorMessage`, que es deliberadamente genérica.
   */
  protected readonly linkInvalid = signal(false);

  /** Sin `token` en la URL el enlace ya es inválido — ni siquiera hace falta enviar el formulario para saberlo. */
  protected readonly showInvalidLink = computed(() => !this.token() || this.linkInvalid());

  protected readonly passwordFocused = signal(false);
  protected readonly confirmFocused = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, passwordPolicy]],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordsMatch('newPassword', 'confirmPassword') }
  );

  private readonly passwordValue = toSignal(this.form.controls.newPassword.valueChanges, { initialValue: '' });

  protected readonly passwordChecks = computed(() => {
    const value = this.passwordValue();
    return PASSWORD_RULES.map(rule => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
  });

  private readonly confirmValue = toSignal(this.form.controls.confirmPassword.valueChanges, { initialValue: '' });

  protected readonly showMatch = computed(() => {
    const confirm = this.confirmValue();
    return this.confirmFocused() && confirm.length > 0 && confirm === this.passwordValue();
  });

  private readonly submitAttempted = signal(false);

  protected showMismatch(): boolean {
    return this.submitAttempted() && this.form.hasError('passwordsMismatch');
  }

  protected onSubmit(): void {
    this.submitAttempted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Guarda de tipos: si no hubiera token, `showInvalidLink()` ya habría
    // reemplazado el formulario por el aviso y esto no sería alcanzable.
    const token = this.token();
    if (!token) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authState.resetPassword({ token, ...this.form.getRawValue() }).subscribe({
      next: () => this.router.navigate(['/login'], { queryParams: { passwordReset: '1' } }),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);

        // 400 sin `errors` = "El enlace no es válido o ya expiró." — token
        // desconocido/usado/caducado, indistinguibles a propósito. Cualquier
        // otro 400 trae `errors` (validación de campos) y el formulario sigue.
        if (err.status === 400 && !(err.error as { errors?: unknown })?.errors) {
          this.linkInvalid.set(true);
          return;
        }

        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }
}

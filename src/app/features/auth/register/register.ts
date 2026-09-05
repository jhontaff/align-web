import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStateService } from '../../../core/auth/auth-state.service';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * Espejo de la política que el backend declara en `RegisterRequest`:
 * `minLength 8`, `maxLength 25` y un patrón que exige minúscula, mayúscula y dígito.
 *
 * Una sola declaración para las dos cosas que salen de ella —la validez del control
 * y la lista que ve el usuario— porque escribirlas por separado es cómo se acaba
 * exigiendo una mayúscula y anunciando otra cosa.
 */
interface PasswordRule {
  readonly id: string;
  readonly label: string;
  readonly test: (value: string) => boolean;
}

const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'Entre 8 y 25 caracteres', test: v => v.length >= 8 && v.length <= 25 },
  { id: 'lowercase', label: 'Una letra minúscula', test: v => /[a-z]/.test(v) },
  { id: 'uppercase', label: 'Una letra mayúscula', test: v => /[A-Z]/.test(v) },
  { id: 'digit', label: 'Un número', test: v => /\d/.test(v) }
];

function passwordPolicy(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const failed = PASSWORD_RULES.filter(rule => !rule.test(value)).map(rule => rule.id);
  return failed.length > 0 ? { passwordPolicy: failed } : null;
}

/**
 * Va en el grupo y no en el control: un validador de control no ve a su hermano, y
 * colgado de `confirmPassword` no volvería a ejecutarse al cambiar `password` después.
 */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, passwordPolicy]],
      confirmPassword: ['', [Validators.required]],
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]]
    },
    { validators: passwordsMatch }
  );

  private readonly passwordValue = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });

  /** Se recalcula en cada tecla: es lo que hace que la lista sea en vivo y no un mensaje de submit. */
  protected readonly passwordChecks = computed(() => {
    const value = this.passwordValue();
    return PASSWORD_RULES.map(rule => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
  });

  /** El error vive en el grupo, así que el campo no lo delata: hay que preguntarlo a mano. */
  protected showMismatch(): boolean {
    return this.form.controls.confirmPassword.touched && this.form.hasError('passwordsMismatch');
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    // `confirmPassword` SÍ viaja: el backend la exige y valida el cruce por su cuenta.
    this.authState.register(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/']),
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStateService } from '../../../core/auth/auth-state.service';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { Icon } from '../../../shared/ui/icon/icon';
import { PASSWORD_RULES, passwordPolicy, passwordsMatch } from '../../../core/auth/password-policy';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './register.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  /**
   * Abre y cierra la lista de requisitos. Se alimenta de `focus`/`blur` y no de `click`:
   * un `click` dejaría sin requisitos a quien llega al campo con Tab o desde un gestor
   * de contraseñas, que son justo los casos en los que nadie los ha leído todavía.
   */
  protected readonly passwordFocused = signal(false);
  protected readonly confirmFocused = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, passwordPolicy]],
      confirmPassword: ['', [Validators.required]],
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]]
    },
    { validators: passwordsMatch('password', 'confirmPassword') }
  );

  private readonly passwordValue = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });

  /** Se recalcula en cada tecla: es lo que hace que la lista sea en vivo y no un mensaje de submit. */
  protected readonly passwordChecks = computed(() => {
    const value = this.passwordValue();
    return PASSWORD_RULES.map(rule => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
  });

  private readonly confirmValue = toSignal(this.form.controls.confirmPassword.valueChanges, { initialValue: '' });

  /**
   * El check positivo de "coinciden". Exige contenido además de igualdad: dos campos
   * vacíos son iguales, pero anunciar ahí que la confirmación es correcta sería mentir.
   *
   * No hay variante "sin cumplir" a propósito — el caso negativo ya tiene su propio
   * mensaje de error, y pintar los dos a la vez se leería como una contradicción.
   */
  protected readonly showMatch = computed(() => {
    const confirm = this.confirmValue();
    return this.confirmFocused() && confirm.length > 0 && confirm === this.passwordValue();
  });

  private readonly submitAttempted = signal(false);

  /**
   * El aviso de que no coinciden NO sale al escribir ni al salir del campo: solo
   * si se intenta enviar. Mientras se escribe la confirmación, "no coinciden" es
   * cierto y completamente inútil — todavía no se ha terminado de teclear.
   *
   * Pero no puede desaparecer del todo: el botón no se deshabilita, así que sin
   * este mensaje pulsar Crear cuenta con contraseñas distintas no haría nada
   * visible y el usuario no sabría por qué.
   *
   * Es un método y no un `computed` porque `form.hasError()` no es reactivo:
   * un computed encima del estado del FormGroup no se recalcularía nunca.
   */
  protected showMismatch(): boolean {
    return this.submitAttempted() && this.form.hasError('passwordsMismatch');
  }

  protected onSubmit(): void {
    this.submitAttempted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    // `confirmPassword` SÍ viaja: el backend la exige y valida el cruce por su cuenta.
    this.authState.register(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/home']),
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }
}

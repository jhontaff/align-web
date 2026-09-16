import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStateService } from '../../../core/auth/auth-state.service';
import { PASSWORD_RULES, passwordPolicy, passwordsMatch } from '../../../core/auth/password-policy';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { Icon } from '../../../shared/ui/icon/icon';
import { UserService } from '../user.service';

/**
 * Editar perfil: nombre, foto, contraseña. El correo queda fuera a propósito
 * (ver CLAUDE.md) — cambiarlo pide su propio endpoint (`PUT /me/email`), sin
 * consumir aún.
 */
@Component({
  selector: 'app-profile-edit',
  imports: [ReactiveFormsModule, Avatar, Icon],
  templateUrl: './profile-edit.html',
  styleUrl: './profile-edit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileEdit {
  private readonly fb = inject(FormBuilder);
  private readonly authState = inject(AuthStateService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  protected readonly user = this.authState.user;
  protected readonly avatarUrl = this.userService.avatarUrl;
  protected readonly avatarSeed = computed(() => this.user()?.id ?? 'anon');

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]]
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly avatarBusy = signal(false);
  protected readonly avatarError = signal<string | null>(null);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    // Siembra el formulario en cuanto `user()` resuelve (puede seguir en
    // `null` al construirse, si se llega aquí con una recarga directa). No
    // pisa una edición en curso: `!form.dirty` es la guarda.
    effect(() => {
      const current = this.user();
      if (current && !this.form.dirty) {
        this.form.patchValue({ firstName: current.firstName, lastName: current.lastName });
      }
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.userService.updateProfile(this.form.getRawValue()).subscribe({
      next: user => {
        this.authState.applyUser(user);
        this.router.navigateByUrl('/profile');
      },
      error: err => {
        this.submitting.set(false);
        this.errorMessage.set(extractErrorMessage(err));
      }
    });
  }

  protected onPickPhoto(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // deja elegir el mismo archivo otra vez

    if (!file) {
      return;
    }

    this.avatarBusy.set(true);
    this.avatarError.set(null);

    this.userService.uploadAvatar(file).subscribe({
      next: () => this.refreshUser(),
      error: err => {
        this.avatarBusy.set(false);
        this.avatarError.set(extractErrorMessage(err));
      }
    });
  }

  protected onDeletePhoto(): void {
    this.avatarBusy.set(true);
    this.avatarError.set(null);

    this.userService.deleteAvatar().subscribe({
      next: () => this.refreshUser(),
      error: err => {
        this.avatarBusy.set(false);
        this.avatarError.set(extractErrorMessage(err));
      }
    });
  }

  /** Ni subir ni borrar el avatar devuelven el `UserResponse` fresco. */
  private refreshUser(): void {
    this.authState.hydrateUser().subscribe({
      next: () => this.avatarBusy.set(false),
      error: err => {
        this.avatarBusy.set(false);
        this.avatarError.set(extractErrorMessage(err));
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Cambiar contraseña — formulario independiente del de arriba: son dos
  // endpoints distintos (`PUT /me` vs. `PUT /me/password`), con sus propios
  // estados de envío/error/éxito. Mismos campos y misma política que
  // `reset-password.ts`, salvo el `currentPassword` adicional que exige aquí
  // el backend por tratarse de un cambio autenticado, no de un enlace de correo.
  // ---------------------------------------------------------------------------

  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordPolicy]],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordsMatch('newPassword', 'confirmPassword') }
  );

  protected readonly passwordSubmitting = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly passwordSuccess = signal(false);

  protected readonly newPasswordFocused = signal(false);
  protected readonly confirmPasswordFocused = signal(false);

  private readonly newPasswordValue = toSignal(this.passwordForm.controls.newPassword.valueChanges, {
    initialValue: ''
  });

  protected readonly newPasswordChecks = computed(() => {
    const value = this.newPasswordValue();
    return PASSWORD_RULES.map(rule => ({ id: rule.id, label: rule.label, met: rule.test(value) }));
  });

  private readonly confirmPasswordValue = toSignal(this.passwordForm.controls.confirmPassword.valueChanges, {
    initialValue: ''
  });

  protected readonly showPasswordMatch = computed(() => {
    const confirm = this.confirmPasswordValue();
    return this.confirmPasswordFocused() && confirm.length > 0 && confirm === this.newPasswordValue();
  });

  private readonly passwordSubmitAttempted = signal(false);

  protected showPasswordMismatch(): boolean {
    return this.passwordSubmitAttempted() && this.passwordForm.hasError('passwordsMismatch');
  }

  protected onChangePassword(): void {
    this.passwordSubmitAttempted.set(true);
    this.passwordSuccess.set(false);

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.passwordSubmitting.set(true);
    this.passwordError.set(null);

    this.userService.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.passwordSubmitting.set(false);
        this.passwordSuccess.set(true);
        this.passwordSubmitAttempted.set(false);
        // Nada de contraseñas se queda en el DOM ni en el estado del formulario
        // más tiempo del necesario, ni siquiera tras un cambio exitoso.
        this.passwordForm.reset();
      },
      error: err => {
        this.passwordSubmitting.set(false);
        this.passwordError.set(extractErrorMessage(err));
      }
    });
  }
}

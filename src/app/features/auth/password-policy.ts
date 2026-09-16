import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Espejo de la política que el backend declara en `@ValidPassword`
 * (`RegisterRequest`, `ResetPasswordRequest`, `PasswordUpdateRequest`):
 * `minLength 8`, `maxLength 25` y un patrón que exige minúscula, mayúscula y dígito.
 *
 * Una sola declaración para las dos cosas que salen de ella —la validez del control
 * y la lista que ve el usuario— porque escribirlas por separado es cómo se acaba
 * exigiendo una mayúscula y anunciando otra cosa.
 */
export interface PasswordRule {
  readonly id: string;
  readonly label: string;
  readonly test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'Entre 8 y 25 caracteres', test: v => v.length >= 8 && v.length <= 25 },
  { id: 'lowercase', label: 'Una letra minúscula', test: v => /[a-z]/.test(v) },
  { id: 'uppercase', label: 'Una letra mayúscula', test: v => /[A-Z]/.test(v) },
  { id: 'digit', label: 'Un número', test: v => /\d/.test(v) }
];

export function passwordPolicy(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const failed = PASSWORD_RULES.filter(rule => !rule.test(value)).map(rule => rule.id);
  return failed.length > 0 ? { passwordPolicy: failed } : null;
}

/**
 * Va en el grupo y no en el control: un validador de control no ve a su hermano, y
 * colgado de `confirmPassword` no volvería a ejecutarse al cambiar `password` después.
 *
 * Los nombres de los controles son parámetros porque `register` los llama
 * `password`/`confirmPassword` y `reset-password` los llama `newPassword`/`confirmPassword`.
 */
export function passwordsMatch(passwordControl: string, confirmControl: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordControl)?.value;
    const confirmPassword = group.get(confirmControl)?.value;
    return password === confirmPassword ? null : { passwordsMismatch: true };
  };
}

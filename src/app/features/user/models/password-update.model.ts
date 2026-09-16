// Espejo de `PasswordUpdateRequest` en el backend (`PUT /api/users/me/password`).
// `currentPassword` solo lleva `@NotBlank` del lado del servidor (no `@ValidPassword`):
// una contraseña vieja que ya no cumpla una política endurecida más tarde sigue
// sirviendo para autenticar el cambio. `confirmPassword` lo valida el backend
// por su cuenta (error `passwordConfirmed`), igual que en `ResetPasswordRequest`.
export interface PasswordUpdateRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

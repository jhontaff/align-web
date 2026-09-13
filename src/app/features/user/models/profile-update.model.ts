// Espejo de `ProfileUpdateRequest` en el backend: solo firstName/lastName.
// No hay nombre de usuario ni teléfono en ningún endpoint de usuario.
export interface ProfileUpdateRequest {
  firstName: string;
  lastName: string;
}

// user-response.model.ts
export interface UserResponse {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
}

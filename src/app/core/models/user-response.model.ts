// user-response.model.ts
export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  hasAvatar: boolean;
}

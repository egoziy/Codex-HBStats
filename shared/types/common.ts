// shared/types/common.ts

export type UserRole = 'USER' | 'ADMIN';

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

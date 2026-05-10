// shared/types/mobile-api.ts
// Single source of truth for HBStats mobile API JSON contracts.
// Both backend handlers and mobile clients import from here.

import type { SafeUser } from './common';

// ---------- Auth ----------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// /auth/logout: no body, no response payload.
// /auth/logout-all: no body, no response payload.

// ---------- Errors ----------

export interface ApiError {
  error: string;
  code?: string;
}

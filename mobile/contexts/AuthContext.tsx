import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient } from '@/lib/apiClient';
import {
  setAccessToken,
  storeRefreshToken,
  loadRefreshToken,
  storeUser,
  loadUser,
  clearRefreshToken,
} from '@/lib/auth';
import type { LoginResponse } from '@shared/types/mobile-api';
import type { SafeUser } from '@shared/types/common';

interface AuthState {
  user: SafeUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [refresh, savedUser] = await Promise.all([loadRefreshToken(), loadUser()]);
      if (!cancelled) {
        if (refresh && savedUser) setUser(savedUser);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.post<LoginResponse>('/auth/login', { email, password });
    setAccessToken(res.accessToken);
    await storeRefreshToken(res.refreshToken);
    await storeUser(res.user);
    setUser(res.user);
  };

  const logout = async () => {
    const refresh = await loadRefreshToken();
    try {
      await apiClient.post('/auth/logout', refresh ? { refreshToken: refresh } : {});
    } catch {
      // ignore — we still clear locally
    }
    await clearRefreshToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getRefreshToken, setSessionLostHandler, setTokens } from '../api/client';
import type { TokenResponse, UserResponse } from '../api/types';

interface AuthState {
  user: UserResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(() => getRefreshToken() !== null);

  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    if (!getRefreshToken()) return;
    api<UserResponse>('/users/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api<TokenResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    setTokens(tokens);
    setUser(await api<UserResponse>('/users/me'));
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      await api<UserResponse>('/auth/register', {
        method: 'POST',
        body: { username, email, password },
        auth: false,
      });
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await api('/auth/logout', { method: 'POST', body: { refreshToken } });
    } finally {
      setTokens(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

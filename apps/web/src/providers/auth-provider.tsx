import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api-client';
import type { User, LoginResponse } from '@runq/types';

const TOKEN_KEY = 'runq-token';

interface AuthContextValue {
  user: Omit<User, 'createdAt' | 'updatedAt'> | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, tenant: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Omit<User, 'createdAt' | 'updatedAt'> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    api.setToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const applyToken = useCallback((t: string) => {
    localStorage.setItem(TOKEN_KEY, t);
    api.setToken(t);
    setToken(t);
  }, []);

  const doLogin = useCallback(
    async (email: string, password: string, tenant: string) => {
      const res = await api.post<{ data: LoginResponse }>('/auth/login', { email, password, tenant });
      applyToken(res.data.token);
      setUser(res.data.user);
    },
    [applyToken],
  );

  // On mount: restore token or auto-login in dev
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      api.setToken(stored);
      api
        .get<{ data: { user: Omit<User, 'createdAt' | 'updatedAt'> } }>('/auth/me')
        .then((res) => {
          setToken(stored);
          setUser(res.data.user);
        })
        .catch(() => {
          clearAuth();
        })
        .finally(() => setIsLoading(false));
      return;
    }

    // Dev auto-login: skip the login page during development
    if (import.meta.env.DEV) {
      doLogin('admin@demo.com', 'admin123', 'demo-company')
        .catch(() => {})
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [clearAuth, doLogin]);

  const login = doLogin;

  const logout = useCallback(() => {
    clearAuth();
    window.location.href = '/login';
  }, [clearAuth]);

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!user, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

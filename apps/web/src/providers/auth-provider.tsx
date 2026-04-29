import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api-client';
import type { User, LoginResponse } from '@runq/types';

const TOKEN_KEY = 'runq-token';

// Decode the `exp` claim (seconds → ms). Returns null if the token is
// malformed or has no exp — caller should treat that as "no passive timer".
function decodeJwtExpMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

let isRedirecting = false;
function redirectToLoginExpired() {
  if (isRedirecting) return;
  if (window.location.pathname.endsWith('/login')) return;
  isRedirecting = true;
  localStorage.removeItem('runq-token');
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  window.location.replace(`${base}/login?session=expired`);
}

interface AuthContextValue {
  user: Omit<User, 'createdAt' | 'updatedAt'> | null;
  token: string | null;
  isAuthenticated: boolean;
  isPlatform: boolean;
  isLoading: boolean;
  login: (email: string, password: string, tenant: string) => Promise<{ platform: boolean }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isAuthenticated: false,
  isPlatform: false,
  isLoading: true,
  login: async () => ({ platform: false }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Omit<User, 'createdAt' | 'updatedAt'> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isPlatform, setIsPlatform] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const expiryTimerRef = useRef<number | null>(null);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const handleSessionExpired = useCallback(() => {
    clearExpiryTimer();
    localStorage.removeItem(TOKEN_KEY);
    api.setToken(null);
    setToken(null);
    setUser(null);
    redirectToLoginExpired();
  }, [clearExpiryTimer]);

  const scheduleExpiry = useCallback(
    (t: string) => {
      clearExpiryTimer();
      const expMs = decodeJwtExpMs(t);
      if (expMs === null) return;
      const ms = expMs - Date.now();
      if (ms <= 0) {
        handleSessionExpired();
        return;
      }
      expiryTimerRef.current = window.setTimeout(handleSessionExpired, ms);
    },
    [clearExpiryTimer, handleSessionExpired],
  );

  const clearAuth = useCallback(() => {
    clearExpiryTimer();
    localStorage.removeItem(TOKEN_KEY);
    api.setToken(null);
    setToken(null);
    setUser(null);
  }, [clearExpiryTimer]);

  const applyToken = useCallback(
    (t: string) => {
      localStorage.setItem(TOKEN_KEY, t);
      api.setToken(t);
      setToken(t);
      scheduleExpiry(t);
    },
    [scheduleExpiry],
  );

  const doLogin = useCallback(
    async (email: string, password: string, tenant: string) => {
      const res = await api.post<{ data: LoginResponse & { platform?: boolean } }>('/auth/login', { email, password, tenant });
      applyToken(res.data.token);
      setUser(res.data.user);
      const platform = !!res.data.platform;
      setIsPlatform(platform);
      return { platform };
    },
    [applyToken],
  );

  // Register 401 handler so any API call with an expired/invalidated token
  // boots the user out, even if no passive timer is running yet.
  useEffect(() => {
    api.setOnUnauthorized(handleSessionExpired);
    return () => api.setOnUnauthorized(null);
  }, [handleSessionExpired]);

  // Cross-tab sync: if another tab clears the token (logout or expiry),
  // log this tab out too. StorageEvent only fires in OTHER tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY && e.newValue === null) {
        handleSessionExpired();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [handleSessionExpired]);

  // Clean up the passive expiry timer if the provider unmounts.
  useEffect(() => clearExpiryTimer, [clearExpiryTimer]);

  // On mount: restore token or auto-login in dev
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      // If the stored token is already past its exp, skip the /auth/me round
      // trip — bounce straight to login.
      const expMs = decodeJwtExpMs(stored);
      if (expMs !== null && expMs <= Date.now()) {
        clearAuth();
        setIsLoading(false);
        redirectToLoginExpired();
        return;
      }

      api.setToken(stored);
      api
        .get<{ data: { user: Omit<User, 'createdAt' | 'updatedAt'>; platform?: boolean } }>('/auth/me')
        .then((res) => {
          setToken(stored);
          setUser(res.data.user);
          setIsPlatform(!!res.data.platform);
          scheduleExpiry(stored);
        })
        .catch(() => {
          clearAuth();
          redirectToLoginExpired();
        })
        .finally(() => setIsLoading(false));
      return;
    }

    // Dev auto-login: skip the login page during development.
    // BUT: don't auto-login as a tenant user when the user is trying to
    // access the super-admin panel — that would mask the actual login screen.
    const onAdminRoute = window.location.pathname.includes('/admin');
    if (import.meta.env.DEV && !onAdminRoute) {
      doLogin('vaidehi@vrindavandairy.com', 'Vrindavan@2026', 'demo-company')
        .catch(() => {})
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [clearAuth, doLogin, scheduleExpiry]);

  const login = doLogin;

  const logout = useCallback(() => {
    clearAuth();
    window.location.href = '/login';
  }, [clearAuth]);

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!user, isPlatform, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

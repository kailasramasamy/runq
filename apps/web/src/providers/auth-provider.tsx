import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api-client';
import type { User, LoginResponse, TenantMembership } from '@runq/types';

const TOKEN_KEY = 'runq-token';
const ACTIVE_TENANT_KEY = 'runq-active-tenant-id';

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

/**
 * Public unauthenticated routes that own their own session model.
 * Visitors landing on these must never be redirected to /login by the
 * global auth provider — portals use slug-based / token-based sessions.
 */
function isPublicRoute(pathname: string): boolean {
  return pathname.startsWith('/portal/') || pathname.startsWith('/vendor-portal/');
}

function redirectToLoginExpired() {
  if (isRedirecting) return;
  if (window.location.pathname.endsWith('/login')) return;
  if (isPublicRoute(window.location.pathname)) return;
  isRedirecting = true;
  localStorage.removeItem('runq-token');
  localStorage.removeItem(ACTIVE_TENANT_KEY);
  // App routes live at the document root. Don't prefix with
  // import.meta.env.BASE_URL — that's the asset base (`/app-assets/` in
  // prod) and using it for app navigation produces `/app-assets/login`,
  // which 404s.
  window.location.replace(`/login?session=expired`);
}

// Send an unauthenticated visitor (no token at all) to the login page.
// Returns true when a redirect was issued, so the caller can skip settling
// isLoading and avoid a flash of unprotected content before navigation.
function redirectToLogin(): boolean {
  if (isRedirecting) return true;
  if (window.location.pathname.endsWith('/login')) return false;
  if (isPublicRoute(window.location.pathname)) return false;
  isRedirecting = true;
  window.location.replace(`/login`);
  return true;
}

interface AuthContextValue {
  user: Omit<User, 'createdAt' | 'updatedAt'> | null;
  token: string | null;
  isAuthenticated: boolean;
  isPlatform: boolean;
  isLoading: boolean;
  tenants: TenantMembership[];
  activeTenantId: string | null;
  switchTenant: (tenantId: string) => void;
  /** Re-fetch /auth/me to refresh the tenants list. Used when callers expect
   * memberships to have changed (e.g., after creating an invite, opening the
   * tenant switcher, or returning from a long focus break). */
  refreshTenants: () => Promise<void>;
  login: (email: string, password: string, tenant: string) => Promise<{ platform: boolean }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isAuthenticated: false,
  isPlatform: false,
  isLoading: true,
  tenants: [],
  activeTenantId: null,
  switchTenant: () => {},
  refreshTenants: async () => {},
  login: async () => ({ platform: false }),
  logout: () => {},
});

interface AuthMeResponse {
  data: {
    user: Omit<User, 'createdAt' | 'updatedAt'> | null;
    tenant: { id: string; name: string; slug: string } | null;
    tenants?: TenantMembership[];
    platform?: boolean;
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Omit<User, 'createdAt' | 'updatedAt'> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isPlatform, setIsPlatform] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_TENANT_KEY),
  );
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
    localStorage.removeItem(ACTIVE_TENANT_KEY);
    api.setToken(null);
    api.setTenantId(null);
    setToken(null);
    setUser(null);
    setTenants([]);
    setActiveTenantId(null);
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
    localStorage.removeItem(ACTIVE_TENANT_KEY);
    api.setToken(null);
    api.setTenantId(null);
    setToken(null);
    setUser(null);
    setTenants([]);
    setActiveTenantId(null);
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

  const applyTenant = useCallback((tenantId: string | null) => {
    if (tenantId) {
      localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
    } else {
      localStorage.removeItem(ACTIVE_TENANT_KEY);
    }
    api.setTenantId(tenantId);
    setActiveTenantId(tenantId);
  }, []);

  const switchTenant = useCallback((tenantId: string) => {
    applyTenant(tenantId);
    // Best-effort audit log of the switch. Fire-and-forget — we reload
    // immediately after so the await isn't worth blocking on.
    api.post('/auth/log-switch', {}).catch(() => { /* non-critical */ });
    // Hard reload to drop all in-flight queries and re-fetch every screen
    // under the new tenant scope. Cheap and correct; can be replaced with
    // a query-client invalidation pass later if we want softer UX.
    window.location.reload();
  }, [applyTenant]);

  const doLogin = useCallback(
    async (email: string, password: string, tenant: string) => {
      const res = await api.post<{ data: LoginResponse & { platform?: boolean } }>('/auth/login', { email, password, tenant });
      applyToken(res.data.token);
      setUser(res.data.user);
      const platform = !!res.data.platform;
      setIsPlatform(platform);
      // Tenant from login response (legacy: single-tenant). /auth/me will
      // shortly populate the full tenants[] list.
      if (!platform && res.data.user.tenantId) {
        applyTenant(res.data.user.tenantId);
      }
      return { platform };
    },
    [applyToken, applyTenant],
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
      if (e.key === ACTIVE_TENANT_KEY && e.newValue && e.newValue !== activeTenantId) {
        // Another tab switched tenant — sync this tab.
        api.setTenantId(e.newValue);
        setActiveTenantId(e.newValue);
        window.location.reload();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [handleSessionExpired, activeTenantId]);

  // Clean up the passive expiry timer if the provider unmounts.
  useEffect(() => clearExpiryTimer, [clearExpiryTimer]);

  // On mount: restore token, hydrate active tenant, fetch /auth/me
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const expMs = decodeJwtExpMs(stored);
      if (expMs !== null && expMs <= Date.now()) {
        clearAuth();
        setIsLoading(false);
        redirectToLoginExpired();
        return;
      }

      api.setToken(stored);
      const storedTenantId = localStorage.getItem(ACTIVE_TENANT_KEY);
      if (storedTenantId) api.setTenantId(storedTenantId);

      api
        .get<AuthMeResponse>('/auth/me')
        .then((res) => {
          setToken(stored);
          setUser(res.data.user);
          setIsPlatform(!!res.data.platform);
          const list = res.data.tenants ?? [];
          setTenants(list);
          // Active tenant: prefer server's view (it returned the active tenant
          // it resolved). If the server's tenant is in our list, use it;
          // otherwise fall back to first membership.
          const serverActive = res.data.tenant?.id ?? null;
          const valid = serverActive && list.some((t) => t.tenantId === serverActive)
            ? serverActive
            : list[0]?.tenantId ?? null;
          applyTenant(valid);
          scheduleExpiry(stored);
        })
        .catch((err: unknown) => {
          // Only force a sign-out for true auth failures. Other errors
          // (rate-limit 429, network blips, server 500s) should leave the
          // session intact — the api-client's 401 handler already deals
          // with token-level unauthorized responses.
          const status = (err as { statusCode?: number; status?: number } | null)?.statusCode
            ?? (err as { status?: number } | null)?.status
            ?? 0;
          if (status === 401) {
            clearAuth();
            redirectToLoginExpired();
          }
          // Otherwise: keep the user signed in but log so we can diagnose.
          // eslint-disable-next-line no-console
          console.warn('[auth] /auth/me failed (non-401), keeping session', err);
        })
        .finally(() => setIsLoading(false));
      return;
    }

    // Dev auto-login: skip the login page during development.
    const onAdminRoute = window.location.pathname.includes('/admin');
    if (import.meta.env.DEV && !onAdminRoute) {
      doLogin('vaidehi@vrindavandairy.com', 'Vrindavan@2026', 'demo-company')
        .then(() => api.get<AuthMeResponse>('/auth/me'))
        .then((res) => {
          if (!res) return;
          setTenants(res.data.tenants ?? []);
          const serverActive = res.data.tenant?.id ?? null;
          if (serverActive) applyTenant(serverActive);
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    } else {
      // No token. In dev the auto-login above handles non-admin routes, so
      // this branch only runs for dev /admin (leave it rendering). In prod,
      // an unauthenticated visitor must be sent to /login.
      const redirected = !import.meta.env.DEV && redirectToLogin();
      if (!redirected) setIsLoading(false);
    }
  }, [clearAuth, doLogin, scheduleExpiry, applyTenant]);

  const login = doLogin;

  const logout = useCallback(() => {
    clearAuth();
    window.location.href = '/login';
  }, [clearAuth]);

  const refreshTenants = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get<AuthMeResponse>('/auth/me');
      if (res.data.user) setUser(res.data.user);
      const list = res.data.tenants ?? [];
      setTenants(list);
      // If the server's active tenant disagrees with localStorage (e.g., we
      // joined a new tenant elsewhere), keep the user on their current one
      // unless it's no longer in the list. In that case, fall back to first.
      if (activeTenantId && !list.some((t) => t.tenantId === activeTenantId)) {
        applyTenant(list[0]?.tenantId ?? null);
      }
    } catch {
      // Silent — the next 401 will redirect to login if the token is bad.
    }
  }, [token, activeTenantId, applyTenant]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isPlatform,
        isLoading,
        tenants,
        activeTenantId,
        switchTenant,
        refreshTenants,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** True when the current user has read-only access to the active tenant. */
export function useIsReadOnly(): boolean {
  const { user } = useContext(AuthContext);
  return user?.role === 'viewer';
}

// Roles allowed into the Finance module. `client_owner` is an owner of a
// client tenant — owner-equivalent. `hr` and `viewer` are HR-only.
const FINANCE_MODULE_ROLES = new Set<string>(['owner', 'accountant', 'client_owner']);

/** True when the role may open the Finance module at all. */
export function canAccessFinanceModule(role: string | undefined | null): boolean {
  return role != null && FINANCE_MODULE_ROLES.has(role);
}

// Roles with HR-admin access — the full HR menu incl. setup, payroll, TDS,
// onboarding, etc. `viewer` only gets HR self-service / manager-scoped pages.
const HR_ADMIN_ROLES = new Set<string>(['owner', 'accountant', 'client_owner', 'hr']);

/** True when the role administers HR (vs. employee/manager self-service). */
export function canManageHrModule(role: string | undefined | null): boolean {
  return role != null && HR_ADMIN_ROLES.has(role);
}

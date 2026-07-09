import { ReactNode, useEffect } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  Activity,
  Flag,
  Megaphone,
  Settings,
  Smartphone,
  LogOut,
  History,
  LifeBuoy,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';

const NAV: Array<{ label: string; path: string; icon: React.ComponentType<{ className?: string }> }> = [
  { label: 'Overview', path: '/admin', icon: LayoutDashboard },
  { label: 'Tenants', path: '/admin/tenants', icon: Building2 },
  { label: 'Billing', path: '/admin/billing', icon: CreditCard },
  { label: 'Users', path: '/admin/users', icon: Users },
  { label: 'Observability', path: '/admin/observability', icon: Activity },
  { label: 'Feature Flags', path: '/admin/feature-flags', icon: Flag },
  { label: 'App Config', path: '/admin/app-config', icon: Smartphone },
  { label: 'Announcements', path: '/admin/announcements', icon: Megaphone },
  { label: 'Support', path: '/admin/support', icon: LifeBuoy },
  { label: 'Audit Log', path: '/admin/audit-log', icon: History },
  { label: 'Settings', path: '/admin/settings', icon: Settings },
];

export function AdminShell({ children }: { children?: ReactNode }) {
  const { user, logout, isAuthenticated, isPlatform, isLoading } = useAuth();
  const { theme } = useTheme();
  const routerState = useRouterState();
  const current = routerState.location.pathname;
  const logoSrc = `${import.meta.env.BASE_URL}${theme === 'dark' ? 'runq-light.png' : 'runq-dark.png'}`;

  // Guard: if not a platform user, kick to login. Catches the case of a stale
  // tenant token in localStorage and the dev auto-login (which is now skipped
  // on /admin, but this is a belt-and-braces check).
  useEffect(() => {
    if (isLoading) return;
    // Routes are served at root; only static assets live under BASE_URL
    // (/app-assets/). So the login path is root-relative, never BASE_URL-prefixed
    // — otherwise the guard bounces to /app-assets/login, which 404s.
    if (!isAuthenticated) {
      window.location.replace('/login');
      return;
    }
    if (!isPlatform) {
      // Authenticated as tenant user — clear it and bounce to login.
      localStorage.removeItem('runq-token');
      window.location.replace('/login');
    }
  }, [isLoading, isAuthenticated, isPlatform]);

  if (isLoading || !isAuthenticated || !isPlatform) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-sm text-zinc-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Left rail */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <img src={logoSrc} alt="runQ" className="h-7" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded">
            admin
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {NAV.map(({ label, path, icon: Icon }) => {
            const isActive =
              path === '/admin'
                ? current === '/admin' || current === '/admin/'
                : current.startsWith(path);
            return (
              <Link
                key={path}
                to={path as '/admin'}
                className={[
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
          <div className="px-2 py-1.5 mb-2">
            <div className="text-sm font-medium truncate">{user?.name ?? '—'}</div>
            <div className="text-xs text-zinc-500 truncate">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">{children ?? <Outlet />}</div>
      </main>
    </div>
  );
}

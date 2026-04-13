import { useState, useEffect, useSyncExternalStore } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  ArrowUpFromLine,
  ArrowDownToLine,
  Landmark,
  BookOpen,
  Settings,
  Sun,
  Moon,
  BarChart3,
  GitBranch,
  Users,
  Package,
  Receipt,
  Menu,
  X,
  Zap,
  LogOut,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../providers/theme-provider';
import { useAuth } from '../../providers/auth-provider';
import { useCompanySettings } from '../../hooks/queries/use-settings';

const ICON_SIZE = 20;

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Accounts Payable', path: '/ap', icon: ArrowUpFromLine },
  { label: 'Accounts Receivable', path: '/ar', icon: ArrowDownToLine },
  { label: 'Banking', path: '/banking', icon: Landmark },
  { label: 'General Ledger', path: '/gl', icon: BookOpen },
  { label: 'Masters', path: '/masters', icon: Package },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Expenses', path: '/expenses', icon: Receipt },
  { label: 'Workflows', path: '/workflows', icon: GitBranch },
  { label: 'Vendor Mgmt', path: '/vendor-management', icon: Users },
  { label: 'Audit', path: '/audit/gap-scan', icon: ShieldCheck },
  { label: 'Settings', path: '/settings', icon: Settings },
];

const navLinkClasses = (isActive: boolean, collapsed: boolean) =>
  cn(
    'flex items-center rounded-md transition-colors',
    collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2 text-sm',
    isActive
      ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
      : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200',
  );

function SidebarContent({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { data: companyData } = useCompanySettings();
  const companyName = companyData?.data?.name;

  const isActivePath = (path: string) =>
    path === '/' ? currentPath === '/' : currentPath.startsWith(path);

  return (
    <>
      {/* ── Logo + sidebar toggle ── */}
      <div className={cn('shrink-0', collapsed ? 'px-2 pt-3 pb-1' : 'px-4 pt-3 pb-1')}>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
          <Link to="/" className="flex items-center gap-2" onClick={onNavigate}>
            {collapsed ? (
              <img src={`${import.meta.env.BASE_URL}runq-favicon.png`} alt="runQ" className="h-6 w-6" />
            ) : (
              <>
                <img src={`${import.meta.env.BASE_URL}${theme === 'dark' ? 'runq-light.png' : 'runq-dark.png'}`} alt="runQ" className="h-7" />
                <span className="rounded border border-indigo-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Finance</span>
              </>
            )}
          </Link>
          {!collapsed && onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Collapse sidebar"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main nav — scrollbar hidden until hover ── */}
      <nav className={cn(
        'mt-1 flex-1 space-y-0.5 overflow-y-auto',
        '[scrollbar-width:none] hover:[scrollbar-width:thin]',
        '[&::-webkit-scrollbar]:w-0 hover:[&::-webkit-scrollbar]:w-1.5',
        '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700',
        '[&::-webkit-scrollbar-track]:bg-transparent',
        collapsed ? 'px-1.5' : 'px-2',
      )}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={navLinkClasses(isActivePath(item.path), collapsed)}
            >
              <Icon size={ICON_SIZE} strokeWidth={1.75} />
              {!collapsed && item.label}
            </Link>
          );
        })}

        {/* ── Bottom nav items (Help, Sign out) ── */}
        <div className={cn('!mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-800', collapsed ? 'mx-0' : 'mx-1')}>
          <Link
            to="/help"
            onClick={onNavigate}
            title={collapsed ? 'Help' : undefined}
            className={navLinkClasses(isActivePath('/help'), collapsed)}
          >
            <HelpCircle size={ICON_SIZE} strokeWidth={1.75} />
            {!collapsed && 'Help'}
          </Link>
          <button
            onClick={logout}
            title={collapsed ? 'Sign out' : undefined}
            className={cn(
              navLinkClasses(false, collapsed),
              'w-full',
            )}
          >
            <LogOut size={ICON_SIZE} strokeWidth={1.75} />
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </nav>

      {/* ── Footer ── */}
      <div className={cn(
        'shrink-0 border-t border-zinc-200 dark:border-zinc-800',
        collapsed ? 'flex flex-col items-center gap-1 py-2' : 'flex items-center gap-1 px-3 py-2',
      )}>
        {collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </>
  );
}

const COLLAPSED_KEY = 'runq-sidebar-collapsed';
const WIDE_QUERY = '(min-width: 1440px)';

function useIsWideScreen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(WIDE_QUERY);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}

/**
 * Desktop sidebar — visible at md+ (768px).
 *
 *   - Below 1440px: defaults to collapsed (icon-only, w-16). User can
 *     still toggle to expand if they want — it's a default, not forced.
 *   - At 1440px+: defaults to expanded (w-60). User can collapse.
 *   - State persisted in localStorage across sessions.
 */
export function Sidebar() {
  const isWide = useIsWideScreen();
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      return stored != null ? stored === '1' : null;
    } catch { return null; }
  });

  // If user has never toggled (null), auto-collapse on narrow screens.
  // If user HAS toggled, respect their choice regardless of screen size.
  const collapsed = userCollapsed != null ? userCollapsed : !isWide;

  function toggle() {
    setUserCollapsed((prev) => {
      const next = prev != null ? !prev : isWide; // first toggle: opposite of auto-default
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'hidden md:flex h-screen flex-col border-r border-zinc-200 bg-white text-zinc-900 transition-[width] duration-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <SidebarContent collapsed={collapsed} onToggleCollapse={toggle} />
    </aside>
  );
}

/** Mobile top bar with hamburger — visible only on mobile */
export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  const routerState = useRouterState();

  useEffect(() => { setOpen(false); }, [routerState.location.pathname]);

  useEffect(() => {
    if (open) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="md:hidden">
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Link to="/" className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}${theme === 'dark' ? 'runq-light.png' : 'runq-dark.png'}`} alt="runQ" className="h-6" />
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-zinc-900 animate-slide-in-left">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}

const mobileBottomItems = [
  { label: 'Home', path: '/', icon: LayoutDashboard },
  { label: 'Receivables', path: '/ar', icon: ArrowDownToLine },
  { label: 'Invoice', path: '/ar/quick-templates', icon: Zap, primary: true },
  { label: 'Payables', path: '/ap', icon: ArrowUpFromLine },
  { label: 'Banking', path: '/banking', icon: Landmark },
];

/** Mobile bottom navigation — visible only on phones */
export function MobileBottomNav() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-around px-1">
        {mobileBottomItems.map((item) => {
          const isActive = item.path === '/' ? currentPath === '/' : currentPath.startsWith(item.path);
          const Icon = item.icon;

          if (item.primary) {
            return (
              <Link key={item.path} to={item.path} className="flex flex-col items-center -mt-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 active:bg-indigo-700">
                  <Icon size={22} />
                </div>
                <span className="mt-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">{item.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 px-3 text-[10px] font-medium transition-colors',
                isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500',
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

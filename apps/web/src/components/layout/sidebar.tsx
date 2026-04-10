import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../providers/theme-provider';
import { useAuth } from '../../providers/auth-provider';
import { useCompanySettings } from '../../hooks/queries/use-settings';

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
  { label: 'Settings', path: '/settings', icon: Settings },
];

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
  const { user, logout } = useAuth();
  const { data: companyData } = useCompanySettings();
  const companyName = companyData?.data?.name;

  return (
    <>
      <div className={cn('flex h-14 items-center px-4', collapsed ? 'justify-center' : 'justify-between')}>
        <Link to="/" className="flex items-center gap-2" onClick={onNavigate}>
          <img src={`${import.meta.env.BASE_URL}${theme === 'dark' ? 'runq-light.png' : 'runq-dark.png'}`} alt="runQ" className="h-7" />
          {!collapsed && (
            <span className="rounded border border-indigo-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Finance</span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={toggleTheme}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
      </div>

      <nav className="mt-4 flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = item.path === '/'
            ? currentPath === '/'
            : currentPath.startsWith(item.path);
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-md transition-colors',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5 text-sm',
                isActive
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200',
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle — desktop only */}
      {onToggleCollapse && (
        <div className="px-2 py-1">
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex w-full items-center rounded-md py-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
              collapsed ? 'justify-center px-2' : 'gap-3 px-3 text-sm',
            )}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      )}

      <div className={cn('border-t border-zinc-200 dark:border-zinc-800', collapsed ? 'p-2 space-y-1' : 'px-3 py-3')}>
        {collapsed ? (
          <>
            <Link
              to="/help"
              onClick={onNavigate}
              title="User Guide"
              className="flex items-center justify-center rounded-md p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <HelpCircle size={18} />
            </Link>
            <button
              onClick={logout}
              title="Sign out"
              className="flex w-full items-center justify-center rounded-md p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <LogOut size={18} />
            </button>
          </>
        ) : (
          <>
            {/* Company identity — subtle, not competing with nav */}
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {(companyName ?? '?')[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium leading-tight text-zinc-800 dark:text-zinc-200">
                  {companyName ?? 'Loading...'}
                </p>
                <p className="truncate text-[11px] leading-tight text-zinc-400 dark:text-zinc-500">
                  {user?.email ?? ''}
                </p>
              </div>
            </div>

            {/* Action links — clean horizontal row */}
            <div className="flex items-center gap-1">
              <Link
                to="/help"
                onClick={onNavigate}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <HelpCircle size={14} />
                Help
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const COLLAPSED_KEY = 'runq-sidebar-collapsed';

/** Desktop sidebar — hidden below 1440px, collapsible via toggle */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'hidden min-[1440px]:flex h-screen flex-col border-r border-zinc-200 bg-white text-zinc-900 transition-[width] duration-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
        collapsed ? 'w-14' : 'w-60',
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

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [routerState.location.pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="min-[1440px]:hidden">
      {/* Top bar */}
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

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
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

const bottomNavItems = [
  { label: 'Home', path: '/', icon: LayoutDashboard },
  { label: 'Receivables', path: '/ar', icon: ArrowDownToLine },
  { label: 'Invoice', path: '/ar/quick-templates', icon: Zap, primary: true },
  { label: 'Payables', path: '/ap', icon: ArrowUpFromLine },
  { label: 'Banking', path: '/banking', icon: Landmark },
];

/** Mobile bottom navigation — visible only on mobile */
export function MobileBottomNav() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] min-[1440px]:hidden dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-around px-1">
        {bottomNavItems.map((item) => {
          const isActive = item.path === '/'
            ? currentPath === '/'
            : currentPath.startsWith(item.path);
          const Icon = item.icon;

          if (item.primary) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center -mt-4"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 active:bg-indigo-700">
                  <Icon size={22} />
                </div>
                <span className="mt-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 px-3 text-[10px] font-medium transition-colors',
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-zinc-400 dark:text-zinc-500',
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

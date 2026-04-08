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
  { label: 'User Guide', path: '/help', icon: HelpCircle },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { data: companyData } = useCompanySettings();
  const companyName = companyData?.data?.name;

  return (
    <>
      <div className="flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2" onClick={onNavigate}>
          <img src={`${import.meta.env.BASE_URL}${theme === 'dark' ? 'runq-light.png' : 'runq-dark.png'}`} alt="runQ" className="h-7" />
          <span className="rounded border border-indigo-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Finance</span>
        </Link>
        <button
          onClick={toggleTheme}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <nav className="mt-4 flex-1 space-y-1 px-2 overflow-y-auto">
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
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200',
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {companyName ?? 'Loading...'}
        </p>
        <p className="mb-3 truncate text-xs text-zinc-500 dark:text-zinc-500">
          {user?.email ?? ''}
        </p>
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        >
          <LogOut size={16} strokeWidth={2} />
          Sign out
        </button>
      </div>
    </>
  );
}

/** Desktop sidebar — hidden on mobile */
export function Sidebar() {
  return (
    <aside className="hidden md:flex h-screen w-60 flex-col border-r border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <SidebarContent />
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
    <div className="md:hidden">
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-zinc-800 dark:bg-zinc-900">
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

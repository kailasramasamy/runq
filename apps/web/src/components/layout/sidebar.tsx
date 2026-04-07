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
} from 'lucide-react';
import { LogOut } from 'lucide-react';
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

export function Sidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { data: companyData } = useCompanySettings();
  const companyName = companyData?.data?.name;

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={theme === 'dark' ? '/runq-light.png' : '/runq-dark.png'} alt="runQ" className="h-7" />
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
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
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
        <p className="truncate text-xs text-zinc-500">{companyName ?? 'Loading...'}</p>
        <div className="flex items-center justify-between">
          <p className="truncate text-xs text-zinc-400 dark:text-zinc-600">{user?.email ?? ''}</p>
          <button
            onClick={logout}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

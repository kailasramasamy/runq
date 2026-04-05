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
import { cn } from '../../lib/utils';
import { useTheme } from '../../providers/theme-provider';

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Accounts Payable', path: '/ap', icon: ArrowUpFromLine },
  { label: 'Accounts Receivable', path: '/ar', icon: ArrowDownToLine },
  { label: 'Banking', path: '/banking', icon: Landmark },
  { label: 'General Ledger', path: '/gl', icon: BookOpen },
  { label: 'Masters', path: '/masters', icon: Package },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Expenses', path: '/hr', icon: Receipt },
  { label: 'Workflows', path: '/workflows', icon: GitBranch },
  { label: 'Vendor Mgmt', path: '/vendor-management', icon: Users },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export function Sidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="flex h-screen w-60 flex-col bg-zinc-900 text-zinc-100">
      <div className="flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 70" className="h-7">
            <text x="90" y="55" fontFamily="'League Spartan', sans-serif" fontSize="60" fontWeight="800" fill="#ffffff" letterSpacing="-1" textAnchor="middle">
              run<tspan fill="#a5b4fc">Q</tspan>
            </text>
          </svg>
          <span className="text-xs text-zinc-400">Finance</span>
        </Link>
        <button
          onClick={toggleTheme}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
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
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200',
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 p-4">
        <p className="text-xs text-zinc-500">Demo Company Pvt Ltd</p>
        <p className="text-xs text-zinc-600">admin@demo.com</p>
      </div>
    </aside>
  );
}

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard, Sparkles, Inbox, Folder,
  FileText, ClipboardList, Truck, FileMinus, Receipt, Users, AlarmClock,
  FileInput, ClipboardCheck, PackageCheck, FileX, CreditCard, Building2, Wallet, Split,
  Package, Warehouse, MoveRight,
  Landmark, NotebookPen, BookOpen, Boxes, BarChart3, Target,
  ShieldCheck, FileCheck2, ScrollText, History,
  GitBranch, Layers, UserCog, Plug, Settings,
  Zap, LifeBuoy, Command, Bell, Mail,
  PanelLeftClose, PanelLeftOpen, Menu, X,
  ArrowDownToLine, ArrowUpFromLine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../providers/theme-provider';

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  count?: number;
  badge?: string;
};
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    ],
  },
  {
    label: 'Money in',
    items: [
      { key: 'invoices', label: 'Invoices', icon: FileText, path: '/ar/invoices' },
      { key: 'quick-invoice', label: 'Quick invoice', icon: Zap, path: '/ar/quick-templates' },
      { key: 'quotes-orders', label: 'Quotes & orders', icon: ClipboardList, path: '/ar/quotes' },
      { key: 'creditnotes', label: 'Credit notes', icon: FileMinus, path: '/ar/credit-notes' },
      { key: 'receipts', label: 'Receipts', icon: Receipt, path: '/ar/receipts' },
      { key: 'customers', label: 'Customers', icon: Users, path: '/ar/customers' },
      { key: 'collections', label: 'Collections', icon: AlarmClock, path: '/ar/collections' },
    ],
  },
  {
    label: 'Money out',
    items: [
      { key: 'bills', label: 'Bills', icon: FileInput, path: '/ap/bills' },
      { key: 'debitnotes', label: 'Debit notes', icon: FileX, path: '/ap/debit-notes' },
      { key: 'payments', label: 'Payments', icon: CreditCard, path: '/ap/payments' },
      { key: 'vendors', label: 'Vendors', icon: Building2, path: '/ap/vendors' },
      { key: 'expenses', label: 'Expenses', icon: Wallet, path: '/expenses' },
      { key: 'payruns', label: 'Pay runs', icon: Split, path: '/ap/pay-runs' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { key: 'items', label: 'Items', icon: Package, path: '/masters/items' },
      { key: 'categories', label: 'Categories', icon: Layers, path: '/masters/categories' },
      { key: 'price-lists', label: 'Price lists', icon: BarChart3, path: '/masters/price-lists' },
    ],
  },
  {
    label: 'Books',
    items: [
      { key: 'banking', label: 'Banking', icon: Landmark, path: '/banking' },
      { key: 'journal', label: 'Journal entries', icon: NotebookPen, path: '/gl/journal-entries' },
      { key: 'ledger', label: 'General ledger', icon: BookOpen, path: '/gl' },
      { key: 'assets', label: 'Fixed assets', icon: Boxes, path: '/fa' },
      { key: 'reports', label: 'Reports', icon: BarChart3, path: '/reports' },
      { key: 'budgets', label: 'Budgets', icon: Target, path: '/budgets' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { key: 'gst-returns', label: 'GST returns', icon: ShieldCheck, path: '/gst/returns' },
      { key: 'gst-recon', label: 'GST reconciliation', icon: ClipboardCheck, path: '/gst/reconciliation' },
      { key: 'gst-readiness', label: 'GST readiness', icon: FileCheck2, path: '/gst/readiness' },
      { key: 'audit', label: 'Audit trail', icon: History, path: '/audit/gap-scan' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { key: 'wf-approvals', label: 'Approvals', icon: ClipboardCheck, path: '/workflows/approvals' },
      { key: 'wf-tasks', label: 'Tasks', icon: ScrollText, path: '/workflows/tasks' },
      { key: 'workflows', label: 'Workflows', icon: GitBranch, path: '/workflows' },
      { key: 'users', label: 'Users & roles', icon: UserCog, path: '/settings/users' },
      { key: 'client-invites', label: 'Invitations', icon: Mail, path: '/settings/client-invites' },
      { key: 'settings', label: 'Settings', icon: Settings, path: '/settings/setup' },
    ],
  },
];

function NavItemRow({
  item, active, collapsed, onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        'relative flex items-center rounded-md transition-colors',
        collapsed ? 'mx-auto h-9 w-9 justify-center' : 'gap-2.5 px-2.5 py-1.5',
        active
          ? 'nav-active'
          : '',
      )}
      style={{
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        background: active ? 'var(--surface-2)' : 'transparent',
      }}
    >
      <Icon size={16} strokeWidth={active ? 2 : 1.75} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-[13px]">{item.label}</span>
          {item.count != null ? (
            <span
              className="num rounded border px-1 py-0.5 text-[10px]"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text-2)',
              }}
            >
              {item.count}
            </span>
          ) : item.badge ? (
            <span
              className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              {item.badge}
            </span>
          ) : null}
        </>
      )}
    </Link>
  );
}

function SidebarContent({
  onNavigate, collapsed = false, onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { theme } = useTheme();

  const allPaths = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.path));
  const bestMatch = allPaths
    .filter((p) => (p === '/' ? currentPath === '/' : currentPath === p || currentPath.startsWith(p + '/')))
    .reduce((a, b) => (b.length > a.length ? b : a), '');
  const isActivePath = (path: string) => path === bestMatch;

  return (
    <>
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          'flex h-[52px] shrink-0 items-center border-b',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
        style={{ borderColor: 'var(--border-soft)' }}
      >
        {collapsed ? (
          onToggleCollapse ? (
            <button
              onClick={onToggleCollapse}
              title="Expand sidebar"
              className="group/toggle relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-[color:var(--surface-2)]"
            >
              <img
                src={`${import.meta.env.BASE_URL}runq-favicon.png`}
                alt="runQ"
                className="absolute h-5 w-5 transition-opacity group-hover/toggle:opacity-0"
              />
              <span
                className="opacity-0 transition-opacity group-hover/toggle:opacity-100"
                style={{ color: 'var(--text-2)' }}
              >
                <PanelLeftOpen size={15} />
              </span>
            </button>
          ) : (
            <Link to="/" onClick={onNavigate}>
              <img src={`${import.meta.env.BASE_URL}runq-favicon.png`} alt="runQ" className="h-5 w-5" />
            </Link>
          )
        ) : (
          <>
            <Link to="/" className="flex min-w-0 items-center gap-2" onClick={onNavigate}>
              <img
                src={`${import.meta.env.BASE_URL}${theme === 'dark' ? 'runq-light.png' : 'runq-dark.png'}`}
                alt="runQ"
                className="h-[22px] shrink-0"
              />
              <span
                className="whitespace-nowrap rounded px-1 py-[1px] text-[9px] font-semibold uppercase tracking-[0.1em]"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                Finance
              </span>
            </Link>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-[color:var(--surface-2)]"
                style={{ color: 'var(--text-3)' }}
              >
                <PanelLeftClose size={15} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Nav */}
      <nav
        className={cn(
          'flex-1 space-y-3 overflow-y-auto scrollbar-auto',
          collapsed ? 'py-2' : 'px-3 py-3',
        )}
      >
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {!collapsed && group.label ? (
              <div
                className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: 'var(--text-3)' }}
              >
                {group.label}
              </div>
            ) : collapsed && gi > 0 ? (
              <div
                className="mx-3 my-2 border-t"
                style={{ borderColor: 'var(--border-soft)' }}
              />
            ) : null}
            <div className={collapsed ? 'space-y-0.5' : 'space-y-[1px]'}>
              {group.items.map((it) => (
                <NavItemRow
                  key={it.key}
                  item={it}
                  active={isActivePath(it.path)}
                  collapsed={collapsed}
                  onClick={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Upgrade card */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <div
            className="relative overflow-hidden rounded-lg border p-3"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          >
            <div
              className="absolute -right-8 -top-8 h-24 w-24 rounded-full"
              style={{ background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)' }}
            />
            <div className="relative">
              <div className="mb-1 flex items-center gap-1.5">
                <Zap size={12} style={{ color: 'var(--accent-text)' }} className="shrink-0" />
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  runQ Agent Pro
                </span>
              </div>
              <p className="mb-2 text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>
                Auto-reconcile, draft GST, send reminders — hands-free.
              </p>
              <button
                className="w-full rounded-md py-1.5 text-[11px] font-medium text-white hover:opacity-90"
                style={{ background: 'var(--accent)' }}
              >
                Upgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer: help + ⌘K */}
      <div
        className={cn(
          'border-t',
          collapsed ? 'flex flex-col items-center gap-1 p-2' : 'flex items-center gap-1 px-3 py-2',
        )}
        style={{ borderColor: 'var(--border-soft)' }}
      >
        <Link
          to="/help"
          title="Help & docs"
          className={cn(
            'flex items-center rounded-md text-[12px] hover:bg-[color:var(--surface-2)]',
            collapsed ? 'h-8 w-8 justify-center' : 'h-7 flex-1 gap-2 px-2',
          )}
          style={{ color: 'var(--text-3)' }}
        >
          <LifeBuoy size={13} />
          {!collapsed && <span>Help & docs</span>}
        </Link>
        <button
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
          }}
          title="Keyboard shortcuts (⌘K)"
          className={cn(
            'flex items-center justify-center rounded-md hover:bg-[color:var(--surface-2)]',
            collapsed ? 'h-8 w-8' : 'h-7 w-7',
          )}
          style={{ color: 'var(--text-3)' }}
        >
          <Command size={13} />
        </button>
      </div>
    </>
  );
}

const COLLAPSED_KEY = 'runq-sidebar-collapsed';
const WIDE_QUERY = '(min-width: 1280px)';

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

export function Sidebar() {
  const isWide = useIsWideScreen();
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      return stored != null ? stored === '1' : null;
    } catch { return null; }
  });

  const collapsed = userCollapsed != null ? userCollapsed : !isWide;

  function toggle() {
    setUserCollapsed((prev) => {
      const next = prev != null ? !prev : isWide;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'group/sidebar hidden h-screen flex-col border-r transition-[width] duration-200 md:flex',
        collapsed ? 'w-[60px]' : 'w-[232px]',
      )}
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border-soft)',
        color: 'var(--text-1)',
      }}
    >
      <SidebarContent collapsed={collapsed} onToggleCollapse={toggle} />
    </aside>
  );
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  const routerState = useRouterState();

  useEffect(() => { setOpen(false); }, [routerState.location.pathname]);
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="md:hidden">
      <header
        className="flex h-14 items-center justify-between border-b px-4"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <Link to="/" className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}${theme === 'dark' ? 'runq-light.png' : 'runq-dark.png'}`} alt="runQ" className="h-6" />
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-2 hover:bg-[color:var(--surface-2)]"
          style={{ color: 'var(--text-2)' }}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            className="animate-slide-in-left relative flex h-full w-72 max-w-[85vw] flex-col shadow-xl"
            style={{ background: 'var(--surface)' }}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 hover:bg-[color:var(--surface-2)]"
              style={{ color: 'var(--text-3)' }}
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

export function MobileBottomNav() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-around px-1">
        {mobileBottomItems.map((item) => {
          const isActive = item.path === '/' ? currentPath === '/' : currentPath.startsWith(item.path);
          const Icon = item.icon;
          if (item.primary) {
            return (
              <Link key={item.path} to={item.path} className="-mt-4 flex flex-col items-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg"
                  style={{ background: 'var(--accent)' }}
                >
                  <Icon size={22} />
                </div>
                <span className="mt-0.5 text-[10px] font-medium" style={{ color: 'var(--accent-text)' }}>
                  {item.label}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors"
              style={{ color: isActive ? 'var(--accent-text)' : 'var(--text-3)' }}
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

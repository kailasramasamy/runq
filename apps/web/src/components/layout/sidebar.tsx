import { useState, useEffect, useSyncExternalStore } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useInboxCount } from '@/hooks/queries/use-inbox';
import { usePendingPaymentClaimsCount } from '@/hooks/queries/use-payment-claims';
import {
  LayoutDashboard, Sparkles, Inbox, Folder,
  FileText, ClipboardList, Truck, FileMinus, Receipt, Users, AlarmClock,
  FileInput, ClipboardCheck, PackageCheck, FileX, CreditCard, Building2, Wallet, Split,
  Package, Warehouse, MoveRight,
  Landmark, NotebookPen, BookOpen, Boxes, BarChart3, Target, PieChart,
  ShieldCheck, ScrollText, History,
  GitBranch, Layers, UserCog, Plug, Settings,
  Zap, LifeBuoy, Command, Bell, Mail,
  PanelLeftClose, PanelLeftOpen, Menu, X,
  ArrowDownToLine, ArrowUpFromLine, HandCoins,
  ChevronDown, Briefcase, CalendarClock, CalendarDays, Clock3, IdCard,
  Network,
  Check, Wallet2, UserCircle2, CalendarOff, Scale, Coins, Calculator, HardHat,
  Megaphone, MapPin, UserPlus, LogOut, FileCheck2, Award, Gift,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../providers/theme-provider';
import { useAuth, canAccessFinanceModule, canManageHrModule } from '../../providers/auth-provider';

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  count?: number;
  badge?: string;
};
export type NavGroup = { label: string | null; items: NavItem[] };

export const HR_NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { key: 'hr-dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/hr' },
      { key: 'hr-announcements', label: 'Announcements', icon: Megaphone, path: '/hr/announcements' },
    ],
  },
  {
    label: 'Workforce',
    items: [
      { key: 'hr-employees', label: 'Employees', icon: Users, path: '/hr/employees' },
      { key: 'hr-org-chart', label: 'Org chart', icon: Network, path: '/hr/org-chart' },
      { key: 'hr-departments', label: 'Departments', icon: Briefcase, path: '/hr/departments' },
      { key: 'hr-designations', label: 'Designations', icon: IdCard, path: '/hr/designations' },
      { key: 'hr-contract-labour', label: 'Contract labour', icon: HardHat, path: '/hr/contract-labour' },
    ],
  },
  {
    label: 'Time & attendance',
    items: [
      { key: 'hr-attendance', label: 'Attendance', icon: CalendarClock, path: '/hr/attendance' },
      { key: 'hr-attendance-punches', label: 'Punches', icon: Clock3, path: '/hr/attendance-punches' },
      { key: 'hr-regularizations', label: 'Regularizations', icon: ClipboardList, path: '/hr/regularizations' },
      { key: 'hr-shifts', label: 'Shifts', icon: Clock3, path: '/hr/shifts' },
      { key: 'hr-holidays', label: 'Holidays', icon: CalendarDays, path: '/hr/holidays' },
      { key: 'hr-geo-fences', label: 'Geo-fences', icon: MapPin, path: '/hr/geo-fences' },
    ],
  },
  {
    label: 'Leave',
    items: [
      { key: 'hr-leave-requests', label: 'Leave requests', icon: CalendarOff, path: '/hr/leave-requests' },
      { key: 'hr-leave-balances', label: 'Leave balances', icon: Scale, path: '/hr/leave-balances' },
      { key: 'hr-leave-types', label: 'Leave types', icon: Layers, path: '/hr/leave-types' },
    ],
  },
  {
    label: 'Lifecycle',
    items: [
      { key: 'hr-onboarding', label: 'Onboarding', icon: UserPlus, path: '/hr/onboarding' },
      { key: 'hr-letters', label: 'Letters', icon: FileText, path: '/hr/letters' },
      { key: 'hr-fnf', label: 'Full & final', icon: LogOut, path: '/hr/fnf' },
    ],
  },
  {
    label: 'Performance & engagement',
    items: [
      { key: 'hr-performance', label: 'Performance', icon: Target, path: '/hr/performance' },
      { key: 'hr-helpdesk', label: 'Helpdesk', icon: LifeBuoy, path: '/hr/helpdesk' },
    ],
  },
  {
    label: 'Payroll',
    items: [
      { key: 'hr-payroll-runs', label: 'Payroll runs', icon: Calculator, path: '/hr/payroll-runs' },
      { key: 'hr-salary-structures', label: 'Salary structures', icon: Layers, path: '/hr/salary-structures' },
      { key: 'hr-salary-components', label: 'Salary components', icon: Coins, path: '/hr/salary-components' },
      { key: 'hr-tax-declarations', label: 'Tax declarations (12BB)', icon: FileCheck2, path: '/hr/tax-declarations' },
      { key: 'hr-loans', label: 'Loans & advances', icon: CreditCard, path: '/hr/loans' },
      { key: 'hr-loan-policy', label: 'Loan policy', icon: ShieldCheck, path: '/hr/loan-policy' },
      { key: 'hr-tds-challans', label: 'TDS challans', icon: Landmark, path: '/hr/tds-challans' },
      { key: 'hr-form-24q', label: 'Form 24Q (TDS)', icon: Receipt, path: '/hr/form-24q' },
      { key: 'hr-form-16', label: 'Form 16', icon: FileText, path: '/hr/form-16' },
    ],
  },
  {
    label: 'Money',
    items: [
      { key: 'hr-expenses', label: 'Expense claims', icon: Wallet, path: '/hr/expense-claims' },
      { key: 'hr-rewards', label: 'Rewards', icon: Award, path: '/hr/rewards' },
      { key: 'hr-reward-types', label: 'Reward types', icon: Gift, path: '/hr/reward-types' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { key: 'hr-settings', label: 'Settings', icon: Settings, path: '/settings/setup' },
    ],
  },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/finance' },
      { key: 'analytics', label: 'Analytics', icon: PieChart, path: '/finance/analytics' },
      { key: 'inbox', label: 'Inbox', icon: Inbox, path: '/finance/inbox' },
    ],
  },
  {
    label: 'Money in',
    items: [
      { key: 'invoices', label: 'Invoices', icon: FileText, path: '/finance/ar/invoices' },
      { key: 'quick-invoice', label: 'Quick invoice', icon: Zap, path: '/finance/ar/quick-templates' },
      { key: 'quotes-orders', label: 'Quotes & orders', icon: ClipboardList, path: '/finance/ar/quotes' },
      { key: 'creditnotes', label: 'Credit notes', icon: FileMinus, path: '/finance/ar/credit-notes' },
      { key: 'receipts', label: 'Receipts', icon: Receipt, path: '/finance/ar/receipts' },
      { key: 'payment-claims', label: 'Payment reports', icon: HandCoins, path: '/finance/ar/payment-claims' },
      { key: 'customers', label: 'Customers', icon: Users, path: '/finance/ar/customers' },
      { key: 'collections', label: 'Collections', icon: AlarmClock, path: '/finance/ar/collections' },
    ],
  },
  {
    label: 'Money out',
    items: [
      { key: 'bills', label: 'Bills', icon: FileInput, path: '/finance/ap/bills' },
      { key: 'debitnotes', label: 'Debit notes', icon: FileX, path: '/finance/ap/debit-notes' },
      { key: 'payments', label: 'Payments', icon: CreditCard, path: '/finance/ap/payments' },
      { key: 'vendors', label: 'Vendors', icon: Building2, path: '/finance/ap/vendors' },
      { key: 'expenses', label: 'Expenses', icon: Wallet, path: '/finance/expenses' },
      { key: 'payruns', label: 'Pay runs', icon: Split, path: '/finance/ap/pay-runs' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { key: 'items', label: 'Items', icon: Package, path: '/finance/masters/items' },
      { key: 'categories', label: 'Categories', icon: Layers, path: '/finance/masters/categories' },
      { key: 'price-lists', label: 'Price lists', icon: BarChart3, path: '/finance/masters/price-lists' },
    ],
  },
  {
    label: 'Books',
    items: [
      { key: 'banking', label: 'Banking', icon: Landmark, path: '/finance/banking' },
      { key: 'journal', label: 'Journal entries', icon: NotebookPen, path: '/finance/gl/journal-entries' },
      { key: 'ledger', label: 'General ledger', icon: BookOpen, path: '/finance/gl' },
      { key: 'assets', label: 'Fixed assets', icon: Boxes, path: '/finance/fa' },
      { key: 'reports', label: 'Reports', icon: BarChart3, path: '/finance/reports' },
      { key: 'budgets', label: 'Budgets', icon: Target, path: '/finance/budgets' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { key: 'gst-returns', label: 'GST returns', icon: ShieldCheck, path: '/finance/gst/returns' },
      { key: 'gst-recon', label: 'GST reconciliation', icon: ClipboardCheck, path: '/finance/gst/reconciliation' },
      { key: 'gst-readiness', label: 'GST readiness', icon: FileCheck2, path: '/finance/gst/readiness' },
      { key: 'audit', label: 'Audit trail', icon: History, path: '/finance/audit/gap-scan' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { key: 'wf-approvals', label: 'Approvals', icon: ClipboardCheck, path: '/finance/workflows/approvals' },
      { key: 'wf-tasks', label: 'Tasks', icon: ScrollText, path: '/finance/workflows/tasks' },
      { key: 'workflows', label: 'Workflows', icon: GitBranch, path: '/finance/workflows' },
      { key: 'users', label: 'Users & roles', icon: UserCog, path: '/settings/users' },
      { key: 'client-invites', label: 'Invitations', icon: Mail, path: '/settings/client-invites' },
      { key: 'settings', label: 'Settings', icon: Settings, path: '/settings/setup' },
    ],
  },
];

// HR nav keys a non-admin (`viewer` / line manager) may see — self-service
// and manager-scoped pages only. Everything else (setup, payroll, TDS,
// onboarding, lifecycle…) is HR-admin only. Mirrors the API allow-lists.
const VIEWER_HR_KEYS = new Set<string>([
  'hr-dashboard', 'hr-announcements', 'hr-employees', 'hr-org-chart',
  'hr-attendance', 'hr-regularizations', 'hr-holidays',
  'hr-leave-requests', 'hr-leave-balances', 'hr-expenses',
]);

type ModuleKey = 'finance' | 'hr' | 'inventory';
const MODULES: { key: ModuleKey; label: string; path: string; icon: LucideIcon; description: string }[] = [
  { key: 'finance', label: 'Finance', path: '/finance', icon: Wallet2, description: 'AR, AP, banking, GST' },
  { key: 'hr', label: 'HR & Payroll', path: '/hr', icon: UserCircle2, description: 'Employees, attendance' },
  { key: 'inventory', label: 'Inventory', path: '/inventory', icon: Boxes, description: 'Stock, GRN, dispatch' },
];

export const INVENTORY_NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { key: 'inv-dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/inventory' },
    ],
  },
  {
    label: 'Stock',
    items: [
      { key: 'inv-on-hand', label: 'On hand', icon: Boxes, path: '/inventory/stock/on-hand' },
      { key: 'inv-ledger', label: 'Stock ledger', icon: NotebookPen, path: '/inventory/stock/ledger' },
    ],
  },
  {
    label: 'Movement',
    items: [
      { key: 'inv-grn', label: 'Receipts (GRN)', icon: PackageCheck, path: '/inventory/grn' },
      { key: 'inv-delivery', label: 'Dispatches', icon: Truck, path: '/inventory/delivery' },
      { key: 'inv-transfers', label: 'Transfers', icon: MoveRight, path: '/inventory/transfers' },
      { key: 'inv-adjustments', label: 'Adjustments', icon: Split, path: '/inventory/adjustments' },
      { key: 'inv-stock-take', label: 'Stock take', icon: ClipboardCheck, path: '/inventory/stock-take' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { key: 'inv-summary', label: 'Stock summary', icon: Layers, path: '/inventory/reports/summary' },
      { key: 'inv-valuation', label: 'Valuation', icon: Wallet, path: '/inventory/reports/valuation' },
      { key: 'inv-ageing', label: 'Ageing', icon: History, path: '/inventory/reports/ageing' },
      { key: 'inv-movement', label: 'Movement', icon: BarChart3, path: '/inventory/reports/movement' },
      { key: 'inv-dead-stock', label: 'Dead stock', icon: FileX, path: '/inventory/reports/dead-stock' },
      { key: 'inv-reorder', label: 'Reorder alerts', icon: AlarmClock, path: '/inventory/reports/reorder' },
      { key: 'inv-expiry', label: 'Batch expiry', icon: CalendarClock, path: '/inventory/reports/expiry' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { key: 'inv-warehouses', label: 'Warehouses', icon: Warehouse, path: '/inventory/warehouses' },
      { key: 'inv-items', label: 'Items', icon: Package, path: '/inventory/items' },
      { key: 'inv-categories', label: 'Categories', icon: Layers, path: '/inventory/categories' },
      { key: 'inv-serials', label: 'Serials', icon: ScrollText, path: '/inventory/serials' },
    ],
  },
];

function ModuleSwitcher({
  activeModule, onNavigate,
}: {
  activeModule: ModuleKey;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = MODULES.find((m) => m.key === activeModule) ?? MODULES[0];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-module-switcher]')) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="relative" data-module-switcher>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors"
        style={{
          background: open ? 'var(--accent)' : 'var(--accent-soft)',
          color: open ? 'white' : 'var(--accent-text)',
        }}
      >
        {active.label}
        <ChevronDown size={11} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1.5 w-[220px] overflow-hidden rounded-lg border shadow-lg"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div
            className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: 'var(--text-3)' }}
          >
            Switch module
          </div>
          {MODULES.map((m) => {
            const isActive = m.key === activeModule;
            const ModIcon = m.icon;
            return (
              <Link
                key={m.key}
                to={m.path}
                role="menuitem"
                onClick={() => { setOpen(false); onNavigate?.(); }}
                className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] hover:bg-[color:var(--surface-2)]"
                style={{ color: 'var(--text-1)' }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                  style={{
                    background: isActive ? 'var(--accent)' : 'var(--surface-2)',
                    color: isActive ? 'white' : 'var(--text-2)',
                  }}
                >
                  <ModIcon size={14} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate font-medium">{m.label}</span>
                  <span className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{m.description}</span>
                </span>
                {isActive && <Check size={14} style={{ color: 'var(--accent-text)' }} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

// Remembers the module the user was last in before entering Settings. The
// /settings/* pages are shared across modules and carry no module info in
// their path, so without this they'd always snap the sidebar back to Finance.
// Module-scoped so the desktop and mobile sidebars share one memory.
let lastActiveModule: ModuleKey = 'finance';

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
  const { user } = useAuth();
  // Only owner / accountant / client_owner reach the Finance module;
  // hr + viewer are HR-only. Hide the module switcher for them and lock
  // the sidebar to HR.
  const financeAllowed = canAccessFinanceModule(user?.role);
  // The Upgrade card is a billing CTA — only owners/accountants/HR admins can act on it.
  const showUpgrade = canManageHrModule(user?.role);
  // Help & docs is for owners/accountants/HR admins — not employee self-service.
  const showHelp = canManageHrModule(user?.role);
  const inboxQuery = useInboxCount();
  const inboxCount = inboxQuery.data?.data?.count ?? 0;
  const pendingClaimsQuery = usePendingPaymentClaimsCount();
  const pendingClaimsCount = pendingClaimsQuery.data ?? 0;

  // Settings is a shared namespace — keep whichever module the user came from.
  const isSettings = currentPath === '/settings' || currentPath.startsWith('/settings/');
  const isInventory = currentPath === '/inventory' || currentPath.startsWith('/inventory/');
  const activeModule: ModuleKey = !financeAllowed
    ? 'hr'
    : isSettings
      ? lastActiveModule
      : isInventory
        ? 'inventory'
        : currentPath === '/hr' || currentPath.startsWith('/hr/')
          ? 'hr'
          : 'finance';
  if (!isSettings) lastActiveModule = activeModule;
  // The ⌘K shortcut palette is Finance-only.
  const showCommand = activeModule === 'finance';
  let groups =
    activeModule === 'hr' ? HR_NAV_GROUPS
      : activeModule === 'inventory' ? INVENTORY_NAV_GROUPS
      : NAV_GROUPS;
  // Non-admin HR users get the trimmed self-service menu.
  if (activeModule === 'hr' && !canManageHrModule(user?.role)) {
    groups = HR_NAV_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((i) => VIEWER_HR_KEYS.has(i.key)) }))
      .filter((g) => g.items.length > 0);
  }

  const allPaths = groups.flatMap((g) => g.items.map((i) => i.path));
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
            <div className="flex min-w-0 items-center gap-2">
              <Link to="/" className="flex min-w-0 items-center" onClick={onNavigate}>
                {/* w-auto + max-w-none override Tailwind preflight's
                    `max-width: 100%`, which would otherwise compress the
                    logo's width when the ModuleSwitcher pill takes more
                    space (e.g. "HR & Payroll" vs. "Finance"), squishing
                    its aspect ratio. */}
                <img
                  src={`${import.meta.env.BASE_URL}${theme === 'dark' ? 'runq-light.png' : 'runq-dark.png'}`}
                  alt="runQ"
                  className="h-[18px] w-auto max-w-none shrink-0"
                />
              </Link>
              {financeAllowed && <ModuleSwitcher activeModule={activeModule} onNavigate={onNavigate} />}
            </div>
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
        {groups.map((group, gi) => (
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
                  // Inject the live inbox count from the badge query so the
                  // sidebar shows what's pending without each page having
                  // to wire it up. Other counts could pipe in here too.
                  item={
                    it.key === 'inbox' && inboxCount > 0
                      ? { ...it, count: inboxCount }
                      : it.key === 'payment-claims' && pendingClaimsCount > 0
                        ? { ...it, count: pendingClaimsCount }
                        : it
                  }
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
      {!collapsed && showUpgrade && (
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
      {(showHelp || showCommand) && (
      <div
        className={cn(
          'border-t',
          collapsed ? 'flex flex-col items-center gap-1 p-2' : 'flex items-center gap-1 px-3 py-2',
        )}
        style={{ borderColor: 'var(--border-soft)' }}
      >
        {showHelp && (
          <Link
            to={activeModule === 'hr' ? '/hr/help' : '/finance/help'}
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
        )}
        {showCommand && (
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
        )}
      </div>
      )}
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

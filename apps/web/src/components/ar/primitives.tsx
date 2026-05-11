import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, HTMLAttributes, ButtonHTMLAttributes } from 'react';
import { ChevronRight, ChevronLeft, Search, ShieldCheck, ShieldAlert, ShieldX, Building2, Zap, ScrollText, Smartphone, Wallet, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDeclarePageWidth } from '../../lib/page-width';

// ─── Tokens / helpers ───────────────────────────────────────────────────────

export type Tone = 'pos' | 'neg' | 'warn' | 'accent' | 'neutral';

const TONE_FG: Record<Tone, string> = {
  pos: 'var(--pos)',
  neg: 'var(--neg)',
  warn: 'var(--warn)',
  accent: 'var(--accent-text)',
  neutral: 'var(--text-1)',
};

const TONE_SOFT: Record<Tone, string> = {
  pos: 'var(--pos-soft)',
  neg: 'var(--neg-soft)',
  warn: 'var(--warn-soft)',
  accent: 'var(--accent-soft)',
  neutral: 'var(--surface-2)',
};

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function daysBetween(d1: string, d2: string | Date = new Date()): number {
  const a = new Date(d1).getTime();
  const b = typeof d2 === 'string' ? new Date(d2).getTime() : d2.getTime();
  return Math.floor((b - a) / 86400000);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── PageHeader ─────────────────────────────────────────────────────────────

interface Crumb { label: string; href?: string }

export function PageHeader({
  title, titleBadge, description, breadcrumbs, actions, className, fullWidth,
}: {
  title: string;
  titleBadge?: ReactNode;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
  /** Drop the dashboard shell's max-width cap. See ui/PageHeader for details. */
  fullWidth?: boolean;
}) {
  // breadcrumbs prop kept for back-compat but no longer rendered — the
  // topbar surfaces the active route via the global breadcrumb. Suppress
  // unused-arg lint without removing the prop signature (callers still pass it).
  void breadcrumbs;
  useDeclarePageWidth(fullWidth ? 'full' : 'capped');

  return (
    <div className={cn('mb-6', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>{title}</h1>
            {titleBadge}
          </div>
          {description && (
            <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-3)' }}>{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ─── Button ─────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md';

export function Button({
  variant = 'primary', size = 'md', icon, loading, className, children, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: ReactNode;
  loading?: boolean;
}) {
  const sz = size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]';
  let style: React.CSSProperties = {};
  let cls = '';
  switch (variant) {
    case 'primary':
      style = { background: 'var(--accent)', color: 'white' };
      cls = 'shadow-sm hover:opacity-90';
      break;
    case 'outline':
      style = { background: 'var(--surface)', color: 'var(--text-1)', borderColor: 'var(--border)' };
      cls = 'border hover:bg-[var(--surface-2)]';
      break;
    case 'ghost':
      style = { color: 'var(--text-2)' };
      cls = 'hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]';
      break;
    case 'danger':
      style = { background: 'var(--neg)', color: 'white' };
      cls = 'shadow-sm hover:opacity-90';
      break;
  }
  return (
    <button
      {...props}
      style={style}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        sz, cls, className,
      )}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────────

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'cyan' | 'outline';

const BADGE_STYLES: Record<BadgeVariant, { bg: string; fg: string; border?: string }> = {
  default:  { bg: 'var(--surface-2)',  fg: 'var(--text-2)' },
  success:  { bg: 'var(--pos-soft)',   fg: 'var(--pos)' },
  warning:  { bg: 'var(--warn-soft)',  fg: 'var(--warn)' },
  danger:   { bg: 'var(--neg-soft)',   fg: 'var(--neg)' },
  info:     { bg: 'var(--accent-soft)',fg: 'var(--accent-text)' },
  primary:  { bg: 'var(--accent)',     fg: 'white' },
  cyan:     { bg: 'oklch(0.94 0.06 200)', fg: 'oklch(0.45 0.13 200)' },
  outline:  { bg: 'transparent',       fg: 'var(--text-2)', border: 'var(--border)' },
};

export function Badge({ variant = 'default', children, className }: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  const s = BADGE_STYLES[variant];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[11px] font-medium', s.border && 'border', className)}
      style={{ background: s.bg, color: s.fg, ...(s.border ? { borderColor: s.border } : {}) }}
    >
      {children}
    </span>
  );
}

// ─── StatusBadge ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  draft:           { variant: 'default', label: 'Draft' },
  sent:            { variant: 'info',    label: 'Sent' },
  viewed:          { variant: 'info',    label: 'Viewed' },
  partially_paid:  { variant: 'warning', label: 'Partial' },
  paid:            { variant: 'success', label: 'Paid' },
  overdue:         { variant: 'danger',  label: 'Overdue' },
  cancelled:       { variant: 'outline', label: 'Cancelled' },
  void:            { variant: 'outline', label: 'Void' },
  // quotes / sales orders
  accepted:        { variant: 'success', label: 'Accepted' },
  rejected:        { variant: 'danger',  label: 'Rejected' },
  expired:         { variant: 'outline', label: 'Expired' },
  open:            { variant: 'info',    label: 'Open' },
  fulfilled:       { variant: 'success', label: 'Fulfilled' },
  // credit notes
  issued:          { variant: 'info',    label: 'Issued' },
  adjusted:        { variant: 'success', label: 'Adjusted' },
  // dunning log
  delivered:       { variant: 'success', label: 'Delivered' },
  failed:          { variant: 'danger',  label: 'Failed' },
  // collections
  contacted:       { variant: 'info',    label: 'Contacted' },
  promised:        { variant: 'cyan',    label: 'Promised' },
  resolved:        { variant: 'success', label: 'Resolved' },
  escalated:       { variant: 'danger',  label: 'Escalated' },
  // AP — bills / payments / pay runs
  pending:         { variant: 'warning', label: 'Pending' },
  pending_match:   { variant: 'warning', label: 'Pending match' },
  approved:        { variant: 'info',    label: 'Approved' },
  matched:         { variant: 'info',    label: 'Matched' },
  unpaid:          { variant: 'warning', label: 'Unpaid' },
  scheduled:       { variant: 'info',    label: 'Scheduled' },
  processed:       { variant: 'success', label: 'Processed' },
  completed:       { variant: 'success', label: 'Completed' },
  cleared:         { variant: 'success', label: 'Cleared' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { variant: 'default' as BadgeVariant, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ─── Input / Select ─────────────────────────────────────────────────────────

export function Input({
  icon, className, ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <div className="relative w-full">
      {icon && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }}>
          {icon}
        </span>
      )}
      <input
        {...props}
        className={cn(
          'h-8 w-full rounded-md border text-[12.5px] outline-none transition-colors',
          icon ? 'pl-8 pr-2.5' : 'px-2.5',
          'focus:ring-2 focus:ring-[var(--accent-soft)] focus:border-[var(--accent)]',
          className,
        )}
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
      />
    </div>
  );
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input icon={<Search size={13} />} {...props} />;
}

export function Select({
  options, className, ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select
      {...props}
      className={cn(
        'h-8 rounded-md border px-2.5 text-[12.5px] outline-none transition-colors',
        'focus:ring-2 focus:ring-[var(--accent-soft)] focus:border-[var(--accent)]',
        className,
      )}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── StatTile ───────────────────────────────────────────────────────────────

export function StatTile({
  label, value, sub, tone = 'neutral',
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div
        className="num mt-1 text-[22px] font-semibold leading-none tabular-nums"
        style={{ color: tone === 'neutral' ? 'var(--text-1)' : TONE_FG[tone] }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{sub}</div>
      )}
    </div>
  );
}

// ─── Table ──────────────────────────────────────────────────────────────────

type Align = 'left' | 'center' | 'right';
const alignCls: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="overflow-x-auto">
        <table className={cn('w-full border-collapse text-[13px]', className)}>{children}</table>
      </div>
    </div>
  );
}

export function TableHeader({ children }: { children: ReactNode }) {
  return (
    <thead style={{ background: 'var(--surface-2)' }}>
      {children}
    </thead>
  );
}

export function Th({ align = 'left', className, children }: { align?: Align; className?: string; children?: ReactNode }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-wider border-b',
        alignCls[align], className,
      )}
      style={{ color: 'var(--text-3)', borderColor: 'var(--border-soft)' }}
    >
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  onClick, className, children,
}: { onClick?: () => void; className?: string; children: ReactNode }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b transition-colors last:border-b-0',
        onClick && 'cursor-pointer hover:bg-[var(--surface-2)]',
        className,
      )}
      style={{ borderColor: 'var(--border-soft)' }}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  align = 'left', numeric, className, children, ...rest
}: HTMLAttributes<HTMLTableCellElement> & { align?: Align; numeric?: boolean }) {
  return (
    <td
      {...rest}
      className={cn('px-4 py-2.5', alignCls[align], numeric && 'num tabular-nums', className)}
      style={{ color: 'var(--text-1)' }}
    >
      {children}
    </td>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export function Pagination({
  page, totalPages, total, limit, onPageChange,
}: { page: number; totalPages: number; total: number; limit: number; onPageChange: (p: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex items-center justify-between text-[11.5px]" style={{ color: 'var(--text-3)' }}>
      <span className="num">Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={13} /> Prev
        </Button>
        <span className="num px-2">Page {page} / {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight size={13} />
        </Button>
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

export function EmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {icon && (
        <div
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
        >
          {icon}
        </div>
      )}
      <div className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{title}</div>
      {description && (
        <div className="mt-1 max-w-sm text-[12px]" style={{ color: 'var(--text-3)' }}>{description}</div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({
  active, onChange, tabs,
}: {
  active: T;
  onChange: (id: T) => void;
  tabs: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="mb-4 flex items-center gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium transition-colors',
              '-mb-px border-b-2',
            )}
            style={{
              color: isActive ? 'var(--accent-text)' : 'var(--text-2)',
              borderColor: isActive ? 'var(--accent)' : 'transparent',
            }}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className="num rounded px-1 text-[10.5px]"
                style={{ background: isActive ? 'var(--accent-soft)' : 'var(--surface-2)', color: isActive ? 'var(--accent-text)' : 'var(--text-3)' }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const hue = hashHue(name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size, height: size,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        background: `oklch(0.92 0.06 ${hue})`,
        color: `oklch(0.35 0.12 ${hue})`,
      }}
    >
      {initials(name) || '?'}
    </span>
  );
}

// ─── Credit score pill ──────────────────────────────────────────────────────

export function CreditScorePill({ score, risk }: { score: number; risk?: 'low' | 'medium' | 'high' | string }) {
  const tone: Tone = risk === 'high' ? 'neg' : risk === 'medium' ? 'warn' : 'pos';
  const Icon = tone === 'pos' ? ShieldCheck : tone === 'warn' ? ShieldAlert : ShieldX;
  return (
    <span
      className="num inline-flex items-center gap-1 rounded px-1.5 py-[2px] text-[11px] font-medium tabular-nums"
      style={{ background: TONE_SOFT[tone], color: TONE_FG[tone] }}
    >
      <Icon size={11} />
      {score}
    </span>
  );
}

// ─── Payment method badge ───────────────────────────────────────────────────

export function PaymentMethodBadge({ method }: { method: string }) {
  const map: Record<string, { Icon: typeof Building2; label: string }> = {
    bank_transfer: { Icon: Building2, label: 'Bank transfer' },
    rtgs:          { Icon: Zap, label: 'RTGS' },
    cheque:        { Icon: ScrollText, label: 'Cheque' },
    upi:           { Icon: Smartphone, label: 'UPI' },
  };
  const cfg = map[method] ?? { Icon: Wallet, label: method.replace(/_/g, ' ') };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-2)' }}>
      <cfg.Icon size={11} style={{ color: 'var(--text-3)' }} />
      {cfg.label}
    </span>
  );
}

// ─── Detail card / row (for customer detail) ────────────────────────────────

export function DetailCard({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div
        className="flex items-center gap-2 border-b px-5 py-3"
        style={{ borderColor: 'var(--border-soft)' }}
      >
        {icon && <span style={{ color: 'var(--text-2)' }}>{icon}</span>}
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{title}</h3>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 px-5 py-3 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

export function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div
        className="mb-0.5 text-[10.5px] font-medium uppercase tracking-wider"
        style={{ color: 'var(--text-3)' }}
      >
        {label}
      </div>
      <div className={cn('break-words text-[12.5px]', mono && 'num')} style={{ color: 'var(--text-1)' }}>
        {value || <span style={{ color: 'var(--text-3)' }}>—</span>}
      </div>
    </div>
  );
}

// ─── Toggle (switch) ────────────────────────────────────────────────────────

export function Toggle({ on, onChange }: { on: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      className="flex h-5 w-9 items-center rounded-full p-0.5 transition-colors"
      style={{ background: on ? 'var(--accent)' : 'var(--surface-2)', borderWidth: on ? 0 : 1, borderColor: 'var(--border)' }}
    >
      <span
        className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

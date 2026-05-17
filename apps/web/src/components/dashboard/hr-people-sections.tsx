import { useNavigate } from '@tanstack/react-router';
import {
  CalendarDays, Cake, Gift, AlertTriangle, CalendarClock, UserPlus, UserMinus,
  ArrowRight, Users, FileWarning, Activity,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import {
  useEmployees, useLeaveRequests, useExpiringDocuments, useHrDashboard,
  type Employee, type LeaveRequest, type ExpiringDoc,
} from '@/hooks/queries/use-hr';

/** People-context sections that complement the operational tiles above:
 *  who's out, celebrations this week, joiners/exits this month, the
 *  attendance trend sparkline, and document expiries. Mirrors the mobile
 *  HR home — same backend, same derivations, same accent palette. */

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const today = () => new Date();
const isoToday = () => today().toISOString().slice(0, 10);

function fullName(e: Pick<Employee, 'firstName' | 'lastName'>): string {
  return e.lastName ? `${e.firstName} ${e.lastName}` : e.firstName;
}

function daysUntilAnniversary(monthDay: string | null, now: Date): number | null {
  if (!monthDay) return null;
  const [, mm, dd] = monthDay.split('-').map(Number);
  if (!mm || !dd) return null;
  const thisYear = new Date(now.getFullYear(), mm - 1, dd);
  const target = thisYear < startOfDay(now)
    ? new Date(now.getFullYear() + 1, mm - 1, dd)
    : thisYear;
  return Math.round((target.getTime() - startOfDay(now).getTime()) / 86_400_000);
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// ─── Section shell ──────────────────────────────────────────────────────────

function Section({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-5 text-center">
      <Icon size={18} style={{ color: 'var(--text-3)' }} />
      <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>{text}</div>
    </div>
  );
}

// ─── Who's out today ────────────────────────────────────────────────────────

/** Approved leaves whose range covers today — surfaces the first 5. */
export function WhosOutTodaySection() {
  const today = isoToday();
  // The leave list endpoint returns rows the caller can see; status=approved
  // ensures we don't surface unconfirmed requests as out-today.
  const { data, isLoading } = useLeaveRequests({ status: 'approved' });
  const navigate = useNavigate();
  const rows = (data?.data ?? []).filter(
    (r) => r.fromDate <= today && today <= r.toDate,
  ).slice(0, 5);

  return (
    <Section
      title="Who's out today"
      action={
        <button
          type="button"
          onClick={() => navigate({ to: '/hr/leave-requests' })}
          className="flex items-center gap-1 text-[11px] hover:opacity-80"
          style={{ color: 'var(--accent-text)' }}
        >
          All leave <ArrowRight size={11} />
        </button>
      }
    >
      {isLoading ? null : rows.length === 0 ? (
        <Empty icon={Users} text="Everyone's in today" />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <WhosOutRow key={r.id} row={r} today={today} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function WhosOutRow({ row, today }: { row: LeaveRequest; today: string }) {
  // "Returns 17 May" reads better than "ends on 16 May" when scanning a list.
  const end = new Date(row.toDate + 'T00:00:00');
  const returnDate = new Date(end);
  returnDate.setDate(end.getDate() + 1);
  const daysLeft = Math.max(0, Math.round(
    (end.getTime() - new Date(today + 'T00:00:00').getTime()) / 86_400_000,
  )) + 1;
  return (
    <li
      className="flex items-center gap-3 rounded-md px-2 py-1.5"
      style={{ background: 'var(--surface-2)' }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        {row.employeeName.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium" style={{ color: 'var(--text-1)' }}>
          {row.employeeName}
        </div>
        <div className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>
          {row.typeName} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
        </div>
      </div>
      <div className="text-right text-[10.5px]" style={{ color: 'var(--text-3)' }}>
        Returns {returnDate.getDate()} {MONTHS_SHORT[returnDate.getMonth()]}
      </div>
    </li>
  );
}

// ─── Celebrations this week ─────────────────────────────────────────────────

interface CelebrationItem {
  kind: 'birthday' | 'anniversary';
  employee: Employee;
  daysAway: number;
  yearsForAnniversary?: number;
}

/** Birthdays + work anniversaries falling in the next 7 days, sorted by
 *  proximity. Re-derives from the standard employee list to avoid a bespoke
 *  endpoint. */
export function CelebrationsSection() {
  const { data } = useEmployees({ limit: 200 });
  const now = today();
  const items: CelebrationItem[] = [];
  for (const e of data?.data ?? []) {
    if (e.status !== 'active') continue;
    const bDays = daysUntilAnniversary(e.dateOfBirth, now);
    if (bDays !== null && bDays <= 7) {
      items.push({ kind: 'birthday', employee: e, daysAway: bDays });
    }
    const jDays = daysUntilAnniversary(e.joiningDate, now);
    if (jDays !== null && jDays <= 7) {
      const joined = new Date(e.joiningDate + 'T00:00:00');
      const years = now.getFullYear() - joined.getFullYear()
        + (jDays === 0 ? 0 : 0);
      // Skip "0-year" anniversaries — that's the joining day itself.
      if (years >= 1) {
        items.push({ kind: 'anniversary', employee: e, daysAway: jDays, yearsForAnniversary: years });
      }
    }
  }
  items.sort((a, b) => a.daysAway - b.daysAway);

  return (
    <Section title="Celebrations this week">
      {items.length === 0 ? (
        <Empty icon={Gift} text="No celebrations in the next 7 days" />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.slice(0, 6).map((c) => (
            <CelebrationRow key={`${c.kind}-${c.employee.id}`} item={c} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function CelebrationRow({ item }: { item: CelebrationItem }) {
  const Ico = item.kind === 'birthday' ? Cake : Gift;
  const tone = item.kind === 'birthday'
    ? { bg: 'rgba(236,72,153,0.12)', fg: 'rgb(190,24,93)' }
    : { bg: 'rgba(8,145,178,0.12)', fg: 'rgb(14,116,144)' };
  const when = item.daysAway === 0 ? 'Today'
    : item.daysAway === 1 ? 'Tomorrow'
    : `In ${item.daysAway} days`;
  const detail = item.kind === 'birthday'
    ? 'Birthday'
    : `${item.yearsForAnniversary} yr${(item.yearsForAnniversary ?? 0) > 1 ? 's' : ''} at company`;
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-1.5"
      style={{ background: 'var(--surface-2)' }}>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: tone.bg, color: tone.fg }}
      >
        <Ico size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium" style={{ color: 'var(--text-1)' }}>
          {fullName(item.employee)}
        </div>
        <div className="text-[10.5px]" style={{ color: 'var(--text-3)' }}>{detail}</div>
      </div>
      <div className="text-[10.5px] font-semibold" style={{ color: tone.fg }}>{when}</div>
    </li>
  );
}

// ─── People moments (joiners / exits this month) ────────────────────────────

/** Two tiles summarising joiners and exits in the current calendar month. */
export function PeopleMomentsSection() {
  const navigate = useNavigate();
  const { data } = useEmployees({ limit: 200 });
  const now = today();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const joiners = (data?.data ?? []).filter(
    (e) => e.joiningDate >= monthStart && e.joiningDate <= monthEnd,
  );
  const exits = (data?.data ?? []).filter(
    (e) => e.exitDate && e.exitDate >= monthStart && e.exitDate <= monthEnd,
  );

  return (
    <Section title="People moments — this month">
      <div className="grid grid-cols-2 gap-3">
        <MomentTile
          icon={UserPlus}
          tone="pos"
          count={joiners.length}
          label={joiners.length === 1 ? 'New joiner' : 'New joiners'}
          names={joiners.slice(0, 2).map(fullName)}
          onClick={() => navigate({ to: '/hr/employees' })}
        />
        <MomentTile
          icon={UserMinus}
          tone="neg"
          count={exits.length}
          label={exits.length === 1 ? 'Exit' : 'Exits'}
          names={exits.slice(0, 2).map(fullName)}
          onClick={() => navigate({ to: '/hr/employees' })}
        />
      </div>
    </Section>
  );
}

function MomentTile({
  icon: Icon, tone, count, label, names, onClick,
}: {
  icon: any;
  tone: 'pos' | 'neg';
  count: number;
  label: string;
  names: string[];
  onClick: () => void;
}) {
  const color = tone === 'pos' ? 'var(--pos)' : 'var(--neg)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-opacity hover:opacity-90"
      style={{
        background: `color-mix(in srgb, ${color} 8%, var(--surface))`,
        borderColor: `color-mix(in srgb, ${color} 16%, var(--border))`,
      }}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color }} />
        <span className="num text-[18px] font-bold" style={{ color }}>{count}</span>
        <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>{label}</span>
      </div>
      <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
        {names.length === 0 ? '—' : names.join(', ')}
      </div>
    </button>
  );
}

// ─── Attendance trend sparkline ─────────────────────────────────────────────

/** Visual companion to the rate-bar widget — six months of marked attendance
 *  rendered as a sparkline with start/end labels. */
export function AttendanceSparklineSection() {
  const { data } = useHrDashboard();
  const trend = data?.data?.attendanceTrend ?? [];
  // Server returns newest-first; the sparkline reads left-to-right (oldest → newest).
  const series = [...trend].reverse().map((m) => m.ratePct);
  if (series.length < 2) {
    return (
      <Section title="Attendance trend">
        <Empty icon={Activity} text="Need at least 2 months of data" />
      </Section>
    );
  }
  const first = series[0];
  const last = series[series.length - 1];
  const delta = last - first;
  const deltaColor = delta >= 0 ? 'var(--pos)' : 'var(--neg)';
  const firstLabel = [...trend].reverse()[0];
  const lastLabel = trend[0];
  return (
    <Section
      title="Attendance trend — last 6 months"
      action={
        <span className="num text-[11px] font-semibold" style={{ color: deltaColor }}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
        </span>
      }
    >
      <Sparkline values={series} />
      <div className="mt-2 flex items-center justify-between text-[10.5px]" style={{ color: 'var(--text-3)' }}>
        <span>{MONTHS_SHORT[firstLabel.month - 1]} {String(firstLabel.year).slice(2)}</span>
        <span>{MONTHS_SHORT[lastLabel.month - 1]} {String(lastLabel.year).slice(2)}</span>
      </div>
    </Section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 280;
  const h = 56;
  const max = Math.max(100, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1, max - min);
  const step = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(' L ')}`;
  const areaPath = `${path} L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: h }}>
      <path d={areaPath} fill="var(--accent-soft)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

// ─── Document expiries ──────────────────────────────────────────────────────

/** Documents expiring within 90 days, hottest first. Same tone scale as the
 *  per-employee Documents tab so the visual language stays consistent. */
export function ExpiringDocsSection() {
  const navigate = useNavigate();
  const { data, isLoading } = useExpiringDocuments(90);
  const rows = (data?.data ?? []).slice(0, 6);
  return (
    <Section
      title="Document expiries — next 90 days"
      action={
        <button
          type="button"
          onClick={() => navigate({ to: '/hr/employees' })}
          className="flex items-center gap-1 text-[11px] hover:opacity-80"
          style={{ color: 'var(--accent-text)' }}
        >
          Employees <ArrowRight size={11} />
        </button>
      }
    >
      {isLoading ? null : rows.length === 0 ? (
        <Empty icon={FileWarning} text="No documents expiring soon" />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <ExpiringRow
              key={r.id}
              row={r}
              onClick={() => navigate({ to: '/hr/employees/$employeeId', params: { employeeId: r.employeeId } })}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

function ExpiringRow({ row, onClick }: { row: ExpiringDoc; onClick: () => void }) {
  const target = new Date(row.expiryDate + 'T00:00:00');
  const daysLeft = Math.round((target.getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  const tone =
    daysLeft < 0 || daysLeft <= 7 ? { bg: 'rgba(239,68,68,0.12)', fg: 'rgb(220,38,38)' }
    : daysLeft <= 30 ? { bg: 'rgba(245,158,11,0.15)', fg: 'rgb(180,83,9)' }
    : { bg: 'var(--surface-2)', fg: 'var(--text-2)' };
  const label =
    daysLeft < 0 ? `Expired ${-daysLeft}d ago`
    : daysLeft === 0 ? 'Today'
    : `${daysLeft}d`;
  const kindLabel = (row.documentKind ?? 'document').replace(/_/g, ' ');
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:opacity-90"
        style={{ background: 'var(--surface-2)' }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: tone.bg, color: tone.fg }}
        >
          <AlertTriangle size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium" style={{ color: 'var(--text-1)' }}>
            {row.employeeName}
          </div>
          <div className="truncate text-[10.5px] capitalize" style={{ color: 'var(--text-3)' }}>
            {kindLabel} · {row.employeeCode}
          </div>
        </div>
        <Badge variant={daysLeft <= 7 ? 'danger' : daysLeft <= 30 ? 'warning' : 'default'}>
          <CalendarClock size={10} className="mr-0.5" />
          {label}
        </Badge>
      </button>
    </li>
  );
}

// ─── Grid wrapper ───────────────────────────────────────────────────────────

/** Lays out the five sections in a responsive 2-column grid; the dashboard
 *  page just drops `<PeopleContextSections />` between muster and statutory. */
export function PeopleContextSections() {
  return (
    <div className="mb-6">
      <div
        className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-3)' }}
      >
        People context
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WhosOutTodaySection />
        <CelebrationsSection />
        <PeopleMomentsSection />
        <AttendanceSparklineSection />
        <div className="lg:col-span-2">
          <ExpiringDocsSection />
        </div>
      </div>
    </div>
  );
}

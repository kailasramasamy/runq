import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClock, ChevronRight, Bell, Calculator, Wallet, UserCheck, Landmark,
  Building2, TrendingUp, CalendarDays, Activity, ArrowRight,
} from 'lucide-react';
import { PageHeader, Badge } from '@/components/ui';
import { StatTile } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import {
  useEmployees, useDepartments, useDailyMuster, useLeaveRequests, useAttendance,
  useHolidays, useHrDashboard,
} from '@/hooks/queries/use-hr';
import { usePayrollRuns } from '@/hooks/queries/use-hr-payroll';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const today = () => new Date().toISOString().slice(0, 10);

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Compact INR for chart axes — 3.0L / 42k / 500. */
function fmtCompact(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

/** PF/ESI for a month are payable by the 15th of the following month. */
function nextStatutoryDeadline() {
  const now = new Date();
  const d = now.getDate();
  let due: Date;
  let forMonthIdx: number;
  if (d <= 15) {
    due = new Date(now.getFullYear(), now.getMonth(), 15);
    forMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  } else {
    due = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    forMonthIdx = now.getMonth();
  }
  const daysLeft = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  return { due, daysLeft, forMonth: MONTHS_LONG[forMonthIdx] };
}

// Status accent colours. Tiles tint these into the theme surface via
// color-mix, so they stay legible in both light and dark mode.
const MUSTER_TILES: Array<{ key: keyof MusterData; label: string; color: string }> = [
  { key: 'present', label: 'Present', color: '#16a34a' },
  { key: 'half_day', label: 'Half day', color: '#0284c7' },
  { key: 'leave', label: 'Leave', color: '#d97706' },
  { key: 'absent', label: 'Absent', color: '#dc2626' },
  { key: 'holiday', label: 'Holiday', color: '#7c3aed' },
  { key: 'week_off', label: 'Week off', color: 'var(--text-3)' },
];

type MusterData = { present: number; absent: number; half_day: number; leave: number; holiday: number; week_off: number };

// ─── Action card ────────────────────────────────────────────────────────────

type CardState = 'good' | 'attention' | 'urgent' | 'info';

// Each card gets a faint wash of its state colour — enough to draw the eye
// without shouting. Mixed into the theme surface so it works in dark mode.
const STATE_ACCENT: Record<CardState, string> = {
  good: 'var(--pos)',
  attention: 'var(--warn)',
  urgent: 'var(--neg)',
  info: 'var(--accent)',
};

function ActionCard({
  icon: Icon, label, value, sub, state, onClick,
}: {
  icon: any;
  label: string;
  value: string;
  sub: string;
  state: CardState;
  onClick: () => void;
}) {
  const accent = STATE_ACCENT[state];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border p-4 text-left transition-opacity hover:opacity-90"
      style={{
        background: `color-mix(in srgb, ${accent} 8%, var(--surface))`,
        borderColor: `color-mix(in srgb, ${accent} 12%, var(--border))`,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `color-mix(in srgb, ${accent} 16%, var(--surface))`, color: accent }}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
          {label}
        </div>
        <div className="mt-1 text-[15px] font-bold" style={{ color: accent }}>{value}</div>
        <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{sub}</div>
      </div>
      <ChevronRight size={14} style={{ color: 'var(--text-3)' }} className="mt-0.5 shrink-0" />
    </button>
  );
}

// ─── Insight widget shell ───────────────────────────────────────────────────

function Widget({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function HRDashboardPage() {
  const navigate = useNavigate();
  const date = today();
  const week = lastNDays(7);
  const year = new Date().getFullYear();

  const { data: empData } = useEmployees({ limit: 1 });
  const { data: deptData } = useDepartments();
  const { data: musterData } = useDailyMuster(date);
  const { data: pendingLeaveData } = useLeaveRequests({ status: 'pending' });
  const { data: payrollData } = usePayrollRuns();
  const { data: weekAttData } = useAttendance({ dateFrom: week[0], dateTo: week[week.length - 1] });
  const { data: holidayData } = useHolidays(year);
  const { data: dashData } = useHrDashboard();

  const total = empData?.meta?.total ?? 0;
  const muster: MusterData = musterData?.data ?? { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0, week_off: 0 };
  const presentToday = muster.present + muster.half_day;
  const pendingLeaves = pendingLeaveData?.data?.length ?? 0;

  const runs = payrollData?.data ?? [];
  const lastRun = runs[0];
  const netPaySeries = [...runs].reverse().map((r) => Number(r.totalNet)).filter((n) => n > 0);

  const attRows = weekAttData?.data ?? [];
  const presentSeries = week.map(
    (d) => attRows.filter((r) => r.date === d && (r.status === 'present' || r.status === 'half_day')).length,
  );
  const leaveSeries = week.map((d) => attRows.filter((r) => r.date === d && r.status === 'leave').length);

  const dash = dashData?.data;
  const deadline = nextStatutoryDeadline();

  // Headcount by department — top 6 by count
  const departments = [...(deptData?.data ?? [])]
    .map((d) => ({ name: d.name, count: d.employeeCount ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxDeptCount = Math.max(1, ...departments.map((d) => d.count));

  // Payroll cost trend — last 6 runs oldest → newest
  const trend = [...runs].reverse().slice(-6);
  const maxNet = Math.max(1, ...trend.map((r) => Number(r.totalNet)));

  // Upcoming holidays — next 4 from today
  const upcomingHolidays = (holidayData?.data ?? [])
    .filter((h) => h.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  // ── Action card derivations ──
  const payrollCard = derivePayrollCard(dash?.payroll);
  const salaryState: CardState = (dash?.employeesWithoutSalary ?? 0) > 0 ? 'attention' : 'good';
  const attendanceState: CardState = (dash?.attendanceNotMarkedToday ?? 0) > 0 ? 'attention' : 'good';
  const confirmState: CardState = (dash?.confirmationsDue ?? 0) > 0 ? 'attention' : 'good';
  const deadlineState: CardState = deadline.daysLeft <= 5 ? 'urgent' : deadline.daysLeft <= 12 ? 'attention' : 'info';

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR' }]}
        title="HR & Payroll"
        description="Workforce, time, attendance, and payroll for your factory."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Employees" value={total} sub="Total active" />
        <StatTile
          label="Present today"
          value={presentToday}
          sub={date}
          accentColor="#16a34a"
          sparkData={presentSeries.some((n) => n > 0) ? presentSeries : undefined}
        />
        <StatTile
          label="On leave"
          value={muster.leave}
          sub="Today"
          accentColor="#d97706"
          sparkData={leaveSeries.some((n) => n > 0) ? leaveSeries : undefined}
        />
        <StatTile
          label="Net pay"
          value={lastRun ? formatINR(Number(lastRun.totalNet)) : '—'}
          sub={lastRun ? 'Last processed run' : 'No runs yet'}
          accentColor="#0284c7"
          sparkData={netPaySeries.length >= 2 ? netPaySeries : undefined}
        />
      </div>

      {/* Pending leave alert banner */}
      {pendingLeaves > 0 && (
        <button
          type="button"
          onClick={() => navigate({ to: '/hr/leave-requests', search: { status: 'pending' } })}
          className="mb-5 flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-opacity hover:opacity-90"
          style={{
            background: 'color-mix(in srgb, var(--warn) 9%, var(--surface))',
            borderColor: 'color-mix(in srgb, var(--warn) 32%, var(--border))',
          }}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: 'color-mix(in srgb, var(--warn) 18%, var(--surface))', color: 'var(--warn)' }}>
            <Bell size={14} />
          </div>
          <div className="flex flex-1 items-center gap-2">
            <div>
              <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                {pendingLeaves} leave request{pendingLeaves > 1 ? 's' : ''} awaiting approval
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>Click to review pending requests</div>
            </div>
            <Badge variant="warning">Pending</Badge>
          </div>
          <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
        </button>
      )}

      {/* Today's muster */}
      <div className="mb-6 rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>Today's muster — {date}</div>
          <button
            type="button"
            onClick={() => navigate({ to: '/hr/attendance' })}
            className="flex items-center gap-1 text-[12px] hover:opacity-80"
            style={{ color: 'var(--accent-text)' }}
          >
            <CalendarClock size={13} /> View attendance
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {MUSTER_TILES.map((t) => (
            <div
              key={t.key}
              className="rounded-lg px-2 py-2.5 text-center"
              style={{ background: `color-mix(in srgb, ${t.color} 14%, var(--surface))` }}
            >
              <div className="num text-[22px] font-bold leading-none tabular-nums" style={{ color: t.color }}>
                {muster[t.key]}
              </div>
              <div className="mt-1 text-[10px] font-semibold opacity-90" style={{ color: t.color }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Needs attention */}
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
        Needs attention
      </div>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard
          icon={Calculator}
          label={`Payroll — ${MONTHS_SHORT[(dash?.payroll.month ?? 1) - 1]} ${dash?.payroll.year ?? year}`}
          value={payrollCard.value}
          sub={payrollCard.sub}
          state={payrollCard.state}
          onClick={() =>
            dash?.payroll.runId
              ? navigate({ to: '/hr/payroll-runs/$runId', params: { runId: dash.payroll.runId } })
              : navigate({ to: '/hr/payroll-runs' })
          }
        />
        <ActionCard
          icon={Wallet}
          label="Salary structures"
          value={(dash?.employeesWithoutSalary ?? 0) > 0 ? `${dash?.employeesWithoutSalary} missing` : 'All assigned'}
          sub={(dash?.employeesWithoutSalary ?? 0) > 0 ? 'Assign before running payroll' : 'Every active employee covered'}
          state={salaryState}
          onClick={() => navigate({ to: '/hr/employees' })}
        />
        <ActionCard
          icon={CalendarClock}
          label="Attendance today"
          value={(dash?.attendanceNotMarkedToday ?? 0) > 0 ? `${dash?.attendanceNotMarkedToday} not marked` : 'All marked'}
          sub={(dash?.attendanceNotMarkedToday ?? 0) > 0 ? "Mark today's muster" : 'Today is fully recorded'}
          state={attendanceState}
          onClick={() => navigate({ to: '/hr/attendance' })}
        />
        <ActionCard
          icon={UserCheck}
          label="Confirmations due"
          value={(dash?.confirmationsDue ?? 0) > 0 ? `${dash?.confirmationsDue} pending` : 'None due'}
          sub={(dash?.confirmationsDue ?? 0) > 0 ? 'Permanent staff past probation' : 'No confirmations overdue'}
          state={confirmState}
          onClick={() => navigate({ to: '/hr/employees' })}
        />
        <ActionCard
          icon={Landmark}
          label="PF & ESI deadline"
          value={`${deadline.daysLeft} day${deadline.daysLeft === 1 ? '' : 's'} left`}
          sub={`${deadline.forMonth} dues — pay by ${deadline.due.getDate()} ${MONTHS_SHORT[deadline.due.getMonth()]}`}
          state={deadlineState}
          onClick={() => navigate({ to: '/hr/payroll-runs' })}
        />
      </div>

      {/* Insights */}
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
        Insights
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Headcount by department */}
        <Widget
          title="Headcount by department"
          action={
            <button
              type="button"
              onClick={() => navigate({ to: '/hr/departments' })}
              className="flex items-center gap-1 text-[11px] hover:opacity-80"
              style={{ color: 'var(--accent-text)' }}
            >
              Departments <ArrowRight size={11} />
            </button>
          }
        >
          {departments.length === 0 ? (
            <Empty icon={Building2} text="No departments configured" />
          ) : (
            <div className="flex flex-col gap-2.5">
              {departments.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate text-[12px]" style={{ color: 'var(--text-2)' }}>{d.name}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(d.count / maxDeptCount) * 100}%`, background: 'var(--accent)' }}
                    />
                  </div>
                  <div className="num w-6 text-right text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                    {d.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Widget>

        {/* Payroll cost trend */}
        <Widget
          title="Payroll cost trend"
          action={
            <button
              type="button"
              onClick={() => navigate({ to: '/hr/payroll-runs' })}
              className="flex items-center gap-1 text-[11px] hover:opacity-80"
              style={{ color: 'var(--accent-text)' }}
            >
              Payroll runs <ArrowRight size={11} />
            </button>
          }
        >
          {trend.length === 0 ? (
            <Empty icon={TrendingUp} text="No payroll runs yet" />
          ) : (
            <div className="flex gap-2">
              {/* Y axis scale */}
              <div
                className="num flex flex-col justify-between py-0.5 text-right text-[10px]"
                style={{ height: 128, color: 'var(--text-3)' }}
              >
                <span>{fmtCompact(maxNet)}</span>
                <span>{fmtCompact(maxNet / 2)}</span>
                <span>0</span>
              </div>
              <div className="min-w-0 flex-1">
                {/* Plot area — left edge = Y axis, bottom edge = X axis */}
                <div
                  className="flex items-end justify-around gap-2"
                  style={{
                    height: 128,
                    borderLeft: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {trend.map((r) => {
                    const net = Number(r.totalNet);
                    const h = Math.max(4, (net / maxNet) * 104);
                    return (
                      <div
                        key={r.id}
                        className="flex flex-1 flex-col items-center justify-end gap-1"
                        style={{ height: '100%' }}
                      >
                        <div className="num text-[10px]" style={{ color: 'var(--text-3)' }}>
                          {fmtCompact(net)}
                        </div>
                        <div className="w-7 rounded-t" style={{ height: h, background: 'var(--accent)' }} />
                      </div>
                    );
                  })}
                </div>
                {/* X axis labels */}
                <div className="flex justify-around gap-2 pt-1.5">
                  {trend.map((r) => (
                    <div
                      key={r.id}
                      className="flex-1 text-center text-[10px]"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {MONTHS_SHORT[r.month - 1]} {String(r.year).slice(2)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Widget>

        {/* Attendance rate — last 6 months */}
        <Widget
          title="Attendance rate — last 6 months"
          action={
            <button
              type="button"
              onClick={() => navigate({ to: '/hr/attendance' })}
              className="flex items-center gap-1 text-[11px] hover:opacity-80"
              style={{ color: 'var(--accent-text)' }}
            >
              Attendance <ArrowRight size={11} />
            </button>
          }
        >
          {!dash || dash.attendanceTrend.every((m) => m.totalMarked === 0) ? (
            <Empty icon={Activity} text="No attendance recorded yet" />
          ) : (
            <div className="flex flex-col gap-3">
              {[...dash.attendanceTrend].reverse().map((m) => {
                const barColor = m.totalMarked === 0 ? 'var(--surface-2)'
                  : m.ratePct >= 90 ? 'var(--pos)'
                  : m.ratePct >= 75 ? 'var(--warn)' : 'var(--neg)';
                return (
                  <div key={`${m.year}-${m.month}`} className="flex items-center gap-3">
                    <div className="w-14 shrink-0 text-[12px]" style={{ color: 'var(--text-2)' }}>
                      {MONTHS_SHORT[m.month - 1]} {String(m.year).slice(2)}
                    </div>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${m.ratePct}%`, background: barColor }} />
                    </div>
                    <div className="num w-9 text-right text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                      {m.totalMarked === 0 ? '—' : `${m.ratePct}%`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Widget>

        {/* Upcoming holidays */}
        <Widget
          title="Upcoming holidays"
          action={
            <button
              type="button"
              onClick={() => navigate({ to: '/hr/holidays' })}
              className="flex items-center gap-1 text-[11px] hover:opacity-80"
              style={{ color: 'var(--accent-text)' }}
            >
              Calendar <ArrowRight size={11} />
            </button>
          }
        >
          {upcomingHolidays.length === 0 ? (
            <Empty icon={CalendarDays} text="No upcoming holidays this year" />
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingHolidays.map((h) => {
                const d = new Date(h.date + 'T00:00:00');
                return (
                  <div key={h.id} className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      <span className="num text-[14px] font-bold leading-none">{d.getDate()}</span>
                      <span className="text-[9px] font-semibold uppercase">{MONTHS_SHORT[d.getMonth()]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{h.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {d.toLocaleDateString('en-IN', { weekday: 'long' })}
                      </div>
                    </div>
                    <Badge variant={h.type === 'national' ? 'primary' : h.type === 'state' ? 'info' : 'default'}>
                      {h.type}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Widget>
      </div>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Icon size={20} style={{ color: 'var(--text-3)' }} />
      <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>{text}</div>
    </div>
  );
}

function derivePayrollCard(
  payroll: { status: string | null } | undefined,
): { value: string; sub: string; state: CardState } {
  switch (payroll?.status) {
    case null:
    case undefined:
      return { value: 'Not started', sub: "Create this month's run", state: 'attention' };
    case 'draft':
      return { value: 'Draft', sub: 'Process to generate payslips', state: 'attention' };
    case 'processed':
      return { value: 'Needs approval', sub: 'Review & approve the run', state: 'attention' };
    case 'approved':
      return { value: 'Approved', sub: 'Ready to disburse', state: 'good' };
    case 'closed':
      return { value: 'Closed', sub: 'Locked & filed', state: 'good' };
    default:
      return { value: '—', sub: '', state: 'info' };
  }
}

// Employee HR dashboard — the self-service view shown to `viewer`-role
// users whose access scope is `self` (a plain employee, no reports). It
// surfaces only the person's own data: attendance, leave, payslips,
// announcements, holidays. The admin/manager dashboard lives in index.tsx.
import { useNavigate } from '@tanstack/react-router';
import {
  CalendarClock, CalendarOff, Wallet, ChevronRight, CalendarDays,
  Receipt, Scale,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader, Card, CardHeader, CardContent, Badge } from '@/components/ui';
import { StatTile, EmptyState } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import {
  useHrMe, useAttendance, useLeaveBalances, useLeaveRequests,
  useHolidays, useDepartments,
} from '@/hooks/queries/use-hr';
import { useMyPayslips } from '@/hooks/queries/use-hr-payroll';
import { AnnouncementsSection } from '@/components/dashboard/hr-feed-sections';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HOLIDAY_VARIANT: Record<string, 'primary' | 'info' | 'default' | 'outline'> = {
  national: 'primary', state: 'info', company: 'default', optional: 'outline',
};
const RUN_VARIANT: Record<string, 'default' | 'info' | 'success' | 'outline'> = {
  draft: 'default', processed: 'info', approved: 'success', closed: 'outline',
};

export function EmployeeDashboard() {
  const navigate = useNavigate();
  const now = new Date();
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const monthStart = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
  const todayStr = now.toISOString().slice(0, 10);

  const { data: meData } = useHrMe();
  const emp = meData?.data?.employee;

  // All scoped server-side to the caller — a `self`-scope viewer only ever
  // gets their own rows back, so no employee-id filter is needed here.
  const { data: attData } = useAttendance({ dateFrom: monthStart, dateTo: todayStr });
  const { data: balData } = useLeaveBalances({ year });
  const { data: pendingData } = useLeaveRequests({ status: 'pending' });
  const { data: payslipData } = useMyPayslips();
  const { data: holidayData } = useHolidays(year);
  const { data: deptData } = useDepartments();

  const attRows = attData?.data ?? [];
  const presentDays = attRows.filter((r) => r.status === 'present').length
    + attRows.filter((r) => r.status === 'half_day').length * 0.5;
  const leaveDays = attRows.filter((r) => r.status === 'leave').length;
  const absentDays = attRows.filter((r) => r.status === 'absent').length;

  const balances = balData?.data ?? [];
  const leaveAvailable = balances.reduce((s, b) => s + b.balance, 0);
  const pendingLeaves = pendingData?.data?.length ?? 0;

  const payslips = payslipData?.data ?? [];
  const lastPayslip = payslips[0];

  const deptName = emp?.departmentId
    ? (deptData?.data ?? []).find((d) => d.id === emp.departmentId)?.name ?? null
    : null;

  const upcomingHolidays = (holidayData?.data ?? [])
    .filter((h) => h.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  const firstName = emp?.firstName ?? 'there';

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR' }]}
        title={`Welcome back, ${firstName}`}
        description={deptName ? `${deptName} · your HR self-service` : 'Your HR self-service'}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Present this month" value={presentDays} sub={`${MONTHS_SHORT[monthIdx]} ${year}`} accentColor="#16a34a" />
        <StatTile label="Leave balance" value={leaveAvailable} sub="Days available" accentColor="#d97706" />
        <StatTile
          label="Last payslip"
          value={lastPayslip ? formatINR(Number(lastPayslip.netPay)) : '—'}
          sub={lastPayslip ? `${MONTHS_SHORT[lastPayslip.month - 1]} ${lastPayslip.year} net pay` : 'No payslips yet'}
          accentColor="#0284c7"
        />
        <StatTile
          label="Pending leave"
          value={pendingLeaves}
          sub={pendingLeaves > 0 ? 'Awaiting approval' : 'Nothing pending'}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickAction icon={CalendarClock} label="My attendance" sub="View your record" onClick={() => navigate({ to: '/hr/attendance' })} />
        <QuickAction icon={CalendarOff} label="Request leave" sub="Apply for time off" onClick={() => navigate({ to: '/hr/leave-requests' })} />
        <QuickAction icon={Wallet} label="Expense claims" sub="Submit & track claims" onClick={() => navigate({ to: '/hr/expense-claims' })} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Leave balances */}
        <Card>
          <CardHeader>My leave balances</CardHeader>
          <CardContent>
            {balances.length === 0 ? (
              <EmptyState icon={<Scale size={18} />} title="No leave balances" description="Balances appear once leave is set up for you." />
            ) : (
              <div className="flex flex-col gap-2">
                {balances.map((b) => (
                  <div key={b.id} className="flex items-center gap-3">
                    <span
                      className="num rounded px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                    >
                      {b.typeCode}
                    </span>
                    <span className="flex-1 truncate text-[13px]" style={{ color: 'var(--text-2)' }}>{b.typeName}</span>
                    <span className="num text-[14px] font-semibold" style={{ color: b.balance > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                      {b.balance}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent payslips */}
        <Card>
          <CardHeader>Recent payslips</CardHeader>
          <CardContent>
            {payslips.length === 0 ? (
              <EmptyState icon={<Receipt size={18} />} title="No payslips yet" description="Your payslips show here once payroll is processed." />
            ) : (
              <div className="flex flex-col gap-2">
                {payslips.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="flex-1 text-[13px]" style={{ color: 'var(--text-2)' }}>
                      {MONTHS_SHORT[p.month - 1]} {p.year}
                    </span>
                    <Badge variant={RUN_VARIANT[p.runStatus] ?? 'default'}>{p.runStatus}</Badge>
                    <span className="num w-24 text-right text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                      {formatINR(Number(p.netPay))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* This month's attendance */}
      <Card className="mb-6">
        <CardHeader>This month's attendance</CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <AttTile label="Present" value={presentDays} color="#16a34a" />
            <AttTile label="On leave" value={leaveDays} color="#d97706" />
            <AttTile label="Absent" value={absentDays} color="#dc2626" />
          </div>
        </CardContent>
      </Card>

      {/* Announcements — read-only noticeboard for employees. */}
      <div className="mb-6">
        <AnnouncementsSection />
      </div>

      {/* Upcoming holidays */}
      <Card>
        <CardHeader>Upcoming holidays</CardHeader>
        <CardContent>
          {upcomingHolidays.length === 0 ? (
            <EmptyState icon={<CalendarDays size={18} />} title="No upcoming holidays" description="Nothing scheduled for the rest of the year." />
          ) : (
            <div className="flex flex-col gap-2">
              {upcomingHolidays.map((h) => (
                <div key={h.id} className="flex items-center gap-3">
                  <span className="num w-24 shrink-0 text-[12px]" style={{ color: 'var(--text-3)' }}>{h.date}</span>
                  <span className="flex-1 truncate text-[13px]" style={{ color: 'var(--text-1)' }}>{h.name}</span>
                  <Badge variant={HOLIDAY_VARIANT[h.type] ?? 'default'}>{h.type}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuickAction({
  icon: Icon, label, sub, onClick,
}: { icon: LucideIcon; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-opacity hover:opacity-90"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{label}</div>
        <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{sub}</div>
      </div>
      <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
    </button>
  );
}

function AttTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-lg px-2 py-2.5 text-center"
      style={{ background: `color-mix(in srgb, ${color} 14%, var(--surface))` }}
    >
      <div className="num text-[22px] font-bold leading-none tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-1 text-[10px] font-semibold opacity-90" style={{ color }}>{label}</div>
    </div>
  );
}

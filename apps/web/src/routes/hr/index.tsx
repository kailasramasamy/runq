import { useNavigate } from '@tanstack/react-router';
import { Users, Briefcase, CalendarClock, CalendarDays, Clock3, IdCard, ChevronRight, CalendarOff, Scale } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { StatTile } from '@/components/ar/primitives';
import { useEmployees, useDepartments, useDailyMuster } from '@/hooks/queries/use-hr';

const today = () => new Date().toISOString().slice(0, 10);

const CARDS: Array<{ label: string; icon: any; path: string; description: string }> = [
  { label: 'Employees', icon: Users, path: '/hr/employees', description: 'Master records, IDs, statutory info, bank details' },
  { label: 'Attendance', icon: CalendarClock, path: '/hr/attendance', description: 'Daily muster, OT, biometric imports' },
  { label: 'Leave requests', icon: CalendarOff, path: '/hr/leave-requests', description: 'Apply, approve, reject leave' },
  { label: 'Leave balances', icon: Scale, path: '/hr/leave-balances', description: 'Per-employee balances + carry-forward' },
  { label: 'Shifts', icon: Clock3, path: '/hr/shifts', description: 'General, factory shifts, weekly offs' },
  { label: 'Departments', icon: Briefcase, path: '/hr/departments', description: 'Org structure' },
  { label: 'Designations', icon: IdCard, path: '/hr/designations', description: 'Roles + levels' },
  { label: 'Holidays', icon: CalendarDays, path: '/hr/holidays', description: 'National, state, company holidays' },
];

export function HRDashboardPage() {
  const navigate = useNavigate();
  const date = today();
  const { data: empData } = useEmployees({ limit: 1 });
  const { data: deptData } = useDepartments();
  const { data: musterData } = useDailyMuster(date);

  const total = empData?.meta?.total ?? 0;
  const departments = deptData?.data?.length ?? 0;
  const muster = musterData?.data ?? { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0, week_off: 0 };
  const presentToday = muster.present + muster.half_day;

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
        <StatTile label="Present today" value={presentToday} sub={date} />
        <StatTile label="On leave" value={muster.leave} sub="Today" />
        <StatTile label="Departments" value={departments} sub="Org structure" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <button
            key={c.path}
            type="button"
            onClick={() => navigate({ to: c.path })}
            className="group flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-[color:var(--surface-2)]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              <c.icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>{c.label}</span>
                <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
              </div>
              <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-3)' }}>{c.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

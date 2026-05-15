import { CalendarDays, BookOpen } from 'lucide-react';
import { Card2, CardTitle } from './primitives';
import { useStatutoryCalendar, type StatutoryDeadline } from '@/hooks/queries/use-hr-payroll';
import { formatINR } from '@/lib/utils';

type CalendarKind = StatutoryDeadline['kind'] | 'pf_esi';

interface CalendarItem {
  kind: CalendarKind;
  label: string;
  sublabel: string;
  date: Date;
  done?: boolean;
  amount?: number;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Next occurrence of a fixed day-of-month on/after today. */
function nextMonthlyDate(day: number, today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), day);
  if (d < today) d.setMonth(d.getMonth() + 1);
  return d;
}

/** PF/ESI (15th of the next month) is pure date arithmetic — computed here
 *  rather than round-tripping to the server. This calendar is HR/payroll-only;
 *  GST deadlines belong on the finance dashboard, not here. */
function computedDeadlines(today: Date): CalendarItem[] {
  return [
    {
      kind: 'pf_esi',
      label: 'PF & ESI',
      sublabel: 'Employer contributions — challan',
      date: nextMonthlyDate(15, today),
    },
  ];
}

// Each deadline opens the matching step-by-step help recipe in the slide-in
// drawer — exact instructions to actually complete the task, without leaving
// the dashboard. (A bare route link like /hr/payroll-runs doesn't tell the
// user *how* to file PF/ESI, deposit TDS, etc.)
const RECIPE_BY_KIND: Record<CalendarKind, string> = {
  tds_deposit: 'rec_hr_tds_challan',
  tds_24q: 'rec_hr_form_24q',
  pt: 'rec_hr_pt',
  pf_esi: 'rec_hr_pf_esi',
};

function openGuide(recipeId: string) {
  window.dispatchEvent(new CustomEvent('runq:open-help', { detail: { recipeId } }));
}

function pillStyle(days: number, done: boolean): { bg: string; fg: string; label: string } {
  if (done) return { bg: 'var(--surface-2)', fg: 'var(--text-3)', label: 'filed' };
  if (days < 0) return { bg: 'var(--neg-soft)', fg: 'var(--neg)', label: `${Math.abs(days)}d overdue` };
  if (days === 0) return { bg: 'var(--warn-soft)', fg: 'var(--warn)', label: 'due today' };
  if (days <= 7) return { bg: 'var(--warn-soft)', fg: 'var(--warn)', label: `${days}d left` };
  return { bg: 'var(--surface-2)', fg: 'var(--text-2)', label: `in ${days}d` };
}

export function StatutoryCalendar() {
  const today = startOfDay(new Date());
  const { data } = useStatutoryCalendar();

  const serverItems: CalendarItem[] = (data?.data ?? []).map((d) => ({
    kind: d.kind,
    label: d.label,
    sublabel: d.amount != null ? `${d.sublabel} · ${formatINR(d.amount)}` : d.sublabel,
    date: startOfDay(new Date(d.dueDate)),
    done: d.status === 'done',
    amount: d.amount,
  }));

  const items = [...serverItems, ...computedDeadlines(today)]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 7);

  return (
    <Card2>
      <CardTitle icon={<CalendarDays size={14} style={{ color: 'var(--text-3)' }} />}>
        Statutory calendar
      </CardTitle>

      <ol className="space-y-2">
        {items.map((m, i) => {
          const days = daysBetween(today, m.date);
          const pill = pillStyle(days, !!m.done);
          return (
            <li key={`${m.kind}-${i}`}>
              <button
                type="button"
                onClick={() => openGuide(RECIPE_BY_KIND[m.kind])}
                title="Open step-by-step guide"
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-opacity hover:opacity-90"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                <div
                  className="num flex h-9 w-10 shrink-0 flex-col items-center justify-center rounded-md border text-center"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                    {m.date.toLocaleDateString('en-IN', { month: 'short' })}
                  </span>
                  <span className="text-[13px] font-semibold leading-none" style={{ color: 'var(--text-1)' }}>
                    {m.date.getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>{m.label}</div>
                  <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {m.sublabel} · {fmtDate(m.date)}
                  </div>
                </div>
                <span
                  className="num shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: pill.bg, color: pill.fg }}
                >
                  {pill.label}
                </span>
                <span
                  className="flex shrink-0 items-center gap-1 text-[10px] font-medium"
                  style={{ color: 'var(--accent-text)' }}
                >
                  <BookOpen size={12} /> Steps
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card2>
  );
}

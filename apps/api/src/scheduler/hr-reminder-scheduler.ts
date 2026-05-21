/**
 * HR reminder scheduler.
 *
 * Two daily slots (IST), mirroring performance-reminder-scheduler.ts:
 *   09:00 — payroll sitting unapproved, statutory deposit deadlines,
 *           the tax-declaration window, overdue onboarding, and
 *           birthdays / work anniversaries.
 *   20:00 — employees who punched in today but never punched out.
 *
 * Each slot has a per-day guard so the minute-poll can't double-fire.
 * Every check is wrapped so one failing query never starves the others.
 */
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { Redis } from 'ioredis';
import {
  attendancePunches, payrollRuns, statutoryChallans,
  onboardingWorkflows, employees, taxDeclarations,
} from '@runq/db';
import { HrNotifier } from '../modules/hr/hr-notifier';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const INTERVAL_MS = 60_000;
const MORNING_HOUR_IST = 9;
const EVENING_HOUR_IST = 20;
const PAYROLL_STALE_DAYS = 2;
const ONBOARDING_STALE_DAYS = 7;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

let handle: ReturnType<typeof setInterval> | null = null;
let lastMorningYmd: string | null = null;
let lastEveningYmd: string | null = null;

export function startHrReminderScheduler(db: Db, _redis: Redis, logger: Logger = console): void {
  logger.info('HR reminder scheduler: started (daily 09:00 + 20:00 IST)');

  handle = setInterval(async () => {
    try {
      const ist = nowIst();
      if (ist.minute !== 0) return;
      const ymd = `${ist.year}-${ist.month}-${ist.date}`;

      if (ist.hour === MORNING_HOUR_IST && lastMorningYmd !== ymd) {
        lastMorningYmd = ymd;
        logger.info(`HR morning reminders: sent ${await runHrMorningReminders(db)} nudge(s)`);
      }
      if (ist.hour === EVENING_HOUR_IST && lastEveningYmd !== ymd) {
        lastEveningYmd = ymd;
        logger.info(`HR evening reminders: sent ${await runHrEveningReminders(db)} nudge(s)`);
      }
    } catch (err) {
      logger.error('HR reminder scheduler tick failed', err);
    }
  }, INTERVAL_MS);
}

export function stopHrReminderScheduler(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

/** Exported for manual invocation / tests. */
export async function runHrMorningReminders(db: Db): Promise<number> {
  const ist = nowIst();
  let n = 0;
  n += await safe('payroll-unapproved', () => remindPayrollUnapproved(db));
  n += await safe('statutory-deadline', () => remindStatutoryDeadline(db, ist));
  n += await safe('tax-declaration-window', () => remindTaxDeclarationWindow(db, ist));
  n += await safe('onboarding-overdue', () => remindOnboardingOverdue(db));
  n += await safe('celebrations', () => remindCelebrations(db, ist));
  return n;
}

/** Exported for manual invocation / tests. */
export async function runHrEveningReminders(db: Db): Promise<number> {
  return safe('missed-punch-out', () => remindMissedPunchOut(db));
}

// --- individual checks --------------------------------------------------

/** Employees with an `in` punch today but no matching `out` punch. */
async function remindMissedPunchOut(db: Db): Promise<number> {
  const punches = await db
    .select({
      tenantId: attendancePunches.tenantId,
      employeeId: attendancePunches.employeeId,
      kind: attendancePunches.kind,
    })
    .from(attendancePunches)
    .where(gte(attendancePunches.punchAt, istDayStartUtc()));

  const tenantOf = new Map<string, string>();
  const punchedIn = new Set<string>();
  const punchedOut = new Set<string>();
  for (const p of punches) {
    tenantOf.set(p.employeeId, p.tenantId);
    (p.kind === 'in' ? punchedIn : punchedOut).add(p.employeeId);
  }

  const stranded = [...punchedIn]
    .filter((id) => !punchedOut.has(id))
    .map((id) => ({ tenantId: tenantOf.get(id)!, employeeId: id }));

  let sent = 0;
  for (const [tenantId, list] of groupByTenant(stranded)) {
    const notifier = new HrNotifier(db, tenantId);
    for (const { employeeId } of list) {
      const ok = await notifier.notifyEmployee(employeeId, {
        type: 'warn',
        source: 'hr_attendance',
        title: 'You forgot to check out',
        body: 'You checked in today but never checked out. Open the app to fix your attendance.',
        targetUrl: '/hr/attendance-punches',
      });
      if (ok) sent++;
    }
  }
  return sent;
}

/** Payroll runs left in draft/processed for more than PAYROLL_STALE_DAYS. */
async function remindPayrollUnapproved(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - PAYROLL_STALE_DAYS * 86_400_000);
  const runs = await db
    .select({
      id: payrollRuns.id, tenantId: payrollRuns.tenantId,
      month: payrollRuns.month, year: payrollRuns.year, status: payrollRuns.status,
    })
    .from(payrollRuns)
    .where(and(
      inArray(payrollRuns.status, ['draft', 'processed']),
      lt(payrollRuns.createdAt, cutoff),
    ));

  let sent = 0;
  for (const [tenantId, list] of groupByTenant(runs)) {
    const notifier = new HrNotifier(db, tenantId);
    for (const run of list) {
      sent += await notifier.notifyHrAdmins({
        type: 'warn',
        source: 'hr_payroll',
        title: 'Payroll awaiting approval',
        body: `The ${monthName(run.month)} ${run.year} payroll run is still ${run.status}. Review and approve it.`,
        targetUrl: `/hr/payroll-runs/${run.id}`,
      });
    }
  }
  return sent;
}

/** PF/ESI/PT/TDS challans for last month still pending, on the 10th–15th. */
async function remindStatutoryDeadline(db: Db, ist: IstParts): Promise<number> {
  if (ist.date < 10 || ist.date > 15) return 0;
  const prevMonth = ist.month === 1 ? 12 : ist.month - 1;
  const prevYear = ist.month === 1 ? ist.year - 1 : ist.year;

  const rows = await db
    .select({ tenantId: statutoryChallans.tenantId, kind: statutoryChallans.kind })
    .from(statutoryChallans)
    .where(and(
      eq(statutoryChallans.status, 'pending'),
      eq(statutoryChallans.periodMonth, prevMonth),
      eq(statutoryChallans.periodYear, prevYear),
    ));

  let sent = 0;
  for (const [tenantId, list] of groupByTenant(rows)) {
    const kinds = [...new Set(list.map((r) => r.kind.toUpperCase()))].join(', ');
    sent += await new HrNotifier(db, tenantId).notifyHrAdmins({
      type: 'warn',
      source: 'hr_payroll',
      title: 'Statutory dues pending',
      body: `${kinds} for ${monthName(prevMonth)} ${prevYear} are not yet deposited. The 15th is the deadline.`,
      targetUrl: '/hr/tds-challans',
    });
  }
  return sent;
}

/** Once a year (Apr 7): nudge employees with no Form 12BB for the new FY. */
async function remindTaxDeclarationWindow(db: Db, ist: IstParts): Promise<number> {
  if (ist.month !== 4 || ist.date !== 7) return 0;
  const fy = `${ist.year}-${String((ist.year + 1) % 100).padStart(2, '0')}`;

  const [emps, decls] = await Promise.all([
    db.select({ tenantId: employees.tenantId, id: employees.id })
      .from(employees).where(eq(employees.status, 'active')),
    db.select({ employeeId: taxDeclarations.employeeId })
      .from(taxDeclarations).where(eq(taxDeclarations.financialYear, fy)),
  ]);
  const hasDeclared = new Set(decls.map((d) => d.employeeId));

  let sent = 0;
  for (const [tenantId, list] of groupByTenant(emps)) {
    const pending = list.filter((e) => !hasDeclared.has(e.id)).map((e) => e.id);
    sent += await new HrNotifier(db, tenantId).notifyEmployees(pending, {
      source: 'hr_tax',
      title: 'Submit your tax declaration',
      body: `Declare your investments for FY ${fy} (Form 12BB) so your TDS is calculated correctly.`,
      targetUrl: '/hr/tax-declarations',
    });
  }
  return sent;
}

/** Onboarding workflows still in progress more than ONBOARDING_STALE_DAYS on. */
async function remindOnboardingOverdue(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - ONBOARDING_STALE_DAYS * 86_400_000);
  const rows = await db
    .select({ tenantId: onboardingWorkflows.tenantId, employeeId: onboardingWorkflows.employeeId })
    .from(onboardingWorkflows)
    .where(and(
      eq(onboardingWorkflows.status, 'in_progress'),
      lt(onboardingWorkflows.startedAt, cutoff),
    ));

  let sent = 0;
  for (const [tenantId, list] of groupByTenant(rows)) {
    const notifier = new HrNotifier(db, tenantId);
    for (const { employeeId } of list) {
      const ok = await notifier.notifyEmployee(employeeId, {
        type: 'warn',
        source: 'hr_onboarding',
        title: 'Finish your onboarding',
        body: 'Some onboarding tasks are still pending. Open HR → Onboarding to complete them.',
        targetUrl: '/hr/onboarding',
      });
      if (ok) sent++;
    }
  }
  return sent;
}

/** Birthdays and work anniversaries — broadcast to the celebrant's department. */
async function remindCelebrations(db: Db, ist: IstParts): Promise<number> {
  const mmdd = `${pad(ist.month)}-${pad(ist.date)}`;
  const rows = await db
    .select({
      tenantId: employees.tenantId, id: employees.id,
      departmentId: employees.departmentId, joiningDate: employees.joiningDate,
      firstName: employees.firstName, lastName: employees.lastName,
      isBirthday: sql<boolean>`to_char(${employees.dateOfBirth}, 'MM-DD') = ${mmdd}`,
      isAnniversary: sql<boolean>`to_char(${employees.joiningDate}, 'MM-DD') = ${mmdd}
        AND extract(year from ${employees.joiningDate}) < ${ist.year}`,
    })
    .from(employees)
    .where(and(
      eq(employees.status, 'active'),
      sql`(to_char(${employees.dateOfBirth}, 'MM-DD') = ${mmdd}
        OR (to_char(${employees.joiningDate}, 'MM-DD') = ${mmdd}
          AND extract(year from ${employees.joiningDate}) < ${ist.year}))`,
    ));

  let sent = 0;
  for (const e of rows) {
    // Department-scoped only — an org-wide blast would be daily notification spam.
    if (!e.departmentId) continue;
    const notifier = new HrNotifier(db, e.tenantId);
    const name = [e.firstName, e.lastName].filter(Boolean).join(' ');
    const exclude = (await notifier.userIdForEmployee(e.id)) ?? undefined;
    const audience = { departmentId: e.departmentId, audience: 'all' as const };

    if (e.isBirthday) {
      sent += await notifier.notifyAudience(audience, {
        type: 'ok', source: 'hr_announcement',
        title: '🎉 Birthday today', body: `Wish ${name} a happy birthday!`,
        targetUrl: '/hr/directory',
      }, exclude);
    }
    if (e.isAnniversary) {
      const years = ist.year - new Date(e.joiningDate).getFullYear();
      sent += await notifier.notifyAudience(audience, {
        type: 'ok', source: 'hr_announcement',
        title: '🎊 Work anniversary',
        body: `${name} completes ${years} year${years === 1 ? '' : 's'} at work today!`,
        targetUrl: '/hr/directory',
      }, exclude);
    }
  }
  return sent;
}

// --- helpers ------------------------------------------------------------

async function safe(label: string, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[hr-reminder] ${label} check failed:`, err);
    return 0;
  }
}

function groupByTenant<T extends { tenantId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.tenantId);
    if (list) list.push(row);
    else map.set(row.tenantId, [row]);
  }
  return map;
}

function monthName(m: number): string {
  return MONTHS[m - 1] ?? String(m);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface IstParts { year: number; month: number; date: number; hour: number; minute: number; }

function nowIst(): IstParts {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    date: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** UTC instant corresponding to 00:00 IST of the current IST day. */
function istDayStartUtc(): Date {
  const ist = nowIst();
  return new Date(Date.UTC(ist.year, ist.month - 1, ist.date) - 5.5 * 60 * 60 * 1000);
}

/**
 * Performance review deadline reminder scheduler.
 *
 * Runs daily at 09:00 IST. For every cycle in 'review' status whose
 * reviewEndDate is within the next 3 days (inclusive), it nudges:
 *   - employees who still have un-self-rated goals in that cycle
 *   - the configured operator / managers sitting on un-finalised reviews
 *
 * Idempotency: an in-process per-day guard prevents double-fire within the
 * minute-poll window. Re-running on a later day simply sends a fresh nudge,
 * which is the desired behaviour as the deadline gets closer.
 */
import { and, eq, sql, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { Redis } from 'ioredis';
import {
  performanceCycles, performanceGoals, performanceReviews,
  employees, users, notifications,
} from '@runq/db';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const INTERVAL_MS = 60_000;
const FIRE_HOUR_IST = 9;
const FIRE_MINUTE_IST = 0;
const REMINDER_WINDOW_DAYS = 3;

let handle: ReturnType<typeof setInterval> | null = null;
let lastFiredYmd: string | null = null;

export function startPerformanceReminderScheduler(db: Db, _redis: Redis, logger: Logger = console): void {
  logger.info('Performance reminder scheduler: started (daily 09:00 IST)');

  handle = setInterval(async () => {
    try {
      const ist = nowIst();
      if (ist.hour !== FIRE_HOUR_IST || ist.minute !== FIRE_MINUTE_IST) return;
      const ymd = `${ist.year}-${ist.month}-${ist.date}`;
      if (lastFiredYmd === ymd) return;
      lastFiredYmd = ymd;

      const sent = await runPerformanceReminders(db);
      logger.info(`Performance reminders: sent ${sent} nudge(s)`);
    } catch (err) {
      logger.error('Performance reminder scheduler tick failed', err);
    }
  }, INTERVAL_MS);
}

export function stopPerformanceReminderScheduler(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

/** Exported for manual invocation / tests. Returns the number of notifications inserted. */
export async function runPerformanceReminders(db: Db): Promise<number> {
  const today = new Date();
  const windowEnd = new Date(today.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const todayIso = today.toISOString().slice(0, 10);
  const windowEndIso = windowEnd.toISOString().slice(0, 10);

  // Cycles in review with a deadline inside the reminder window.
  const cycles = await db
    .select({
      id: performanceCycles.id,
      tenantId: performanceCycles.tenantId,
      name: performanceCycles.name,
      reviewEndDate: performanceCycles.reviewEndDate,
    })
    .from(performanceCycles)
    .where(and(
      eq(performanceCycles.status, 'review'),
      sql`${performanceCycles.reviewEndDate} IS NOT NULL`,
      sql`${performanceCycles.reviewEndDate} >= ${todayIso}`,
      sql`${performanceCycles.reviewEndDate} <= ${windowEndIso}`,
    ));

  let inserted = 0;

  for (const cycle of cycles) {
    const daysLeft = Math.max(
      0,
      Math.round((new Date(cycle.reviewEndDate!).getTime() - today.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const deadlinePhrase = daysLeft <= 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;

    // (a) Employees with at least one un-self-rated goal in this cycle.
    const pendingEmployees = await db
      .selectDistinct({ employeeId: performanceGoals.employeeId })
      .from(performanceGoals)
      .where(and(
        eq(performanceGoals.tenantId, cycle.tenantId),
        eq(performanceGoals.cycleId, cycle.id),
        eq(performanceGoals.status, 'active'),
        isNull(performanceGoals.selfRating),
      ));

    for (const { employeeId } of pendingEmployees) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(employees, sql`regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g') = regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g')`)
        .where(and(
          eq(users.tenantId, cycle.tenantId),
          eq(employees.id, employeeId),
          sql`coalesce(${users.phone}, '') <> ''`,
        ))
        .limit(1);
      if (!u) continue;
      await db.insert(notifications).values({
        tenantId: cycle.tenantId,
        userId: u.id,
        type: 'warn',
        source: 'hr_performance',
        title: `Self-rating due ${deadlinePhrase}`,
        body: `Your ${cycle.name} review window closes ${deadlinePhrase}. Open HR → Performance and self-rate your remaining goals.`,
        targetUrl: '/hr/performance',
      });
      inserted++;
    }

    // (b) Reviews not yet finalised — nudge the assigned manager.
    const openReviews = await db
      .select({
        id: performanceReviews.id,
        managerUserId: performanceReviews.managerUserId,
        employeeId: performanceReviews.employeeId,
      })
      .from(performanceReviews)
      .where(and(
        eq(performanceReviews.tenantId, cycle.tenantId),
        eq(performanceReviews.cycleId, cycle.id),
        inArray(performanceReviews.status, ['pending', 'self_submitted', 'manager_submitted']),
      ));

    for (const r of openReviews) {
      if (!r.managerUserId) continue;
      const [emp] = await db
        .select({ firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(eq(employees.id, r.employeeId))
        .limit(1);
      const empName = emp ? [emp.firstName, emp.lastName].filter(Boolean).join(' ') : 'an employee';
      await db.insert(notifications).values({
        tenantId: cycle.tenantId,
        userId: r.managerUserId,
        type: 'warn',
        source: 'hr_performance',
        title: `Review pending — closes ${deadlinePhrase}`,
        body: `${empName}'s ${cycle.name} review isn't finalised yet. The cycle window closes ${deadlinePhrase}.`,
        targetUrl: '/hr/performance',
      });
      inserted++;
    }
  }

  return inserted;
}

interface IstParts { year: number; month: number; date: number; hour: number; minute: number; }
function nowIst(): IstParts {
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
  const d = new Date(istMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    date: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

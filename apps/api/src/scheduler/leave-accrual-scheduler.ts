/**
 * Leave accrual scheduler.
 *
 * Runs daily at 03:30 IST. On the 1st of each month it advances every
 * tenant's monthly-mode leave_balance rows by one month (or more, if the
 * last run missed days). Other days are a no-op — cheap to keep the
 * one-minute polling cadence consistent with the other schedulers
 * (GST, reports, dunning) and to catch up automatically if the box was
 * down on the 1st.
 *
 * Idempotency lives in LeaveAccrualService: `last_accrued_month` on
 * each balance row gates the UPDATE so re-firing on the same day, or
 * after a long outage, is safe and self-healing.
 */

import type { Db } from '@runq/db';
import type { Redis } from 'ioredis';
import { LeaveAccrualService } from '../modules/hr/leave-accrual.service';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const INTERVAL_MS = 60_000;
// 03:30 IST avoids the GST + report scheduler windows so we don't pile
// onto the DB at the same moment on the 1st of each month.
const FIRE_HOUR_IST = 3;
const FIRE_MINUTE_IST = 30;

let handle: ReturnType<typeof setInterval> | null = null;
// In-process guard to keep the monthly run from re-firing within the
// same calendar day if the minute-poll catches the 30-minute window
// twice (it shouldn't — but cheap insurance).
let lastFiredYmd: string | null = null;

export function startLeaveAccrualScheduler(db: Db, _redis: Redis, logger: Logger = console): void {
  logger.info('Leave accrual scheduler: started (runs 1st of month at 03:30 IST)');

  handle = setInterval(async () => {
    try {
      const ist = nowIst();
      // Day-of-month gate first — cheapest check, skips 30/31 days a month.
      if (ist.date !== 1) return;
      if (ist.hour !== FIRE_HOUR_IST || ist.minute !== FIRE_MINUTE_IST) return;
      const ymd = `${ist.year}-${ist.month}-${ist.date}`;
      if (lastFiredYmd === ymd) return;
      lastFiredYmd = ymd;

      const svc = new LeaveAccrualService(db);
      const summaries = await svc.runForAllTenants(ist.year, ist.month);
      const totalRows = summaries.reduce((s, x) => s + x.rowsUpdated, 0);
      const totalDays = summaries.reduce((s, x) => s + x.daysAdded, 0);
      logger.info(
        `Leave accrual: ran for ${summaries.length} tenants, updated ${totalRows} balances, added ${totalDays.toFixed(2)} days`,
      );
    } catch (err) {
      logger.error('Leave accrual scheduler tick failed', err);
    }
  }, INTERVAL_MS);
}

export function stopLeaveAccrualScheduler(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

interface IstParts {
  year: number;
  month: number;
  date: number;
  hour: number;
  minute: number;
}

function nowIst(): IstParts {
  // IST is UTC+05:30, no DST.
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

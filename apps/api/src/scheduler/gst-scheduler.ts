/**
 * GST automation scheduler:
 *  - 1st of each month at 02:00 IST → auto-generate GSTR-1 + GSTR-3B drafts
 *  - 14th of each month at 02:00 IST → auto-pull GSTR-2B + reconcile
 *  - Daily at 09:00 IST → due-date reminders + overdue escalation
 *
 * Per-tenant: only runs for tenants with `settings.gstin` configured.
 */

import { eq, and, lte, sql, ne, isNotNull } from 'drizzle-orm';
import { tenants, gstReturns, gspAuthTokens } from '@runq/db';
import type { Db } from '@runq/db';
import type { Redis } from 'ioredis';
import type { TenantSettings } from '@runq/types';
import { GstReturnService } from '../modules/gst/gst-return.service';
import { Gstr2bReconciliationService } from '../modules/gst/gstr2b-reconciliation';
import { createEmailProvider } from '../utils/email-provider';
import { sendEmail } from '../utils/email';
import {
  gstDraftReady,
  gstDueReminder,
  gstOverdueEscalation,
} from '../utils/gst-email-templates';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const INTERVAL_MS = 60_000; // check every minute, time-gate inside

let monthlyHandle: ReturnType<typeof setInterval> | null = null;
let twobHandle: ReturnType<typeof setInterval> | null = null;
let dailyHandle: ReturnType<typeof setInterval> | null = null;

export function startGstScheduler(db: Db, redis: Redis, logger: Logger = console): void {
  logger.info('GST scheduler: started (drafts on 1st, 2B on 14th, reminders daily)');

  monthlyHandle = setInterval(
    () => maybeMonthlyDraftGeneration(db, redis, logger),
    INTERVAL_MS,
  );

  twobHandle = setInterval(
    () => maybeMonthly2bPull(db, redis, logger),
    INTERVAL_MS,
  );

  dailyHandle = setInterval(
    () => maybeDailyReminders(db, redis, logger),
    INTERVAL_MS,
  );
}

export function stopGstScheduler(): void {
  if (monthlyHandle) clearInterval(monthlyHandle);
  if (twobHandle) clearInterval(twobHandle);
  if (dailyHandle) clearInterval(dailyHandle);
  monthlyHandle = twobHandle = dailyHandle = null;
}

// ── IST time helpers ───────────────────────────────────────────────────

function istNow(): { date: Date; hour: number; min: number; day: number } {
  const nowUTC = new Date();
  const istHour = (nowUTC.getUTCHours() + 5 + Math.floor((nowUTC.getUTCMinutes() + 30) / 60)) % 24;
  const istMin = (nowUTC.getUTCMinutes() + 30) % 60;
  const istDate = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000);
  return { date: istDate, hour: istHour, min: istMin, day: istDate.getDate() };
}

// ── Period helpers ─────────────────────────────────────────────────────

/** Format a Date as MMYYYY (GSTN period format). */
function periodFor(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${mm}${d.getFullYear()}`;
}

function previousMonthPeriod(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return periodFor(prev);
}

function periodToLabel(period: string): string {
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2), 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${year}`;
}

// ── Tenant helpers ─────────────────────────────────────────────────────

interface GstReadyTenant {
  id: string;
  name: string;
  settings: TenantSettings;
}

async function listTenantsWithGstin(db: Db): Promise<GstReadyTenant[]> {
  const rows = await db
    .select({ id: tenants.id, name: tenants.name, settings: tenants.settings })
    .from(tenants)
    .where(sql`${tenants.settings}->>'gstin' IS NOT NULL AND ${tenants.settings}->>'gstin' != ''`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    settings: r.settings as TenantSettings,
  }));
}

function ownerEmailFor(t: GstReadyTenant): string | undefined {
  const s = t.settings as unknown as Record<string, unknown>;
  return (s.ownerEmail as string) || (s.notificationEmail as string) || undefined;
}

// ── A1: Monthly draft generation ───────────────────────────────────────

function maybeMonthlyDraftGeneration(db: Db, redis: Redis, logger: Logger): void {
  const ist = istNow();
  // 1st of month at 02:00 IST
  if (ist.day !== 1 || ist.hour !== 2 || ist.min > 0) return;
  runMonthlyDraftGeneration(db, redis, logger).catch((err) =>
    logger.error('GST draft generation error:', err),
  );
}

async function runMonthlyDraftGeneration(db: Db, redis: Redis, logger: Logger): Promise<void> {
  const lockKey = 'lock:gst:monthly-drafts';
  const acquired = await redis.set(lockKey, '1', 'EX', 7200, 'NX');
  if (!acquired) return;

  const period = previousMonthPeriod();
  logger.info(`GST drafts: starting auto-generation for ${period}`);

  const eligibleTenants = await listTenantsWithGstin(db);
  logger.info(`GST drafts: ${eligibleTenants.length} tenant(s) eligible`);

  for (const tenant of eligibleTenants) {
    try {
      const svc = new GstReturnService(db, tenant.id);

      // Generate GSTR-1 first (3B depends on it)
      const r1 = await svc.generateGstr1(period);
      logger.info(`GST drafts: tenant ${tenant.id} — GSTR-1 ${r1.id} generated`);

      const r3b = await svc.generateGstr3b(period);
      logger.info(`GST drafts: tenant ${tenant.id} — GSTR-3B ${r3b.id} generated`);

      // Notify
      const to = ownerEmailFor(tenant);
      if (to) {
        const tpl = gstDraftReady({
          companyName: tenant.name,
          periodLabel: periodToLabel(period),
        });
        const provider = createEmailProvider(tenant.settings);
        if (provider) await provider.send({ to, ...tpl });
        else await sendEmail({ to, ...tpl, fromName: tenant.name });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`GST drafts: failed tenant ${tenant.id}: ${msg}`);
    }
  }
}

// ── A2: Monthly 2B pull on 14th ────────────────────────────────────────

function maybeMonthly2bPull(db: Db, redis: Redis, logger: Logger): void {
  const ist = istNow();
  if (ist.day !== 14 || ist.hour !== 2 || ist.min > 0) return;
  runMonthly2bPull(db, redis, logger).catch((err) =>
    logger.error('GST 2B pull error:', err),
  );
}

async function runMonthly2bPull(db: Db, redis: Redis, logger: Logger): Promise<void> {
  const lockKey = 'lock:gst:monthly-2b';
  const acquired = await redis.set(lockKey, '1', 'EX', 7200, 'NX');
  if (!acquired) return;

  const period = previousMonthPeriod();
  logger.info(`GST 2B: starting auto-pull for ${period}`);

  const eligibleTenants = await listTenantsWithGstin(db);

  for (const tenant of eligibleTenants) {
    try {
      // Check if a valid auth token exists (2B needs auth)
      const [token] = await db
        .select()
        .from(gspAuthTokens)
        .where(and(
          eq(gspAuthTokens.tenantId, tenant.id),
          eq(gspAuthTokens.gstin, tenant.settings.gstin!),
        ))
        .orderBy(sql`${gspAuthTokens.createdAt} DESC`)
        .limit(1);

      if (!token || new Date(token.expiresAt) < new Date()) {
        logger.info(`GST 2B: tenant ${tenant.id} — no valid auth token, skipping`);
        continue;
      }

      const reconSvc = new Gstr2bReconciliationService(db, tenant.id);
      await reconSvc.pull2b(period, {
        accessToken: token.accessToken,
        txn: token.txn || '',
        expiresAt: new Date(token.expiresAt),
      });
      const summary = await reconSvc.reconcile(period);
      logger.info(
        `GST 2B: tenant ${tenant.id} — matched ${summary.matched.count}, mismatched ${summary.mismatched.count}, missing-from-books ${summary.notInBooks.count}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`GST 2B: failed tenant ${tenant.id}: ${msg}`);
    }
  }
}

// ── A4 + A5: Daily reminders + overdue escalation ──────────────────────

function maybeDailyReminders(db: Db, redis: Redis, logger: Logger): void {
  const ist = istNow();
  // 09:00 IST daily
  if (ist.hour !== 9 || ist.min > 0) return;
  runDailyReminders(db, redis, logger).catch((err) =>
    logger.error('GST reminders error:', err),
  );
}

/** Due date map (monthly filers): GSTR-1 = 11th, GSTR-3B = 20th */
const DUE_DAY: Record<'gstr1' | 'gstr3b', number> = { gstr1: 11, gstr3b: 20 };

/** Days remaining/overdue between due-date for `period` and today (IST). */
function daysUntilDue(returnType: 'gstr1' | 'gstr3b', period: string, todayIst: Date): number {
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2), 10);
  // Due is in the FOLLOWING month
  const dueDate = new Date(year, month, DUE_DAY[returnType]);
  const today = new Date(todayIst.getFullYear(), todayIst.getMonth(), todayIst.getDate());
  return Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

async function runDailyReminders(db: Db, redis: Redis, logger: Logger): Promise<void> {
  const lockKey = `lock:gst:daily-reminders:${new Date().toISOString().slice(0, 10)}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 86_400, 'NX');
  if (!acquired) return;

  const ist = istNow();
  const period = previousMonthPeriod();
  logger.info(`GST reminders: checking returns for period ${period}`);

  // Get all unfiled returns for the period
  const unfiled = await db
    .select({
      id: gstReturns.id,
      tenantId: gstReturns.tenantId,
      returnType: gstReturns.returnType,
      period: gstReturns.period,
      status: gstReturns.status,
      tenantName: tenants.name,
      settings: tenants.settings,
    })
    .from(gstReturns)
    .innerJoin(tenants, eq(tenants.id, gstReturns.tenantId))
    .where(and(
      ne(gstReturns.status, 'filed'),
      eq(gstReturns.period, period),
    ));

  for (const ret of unfiled) {
    try {
      const settings = ret.settings as TenantSettings;
      const ownerEmail = ownerEmailFor({ id: ret.tenantId, name: ret.tenantName, settings });
      if (!ownerEmail) continue;

      const days = daysUntilDue(ret.returnType, ret.period, ist.date);

      // Reminder thresholds: T-6, T-1, T+0 (due today), and overdue every 3 days
      const shouldRemind =
        days === 6 ||
        days === 1 ||
        days === 0 ||
        (days < 0 && days % 3 === 0);
      if (!shouldRemind) continue;

      const provider = createEmailProvider(settings);
      const periodLabel = periodToLabel(ret.period);
      const returnLabel = ret.returnType.toUpperCase();

      if (days < 0) {
        // Overdue escalation
        const lateFee = estimateLateFee(ret.returnType, Math.abs(days));
        const tpl = gstOverdueEscalation({
          companyName: ret.tenantName,
          returnLabel,
          periodLabel,
          daysOverdue: Math.abs(days),
          lateFeeEstimate: lateFee,
        });
        if (provider) await provider.send({ to: ownerEmail, ...tpl });
        else await sendEmail({ to: ownerEmail, ...tpl, fromName: ret.tenantName });
        logger.info(`GST reminders: tenant ${ret.tenantId} — sent overdue (${Math.abs(days)}d) for ${returnLabel}`);
      } else {
        const tpl = gstDueReminder({
          companyName: ret.tenantName,
          returnLabel,
          periodLabel,
          daysRemaining: days,
        });
        if (provider) await provider.send({ to: ownerEmail, ...tpl });
        else await sendEmail({ to: ownerEmail, ...tpl, fromName: ret.tenantName });
        logger.info(`GST reminders: tenant ${ret.tenantId} — sent T-${days} for ${returnLabel}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`GST reminders: failed return ${ret.id}: ${msg}`);
    }
  }
}

/** Late fee estimate per CGST + SGST (Rs 50/day for nil, capped at Rs 5000). */
function estimateLateFee(returnType: 'gstr1' | 'gstr3b', daysOverdue: number): number {
  // Rs 50/day combined CGST+SGST (Rs 25 each), capped at Rs 5,000
  // This is an estimate — actual depends on nil vs non-nil and turnover slab
  return Math.min(50 * daysOverdue, 5000);
}

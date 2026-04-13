import { eq, and, lte, sql } from 'drizzle-orm';
import { scheduledReports, recurringInvoiceTemplates, dunningRules, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { Redis } from 'ioredis';
import type { TenantSettings } from '@runq/types';
import { createEmailProvider } from '../utils/email-provider';
import { sendEmail } from '../utils/email';
import { ReportRenderer } from '../modules/reports/report-renderer';
import { computeNextRun } from '../utils/schedule';
import { RecurringInvoiceService } from '../modules/ar/recurring.service';
import { DunningService } from '../modules/ar/dunning.service';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const INTERVAL_MS = 60_000; // check every minute

const DUNNING_INTERVAL_MS = 60_000; // check every minute, but only run at 1 AM IST

let schedulerHandle: ReturnType<typeof setInterval> | null = null;
let recurringHandle: ReturnType<typeof setInterval> | null = null;
let dunningHandle: ReturnType<typeof setInterval> | null = null;

export function startReportScheduler(db: Db, redis: Redis, logger: Logger = console): void {
  logger.info('Report scheduler: started (checking every 60s)');
  schedulerHandle = setInterval(
    () => runDueReports(db, redis, logger).catch((err) => logger.error('Scheduler error:', err)),
    INTERVAL_MS,
  );

  logger.info('Recurring invoices: started (checking every 60s)');
  recurringHandle = setInterval(
    () => runDueRecurringInvoices(db, logger).catch((err) => logger.error('Recurring invoices error:', err)),
    INTERVAL_MS,
  );

  logger.info('Dunning scheduler: started (runs daily at 1 AM IST)');
  dunningHandle = setInterval(
    () => maybeDunning(db, redis, logger),
    DUNNING_INTERVAL_MS,
  );
}

export function stopReportScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
  if (recurringHandle) {
    clearInterval(recurringHandle);
    recurringHandle = null;
  }
  if (dunningHandle) {
    clearInterval(dunningHandle);
    dunningHandle = null;
  }
}

async function runDueReports(db: Db, redis: Redis, logger: Logger): Promise<void> {
  const now = new Date();

  const dueReports = await db
    .select()
    .from(scheduledReports)
    .where(
      and(
        eq(scheduledReports.isActive, true),
        lte(scheduledReports.nextRunAt, now),
      ),
    );

  for (const report of dueReports) {
    const lockKey = `lock:scheduler:${report.id}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 120, 'NX');
    if (!acquired) continue;

    try {
      await executeReport(db, report, logger);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Scheduler: failed report ${report.id} (${report.name}): ${msg}`);
      await db.update(scheduledReports).set({
        lastRunStatus: 'failed',
        lastError: msg.slice(0, 2000),
        nextRunAt: computeNextRun(report.frequency),
        updatedAt: new Date(),
      }).where(eq(scheduledReports.id, report.id));
    }
  }
}

async function runDueRecurringInvoices(db: Db, logger: Logger): Promise<void> {
  const today = new Date().toISOString().split('T')[0]!;

  const dueTenants = await db
    .selectDistinct({ tenantId: recurringInvoiceTemplates.tenantId })
    .from(recurringInvoiceTemplates)
    .where(and(
      eq(recurringInvoiceTemplates.status, 'active'),
      lte(recurringInvoiceTemplates.nextRunDate, today),
    ));

  for (const { tenantId } of dueTenants) {
    try {
      const service = new RecurringInvoiceService(db, tenantId);
      const { generated, errors } = await service.generateDueInvoices();
      if (generated > 0) {
        logger.info(`Recurring invoices: generated ${generated} for tenant ${tenantId}`);
      }
      for (const errMsg of errors) {
        logger.error(`Recurring invoices tenant ${tenantId}: ${errMsg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Recurring invoices: failed tenant ${tenantId}: ${msg}`);
    }
  }
}

function maybeDunning(db: Db, redis: Redis, logger: Logger): void {
  // In dry-run mode, skip time gate — run on first tick
  if (process.env.DUNNING_DRY_RUN_EMAIL) {
    runDunningForAllTenants(db, redis, logger).catch((err) => logger.error('Dunning scheduler error:', err));
    return;
  }

  // IST = UTC+5:30 — only run between 1:00 and 1:01 AM IST
  const nowUTC = new Date();
  const istHour = (nowUTC.getUTCHours() + 5 + Math.floor((nowUTC.getUTCMinutes() + 30) / 60)) % 24;
  const istMin = (nowUTC.getUTCMinutes() + 30) % 60;
  if (istHour !== 1 || istMin > 0) return;

  runDunningForAllTenants(db, redis, logger).catch((err) => logger.error('Dunning scheduler error:', err));
}

async function runDunningForAllTenants(db: Db, redis: Redis, logger: Logger): Promise<void> {
  // Redis lock ensures only one run per day even with multiple instances
  const lockKey = 'lock:dunning:daily';
  const acquired = await redis.set(lockKey, '1', 'EX', 72_000, 'NX');
  if (!acquired) return;

  // Find tenants that have active dunning rules
  const activeTenants = await db
    .selectDistinct({ tenantId: dunningRules.tenantId })
    .from(dunningRules)
    .where(eq(dunningRules.isActive, true));

  for (const { tenantId } of activeTenants) {
    try {
      const service = new DunningService(db, tenantId);
      const { sent, failed, skipped } = await service.autoSendDunning();
      if (sent > 0 || failed > 0) {
        logger.info(`Dunning: tenant ${tenantId} — sent ${sent}, failed ${failed}, skipped ${skipped}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Dunning: failed tenant ${tenantId}: ${msg}`);
    }
  }
}

async function executeReport(
  db: Db,
  report: typeof scheduledReports.$inferSelect,
  logger: Logger,
): Promise<void> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, report.tenantId)).limit(1);
  if (!tenant) throw new Error('Tenant not found');

  const settings = (tenant.settings ?? {}) as TenantSettings;
  const companyName = tenant.name;
  const recipients = report.recipients as string[];

  if (recipients.length === 0) throw new Error('No recipients configured');

  const renderer = new ReportRenderer(db, report.tenantId, companyName);
  const { subject, html, text } = await renderer.render(report.reportType, report.frequency);

  const provider = createEmailProvider(settings);
  let sentCount = 0;

  for (const to of recipients) {
    try {
      if (provider) {
        await provider.send({ to, subject, html, text });
      } else {
        await sendEmail({ to, subject, html, text, fromName: companyName });
      }
      sentCount++;
    } catch (err) {
      logger.error(`Scheduler: failed to send to ${to}: ${err}`);
    }
  }

  if (sentCount === 0) throw new Error(`Failed to send to all ${recipients.length} recipients`);

  await db.update(scheduledReports).set({
    lastSentAt: new Date(),
    lastRunStatus: 'success',
    lastError: null,
    nextRunAt: computeNextRun(report.frequency),
    updatedAt: new Date(),
  }).where(eq(scheduledReports.id, report.id));

  logger.info(`Scheduler: sent "${report.name}" to ${sentCount}/${recipients.length} recipients`);
}

// Exported for the "Run Now" API endpoint
export async function runReportNow(
  db: Db,
  reportId: string,
  tenantId: string,
): Promise<void> {
  const [report] = await db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.id, reportId), eq(scheduledReports.tenantId, tenantId)));

  if (!report) throw new Error('Report not found');
  await executeReport(db, report, console);
}

import { eq, and, lte, sql } from 'drizzle-orm';
import { scheduledReports, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { createEmailProvider } from '../utils/email-provider';
import { sendEmail } from '../utils/email';
import { ReportRenderer } from '../modules/reports/report-renderer';
import { computeNextRun } from '../utils/schedule';

const INTERVAL_MS = 60_000; // check every minute

export function startReportScheduler(db: Db): void {
  console.log('Report scheduler: started (checking every 60s)');
  setInterval(() => runDueReports(db).catch((err) => console.error('Scheduler error:', err)), INTERVAL_MS);
}

async function runDueReports(db: Db): Promise<void> {
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
    try {
      await executeReport(db, report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Scheduler: failed report ${report.id} (${report.name}):`, msg);
      await db.update(scheduledReports).set({
        lastRunStatus: 'failed',
        lastError: msg.slice(0, 2000),
        nextRunAt: computeNextRun(report.frequency),
        updatedAt: new Date(),
      }).where(eq(scheduledReports.id, report.id));
    }
  }
}

async function executeReport(
  db: Db,
  report: typeof scheduledReports.$inferSelect,
): Promise<void> {
  // Get tenant info for email config and company name
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, report.tenantId)).limit(1);
  if (!tenant) throw new Error('Tenant not found');

  const settings = (tenant.settings ?? {}) as TenantSettings;
  const companyName = tenant.name;
  const recipients = report.recipients as string[];

  if (recipients.length === 0) throw new Error('No recipients configured');

  // Generate report
  const renderer = new ReportRenderer(db, report.tenantId, companyName);
  const { subject, html, text } = await renderer.render(report.reportType, report.frequency);

  // Send to all recipients
  const provider = createEmailProvider(settings);
  let sentCount = 0;

  for (const to of recipients) {
    try {
      if (provider) {
        await provider.send({ to, subject, html, text });
      } else {
        // Fall back to global SMTP from env
        await sendEmail({ to, subject, html, text, fromName: companyName });
      }
      sentCount++;
    } catch (err) {
      console.error(`Scheduler: failed to send to ${to}:`, err);
    }
  }

  if (sentCount === 0) throw new Error(`Failed to send to all ${recipients.length} recipients`);

  // Mark success and schedule next run
  await db.update(scheduledReports).set({
    lastSentAt: new Date(),
    lastRunStatus: 'success',
    lastError: null,
    nextRunAt: computeNextRun(report.frequency),
    updatedAt: new Date(),
  }).where(eq(scheduledReports.id, report.id));

  console.log(`Scheduler: sent "${report.name}" to ${sentCount}/${recipients.length} recipients`);
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
  await executeReport(db, report);
}

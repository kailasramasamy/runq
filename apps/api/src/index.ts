import { loadEnv } from './config/env';
import { buildApp } from './app';
import { initEmailTransport } from './utils/email';
import { startReportScheduler, stopReportScheduler } from './scheduler/report-scheduler';
import { startGstScheduler, stopGstScheduler } from './scheduler/gst-scheduler';
import { startLeaveAccrualScheduler, stopLeaveAccrualScheduler } from './scheduler/leave-accrual-scheduler';
import { startPerformanceReminderScheduler, stopPerformanceReminderScheduler } from './scheduler/performance-reminder-scheduler';
import { startHrReminderScheduler, stopHrReminderScheduler } from './scheduler/hr-reminder-scheduler';
import { startAnalyticsScheduler, stopAnalyticsScheduler } from './modules/analytics/scheduler';

async function main() {
  const env = loadEnv();
  initEmailTransport();
  const app = await buildApp();

  app.addHook('onClose', () => {
    stopReportScheduler();
    stopGstScheduler();
    stopLeaveAccrualScheduler();
    stopPerformanceReminderScheduler();
    stopHrReminderScheduler();
    stopAnalyticsScheduler();
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server running on port ${env.PORT}`);
    startReportScheduler(app.db, app.redis, app.log);
    startGstScheduler(app.db, app.redis, app.log);
    startLeaveAccrualScheduler(app.db, app.redis, app.log);
    startPerformanceReminderScheduler(app.db, app.redis, app.log);
    startHrReminderScheduler(app.db, app.redis, app.log);
    startAnalyticsScheduler(app.db, app.redis, app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

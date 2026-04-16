import { loadEnv } from './config/env';
import { buildApp } from './app';
import { initEmailTransport } from './utils/email';
import { startReportScheduler, stopReportScheduler } from './scheduler/report-scheduler';
import { startGstScheduler, stopGstScheduler } from './scheduler/gst-scheduler';

async function main() {
  const env = loadEnv();
  initEmailTransport();
  const app = await buildApp();

  app.addHook('onClose', () => {
    stopReportScheduler();
    stopGstScheduler();
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server running on port ${env.PORT}`);
    startReportScheduler(app.db, app.redis, app.log);
    startGstScheduler(app.db, app.redis, app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

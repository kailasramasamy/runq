import { loadEnv } from './config/env';
import { buildApp } from './app';
import { initEmailTransport } from './utils/email';
import { startReportScheduler } from './scheduler/report-scheduler';

async function main() {
  const env = loadEnv();
  initEmailTransport();
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server running on port ${env.PORT}`);
    startReportScheduler(app.db);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

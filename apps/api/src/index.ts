import { loadEnv } from './config/env';
import { buildApp } from './app';

async function main() {
  const env = loadEnv();
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server running on port ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

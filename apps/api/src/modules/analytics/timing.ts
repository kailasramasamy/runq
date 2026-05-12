import type { FastifyBaseLogger } from 'fastify';

const SLOW_QUERY_MS = Number(process.env.ANALYTICS_SLOW_QUERY_MS || 500);

export async function timed<T>(
  logger: Pick<FastifyBaseLogger, 'warn'>,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - started);
    if (ms >= SLOW_QUERY_MS) {
      logger.warn({ analytics_slow: true, label, ms }, `analytics slow: ${label} ${ms}ms`);
    }
  }
}

import type Redis from 'ioredis';

const KEY_PREFIX = 'analytics';
const DEFAULT_TTL_SEC = 600;

function buildKey(tenantId: string, metricKey: string, variant?: string) {
  const base = `${KEY_PREFIX}:${tenantId}:${metricKey}`;
  return variant ? `${base}:${variant}` : base;
}

export async function getOrCompute<T>(
  redis: Redis,
  opts: { tenantId: string; metricKey: string; variant?: string; ttlSec?: number },
  compute: () => Promise<T>,
): Promise<T> {
  const key = buildKey(opts.tenantId, opts.metricKey, opts.variant);
  const cached = await redis.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }
  const value = await compute();
  await redis.set(key, JSON.stringify(value), 'EX', opts.ttlSec ?? DEFAULT_TTL_SEC);
  return value;
}

export async function invalidate(
  redis: Redis,
  opts: { tenantId: string; metricKey?: string },
): Promise<number> {
  const pattern = opts.metricKey
    ? `${KEY_PREFIX}:${opts.tenantId}:${opts.metricKey}*`
    : `${KEY_PREFIX}:${opts.tenantId}:*`;
  let cursor = '0';
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    if (keys.length > 0) {
      removed += await redis.del(...keys);
    }
  } while (cursor !== '0');
  return removed;
}

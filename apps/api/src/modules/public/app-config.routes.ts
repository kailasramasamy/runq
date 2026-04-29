import { FastifyPluginAsync } from 'fastify';
import { appConfig } from '@runq/db';

/**
 * Public mobile app configuration manifest.
 *
 * Values are managed live from the super-admin /admin/app-config UI and
 * stored in the `app_config` table. Cached in Redis for 60 seconds; the
 * admin set route invalidates the cache when a value changes.
 *
 * Mobile clients consume `currentVersion` (soft "Update available" prompt)
 * and `minVersion` (blocking "Update required" dialog).
 */

const CACHE_KEY = 'appcfg:public';
const CACHE_TTL_SECONDS = 60;

interface PublicConfig {
  currentVersion: string;
  minVersion: string;
  forceUpdateMessage: string;
  maintenance: { enabled: boolean; message: string };
}

const DEFAULTS: PublicConfig = {
  currentVersion: '1.0.0',
  minVersion: '1.0.0',
  forceUpdateMessage: 'Please update to the latest version of runQ.',
  maintenance: { enabled: false, message: '' },
};

export const appConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get('/app-config', async () => {
    const cached = await app.redis.get(CACHE_KEY);
    if (cached) {
      return { data: JSON.parse(cached) as PublicConfig };
    }

    const rows = await app.db.select().from(appConfig);
    const map = new Map<string, unknown>(rows.map((r) => [r.key, r.value]));

    const config: PublicConfig = {
      currentVersion: (map.get('mobile.currentVersion') as string) ?? DEFAULTS.currentVersion,
      minVersion: (map.get('mobile.minVersion') as string) ?? DEFAULTS.minVersion,
      forceUpdateMessage: (map.get('mobile.forceUpdateMessage') as string) ?? DEFAULTS.forceUpdateMessage,
      maintenance: {
        enabled: (map.get('platform.maintenance.enabled') as boolean) ?? false,
        message: (map.get('platform.maintenance.message') as string) ?? DEFAULTS.maintenance.message,
      },
    };

    await app.redis.set(CACHE_KEY, JSON.stringify(config), 'EX', CACHE_TTL_SECONDS);
    return { data: config };
  });
};

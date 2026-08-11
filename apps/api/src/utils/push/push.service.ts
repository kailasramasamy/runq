import { and, eq, inArray } from 'drizzle-orm';
import { deviceTokens } from '@runq/db';
import type { Db } from '@runq/db';
import { getFcm } from './firebase-admin';

export type DevicePlatform = 'android' | 'ios';

/** The app a device token belongs to. See `deviceAppEnum`. */
export type DeviceApp = 'runq' | 'dhenu';

export interface PushPayload {
  title: string;
  body?: string;
  targetUrl?: string;
}

/**
 * Which app should receive a notification, from its `source` tag.
 *
 * The two apps are mutually exclusive audiences: Dhenu is a milk-procurement
 * app and has no business buzzing about leave approvals, just as runQ has no
 * business buzzing about a milk dispatch. `mp_*` is the Dhenu namespace (see
 * `MpNotificationSource`); everything else — `hr_*`, finance, system — is runQ.
 */
export function appForSource(source?: string): DeviceApp {
  return source?.startsWith('mp_') ? 'dhenu' : 'runq';
}

/**
 * Upsert a device's FCM token, re-pointing it at the current tenant/user/app.
 *
 * Re-pointing `app` matters for self-healing: rows that predate app scoping
 * were backfilled as 'runq', and flip to their real app the first time that
 * app registers its token again (which both do on every launch).
 */
export async function registerDeviceToken(
  db: Db,
  tenantId: string,
  userId: string,
  token: string,
  platform: DevicePlatform,
  app: DeviceApp = 'runq',
): Promise<void> {
  await db
    .insert(deviceTokens)
    .values({ tenantId, userId, token, platform, app })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: { tenantId, userId, platform, app, lastSeenAt: new Date() },
    });
}

/** Drop a device token — called on logout or when the client invalidates it. */
export async function unregisterDeviceToken(db: Db, token: string): Promise<void> {
  await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
}

/**
 * Push an FCM notification to a user's devices *for one app*. No-op when FCM
 * is unconfigured or the user has no devices registered for that app. Tokens
 * FCM reports as unregistered/invalid are pruned so the table self-heals.
 *
 * [app] is not optional by accident: one user commonly holds tokens for both
 * runQ and Dhenu under the same `users.id`, and an unscoped send delivers the
 * same notification to both phones.
 *
 * Callers fire-and-forget this — a push failure must not break the in-app
 * notification that triggered it.
 */
export async function sendPushToUser(
  db: Db,
  tenantId: string,
  userId: string,
  payload: PushPayload,
  app: DeviceApp,
): Promise<void> {
  const fcm = getFcm();
  if (!fcm) return;

  const rows = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(and(
      eq(deviceTokens.tenantId, tenantId),
      eq(deviceTokens.userId, userId),
      eq(deviceTokens.app, app),
    ));
  if (rows.length === 0) return;

  const tokens = rows.map((r) => r.token);
  const res = await fcm.sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.targetUrl ? { targetUrl: payload.targetUrl } : {},
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  });

  const dead = res.responses.flatMap((r, i) => {
    const code = r.error?.code;
    return code === 'messaging/registration-token-not-registered'
      || code === 'messaging/invalid-argument'
      ? [tokens[i]!]
      : [];
  });
  if (dead.length > 0) {
    await db.delete(deviceTokens).where(inArray(deviceTokens.token, dead));
  }
}

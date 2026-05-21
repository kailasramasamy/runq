import { and, eq, inArray } from 'drizzle-orm';
import { deviceTokens } from '@runq/db';
import type { Db } from '@runq/db';
import { getFcm } from './firebase-admin';

export type DevicePlatform = 'android' | 'ios';

export interface PushPayload {
  title: string;
  body?: string;
  targetUrl?: string;
}

/** Upsert a device's FCM token, re-pointing it at the current tenant/user. */
export async function registerDeviceToken(
  db: Db,
  tenantId: string,
  userId: string,
  token: string,
  platform: DevicePlatform,
): Promise<void> {
  await db
    .insert(deviceTokens)
    .values({ tenantId, userId, token, platform })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: { tenantId, userId, platform, lastSeenAt: new Date() },
    });
}

/** Drop a device token — called on logout or when the client invalidates it. */
export async function unregisterDeviceToken(db: Db, token: string): Promise<void> {
  await db.delete(deviceTokens).where(eq(deviceTokens.token, token));
}

/**
 * Push an FCM notification to every device a user has registered. No-op when
 * FCM is unconfigured or the user has no devices. Tokens FCM reports as
 * unregistered/invalid are pruned so the table self-heals.
 *
 * Callers fire-and-forget this — a push failure must not break the in-app
 * notification that triggered it.
 */
export async function sendPushToUser(
  db: Db,
  tenantId: string,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const fcm = getFcm();
  if (!fcm) return;

  const rows = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(and(eq(deviceTokens.tenantId, tenantId), eq(deviceTokens.userId, userId)));
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

/**
 * Push diagnostics. Sends directly via firebase-admin and prints the full
 * FCM response — success/failure counts and per-token error codes — so we can
 * see exactly what FCM/APNs reported.
 *
 * Usage: tsx --env-file=../../.env scripts/diag-push.ts <phone>
 */
import { eq } from 'drizzle-orm';
import { createDb, users, deviceTokens } from '@runq/db';
import { getFcm } from '../src/utils/push/firebase-admin';

async function main(): Promise<void> {
  const phone = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!phone || !url) {
    console.error('Usage: tsx scripts/diag-push.ts <phone> (and DATABASE_URL set)');
    process.exit(1);
  }

  const { db } = createDb(url);
  const digits = phone.replace(/\D/g, '');
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, digits))
    .limit(1);
  if (!user) {
    console.error(`No user with phone ${phone}`);
    process.exit(1);
  }

  const rows = await db
    .select({ token: deviceTokens.token, platform: deviceTokens.platform })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, user.id));
  console.log(`device tokens for user: ${rows.length}`);
  rows.forEach((r) => console.log(`  ${r.platform}  ${r.token.slice(0, 24)}…`));

  const fcm = getFcm();
  if (!fcm) {
    console.error('getFcm() returned null — FIREBASE_SERVICE_ACCOUNT not loaded.');
    process.exit(1);
  }
  if (rows.length === 0) {
    console.error('No tokens to send to.');
    process.exit(1);
  }

  const tokens = rows.map((r) => r.token);
  const res = await fcm.sendEachForMulticast({
    tokens,
    notification: { title: 'runQ diagnostic', body: 'diag push' },
    apns: { payload: { aps: { sound: 'default' } } },
  });

  console.log(`\nsuccessCount=${res.successCount}  failureCount=${res.failureCount}`);
  res.responses.forEach((r, i) => {
    console.log(
      `[${i}] success=${r.success}  messageId=${r.messageId ?? '-'}  ` +
        `error=${r.error?.code ?? '-'}  :: ${r.error?.message ?? ''}`,
    );
  });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Manual push test. Creates a notification for a user (matched by phone),
 * which routes through NotificationsService.create() and fires an FCM push
 * to every device that user has registered.
 *
 * Usage: tsx --env-file=../../.env scripts/test-push.ts <phone>
 */
import { sql } from 'drizzle-orm';
import { createDb, users } from '@runq/db';
import { NotificationsService } from '../src/modules/dashboard/notifications.service';

async function main(): Promise<void> {
  const phone = process.argv[2];
  const url = process.env.DATABASE_URL;

  if (!phone) {
    console.error('Usage: tsx scripts/test-push.ts <phone>');
    process.exit(1);
  }
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn('WARNING: FIREBASE_SERVICE_ACCOUNT unset — notification created but no push sent.');
  }

  const { db } = createDb(url);
  const digits = phone.replace(/\D/g, '');

  const [user] = await db
    .select({ id: users.id, tenantId: users.tenantId })
    .from(users)
    .where(sql`regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g') = ${digits}`)
    .limit(1);

  if (!user) {
    console.error(`No user found with phone ${phone}`);
    process.exit(1);
  }

  await new NotificationsService(db, user.tenantId, user.id).create({
    type: 'info',
    source: 'system',
    title: 'runQ push test 🎉',
    body: 'If this arrives as a banner, FCM is working end to end.',
    targetUrl: '/notifications',
  });

  console.log(`Notification created for user ${user.id} — push dispatched.`);
  // Give the fire-and-forget push a moment to flush before the process exits.
  await new Promise((r) => setTimeout(r, 2000));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

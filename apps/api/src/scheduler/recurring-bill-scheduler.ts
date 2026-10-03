/**
 * Recurring bill scheduler — raises each rent / transport agreement's monthly
 * bill once its bill day arrives.
 *
 * Ticks hourly rather than at a fixed time: generation is idempotent (one bill
 * per agreement per month, unique-indexed), so a tick missed to a deploy or
 * restart is simply caught up by the next one. Also runs once on start.
 */

import { eq } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { recurringBills } from '@runq/db';
import type { Redis } from 'ioredis';
import { generateForAgreement } from '../modules/ap/recurring-bill-generator';

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const INTERVAL_MS = 60 * 60_000;

let handle: ReturnType<typeof setInterval> | null = null;

async function tick(db: Db, logger: Logger): Promise<void> {
  const active = await db.select().from(recurringBills).where(eq(recurringBills.isActive, true));
  let created = 0;
  for (const a of active) {
    // One agreement's failure (e.g. a deleted vendor) mustn't block the rest.
    await generateForAgreement(db, a)
      .then((n) => { created += n; })
      .catch((err) => logger.error(`Recurring bill ${a.id} failed to generate`, err));
  }
  if (created) logger.info(`Recurring bills: raised ${created} bill(s)`);
}

export function startRecurringBillScheduler(db: Db, _redis: Redis, logger: Logger = console): void {
  logger.info('Recurring bill scheduler: started (hourly)');
  void tick(db, logger).catch((err) => logger.error('Recurring bill scheduler tick failed', err));
  handle = setInterval(() => {
    void tick(db, logger).catch((err) => logger.error('Recurring bill scheduler tick failed', err));
  }, INTERVAL_MS);
}

export function stopRecurringBillScheduler(): void {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

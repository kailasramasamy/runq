import { eq, and, lte, gte } from 'drizzle-orm';
import { fiscalPeriods } from '@runq/db';
import type { Db } from '@runq/db';
import { ConflictError } from './errors';

export async function enforceLockDate(db: Db, tenantId: string, date: string): Promise<void> {
  const [locked] = await db.select({ id: fiscalPeriods.id })
    .from(fiscalPeriods)
    .where(and(
      eq(fiscalPeriods.tenantId, tenantId),
      eq(fiscalPeriods.status, 'locked'),
      lte(fiscalPeriods.startDate, date),
      gte(fiscalPeriods.endDate, date),
    ))
    .limit(1);

  if (locked) {
    throw new ConflictError(
      `Cannot create or modify transactions in a locked period. Date ${date} falls within a locked fiscal period.`,
    );
  }
}

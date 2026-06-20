import { and, eq, isNull } from 'drizzle-orm';
import { mpShiftClosures } from '@runq/db';
import type { Db } from '@runq/db';

type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Is there an active (not-yet-reopened) close for this exact slot? Shared by the
 * pour guard, the reverse guard, and the dispatch hard gate so the rule lives in
 * one place. Accepts a tx or the db handle.
 */
export async function isShiftClosed(
  exec: Executor,
  args: { tenantId: string; nodeId: string; collectionDate: string; shift: 'am' | 'pm' },
): Promise<boolean> {
  const [row] = await exec.select({ id: mpShiftClosures.id }).from(mpShiftClosures)
    .where(and(
      eq(mpShiftClosures.tenantId, args.tenantId),
      eq(mpShiftClosures.nodeId, args.nodeId),
      eq(mpShiftClosures.collectionDate, args.collectionDate),
      eq(mpShiftClosures.shift, args.shift),
      isNull(mpShiftClosures.reopenedAt),
    )).limit(1);
  return !!row;
}

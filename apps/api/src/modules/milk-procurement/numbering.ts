import { sql } from 'drizzle-orm';
import { mpSequences } from '@runq/db';
import type { Db } from '@runq/db';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Indian financial year (Apr–Mar) for a YYYY-MM-DD date, e.g. "2026-27". */
export function financialYear(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Atomically bump the per-(tenant, docType, FY) counter and format a doc no. */
export async function nextDocNo(
  tx: Tx,
  tenantId: string,
  docType: string,
  date: string,
  prefix: string,
): Promise<string> {
  const fy = financialYear(date);
  const [seq] = await tx.insert(mpSequences)
    .values({ tenantId, docType, financialYear: fy, lastSequence: 1 })
    .onConflictDoUpdate({
      target: [mpSequences.tenantId, mpSequences.docType, mpSequences.financialYear],
      set: { lastSequence: sql`${mpSequences.lastSequence} + 1`, updatedAt: new Date() },
    })
    .returning({ n: mpSequences.lastSequence });
  return `${prefix}/${fy}/${String(seq!.n).padStart(5, '0')}`;
}

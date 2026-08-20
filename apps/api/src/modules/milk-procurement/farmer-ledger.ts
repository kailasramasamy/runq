import { and, desc, eq } from 'drizzle-orm';
import { mpFarmerLedger } from '@runq/db';
import type { Db } from '@runq/db';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type LedgerRow = typeof mpFarmerLedger.$inferSelect;

/**
 * The farmer's running debt to us, split by what it is owed against. The three
 * buckets are recovered by the payout cycle in the order they appear here (see
 * `waterfall`): milk we sold him first — it is the freshest receivable and,
 * unlike a loan, was never meant to sit on the books — then advances, then
 * cattle-feed loans, which are the ones deliberately spread over cycles.
 */
export interface Outstanding {
  farmerSale: number;
  advance: number;
  feedLoan: number;
}

/** Bucket ↔ mp_deduction value, in recovery order. */
export const DEDUCTION_TYPES = [
  ['farmerSale', 'farmer_sale'],
  ['advance', 'advance'],
  ['feedLoan', 'cattle_feed_loan'],
] as const satisfies ReadonlyArray<readonly [keyof Outstanding, string]>;

export const BUCKET_BY_DEDUCTION: Record<string, keyof Outstanding | undefined> = {
  farmer_sale: 'farmerSale', advance: 'advance', cattle_feed_loan: 'feedLoan',
};

export function zeroOutstanding(): Outstanding {
  return { farmerSale: 0, advance: 0, feedLoan: 0 };
}

type FoldRow = { entryType: string; refType: string | null; amount: string };

/**
 * Outstanding per bucket from a farmer's whole ledger. A `repayment` names its
 * bucket in `refType`; rows written before milk sales existed carry only
 * 'advance' / 'cattle_feed_loan', and anything unrecognised pays down the
 * advance — the pre-existing default.
 */
export function foldOutstanding(rows: FoldRow[]): Outstanding {
  const out = zeroOutstanding();
  for (const r of rows) {
    const amt = Number(r.amount);
    if (r.entryType === 'advance_given') out.advance += amt;
    else if (r.entryType === 'feed_loan_given') out.feedLoan += amt;
    else if (r.entryType === 'farmer_sale') out.farmerSale += amt;
    else if (r.entryType === 'repayment') out[BUCKET_BY_DEDUCTION[r.refType ?? ''] ?? 'advance'] -= amt;
    // A reversed milk sale contras itself. Other adjustments are left alone —
    // they moved the running balance without ever naming a bucket.
    else if (r.entryType === 'adjustment' && r.refType === 'farmer_sale') out.farmerSale -= amt;
  }
  for (const k of Object.keys(out) as (keyof Outstanding)[]) out[k] = Math.max(0, round2(out[k]));
  return out;
}

/**
 * Total owed, summed rather than read off the newest row's `balance_after`.
 *
 * `balance_after` is a running total in CREATION order, so the newest row by
 * `occurred_on` is not the newest by creation once anything is backdated — and
 * a backdated milk sale reported the balance as of whatever row happened to
 * carry the latest date. Summing is ordering-independent.
 */
export function ledgerBalance(rows: FoldRow[]): number {
  let owed = 0;
  for (const r of rows) {
    const amt = Number(r.amount);
    const grows = r.entryType === 'advance_given'
      || r.entryType === 'feed_loan_given' || r.entryType === 'farmer_sale';
    owed += grows ? amt : -amt;
  }
  return round2(owed);
}

/** How much of `gross` each bucket recovers this cycle, in DEDUCTION_TYPES order. */
export function waterfall(out: Outstanding, gross: number): Outstanding & { total: number } {
  const taken = zeroOutstanding();
  let remaining = gross;
  for (const [bucket] of DEDUCTION_TYPES) {
    const take = round2(Math.min(out[bucket], Math.max(0, remaining)));
    taken[bucket] = take;
    remaining = round2(remaining - take);
  }
  return { ...taken, total: round2(gross - remaining) };
}

/**
 * Append one entry to a farmer's ledger, deriving `balance_after` from the last
 * row inside the same transaction. `advance_given`, `feed_loan_given` and
 * `farmer_sale` grow the debt; `repayment` and a negative `adjustment` shrink it.
 */
export async function appendLedgerEntry(
  tx: Tx, tenantId: string,
  v: {
    farmerId: string; entryType: LedgerRow['entryType']; amount: number; occurredOn: string;
    refType?: string | null; refId?: string | null; createdBy?: string | null;
  },
): Promise<LedgerRow> {
  const [last] = await tx.select({ b: mpFarmerLedger.balanceAfter }).from(mpFarmerLedger)
    .where(and(eq(mpFarmerLedger.tenantId, tenantId), eq(mpFarmerLedger.farmerId, v.farmerId)))
    .orderBy(desc(mpFarmerLedger.createdAt)).limit(1);
  const prev = last ? Number(last.b) : 0;
  const owed = v.entryType === 'advance_given' || v.entryType === 'feed_loan_given' || v.entryType === 'farmer_sale';
  const [row] = await tx.insert(mpFarmerLedger).values({
    tenantId,
    farmerId: v.farmerId,
    entryType: v.entryType,
    amount: String(v.amount),
    balanceAfter: String(round2(prev + (owed ? v.amount : -v.amount))),
    refType: v.refType ?? null,
    refId: v.refId ?? null,
    occurredOn: v.occurredOn,
    createdBy: v.createdBy ?? null,
  }).returning();
  return row!;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

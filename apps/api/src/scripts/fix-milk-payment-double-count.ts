/**
 * Undo milk payouts booked twice. A paid VMCC bill / farmer payout line
 * already posted Dr Farmer Payable / Cr Bank; the same NEFT, imported from
 * the bank statement, was then categorized as a direct expense (Dr 5001 /
 * Cr Bank). Expense and bank were both hit twice (~₹10L a month Jul–Oct 2026).
 *
 * For each such bank debit: delete its bank_debit JE (the house re-categorize
 * path, CategorizePostingService.resetCategorizePosting) and link the line to
 * the settlement JE via MpSettlementMatchService. Matching is ±₹1 / ±5 days,
 * same-vendor first, otherwise only an unambiguous single candidate.
 * Re-runnable: linked settlements drop out of the pool.
 *
 * Run dry:   tsx --env-file=../../.env src/scripts/fix-milk-payment-double-count.ts
 * Run apply: tsx --env-file=../../.env src/scripts/fix-milk-payment-double-count.ts --apply
 */

import { sql } from 'drizzle-orm';
import { createDb } from '@runq/db';
import { CategorizePostingService } from '../modules/banking/categorize-posting.service';
import { MpSettlementMatchService, type BankDebit } from '../modules/banking/mp-settlement-match.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const SUSPENSE_CODE = '1116';

interface PostedDebit extends BankDebit { accountCode: string }

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);
  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');

  const matcher = new MpSettlementMatchService(db, TENANT_ID);
  const posting = new CategorizePostingService(db, TENANT_ID);
  const settlements = await matcher.loadUnlinked();
  const debits = await loadDirectlyPostedDebits(db);
  console.log(`${settlements.length} unlinked milk settlements, ${debits.length} directly-posted bank debits`);

  const used = new Set<string>();
  const byMonth = new Map<string, number>();
  for (const txn of debits) {
    const s = matcher.pick(txn, settlements, used);
    if (!s) continue;
    used.add(s.id);
    const month = txn.transactionDate.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + parseFloat(txn.amount));
    console.log(`${txn.transactionDate} ₹${txn.amount} (${txn.accountCode}) → ${s.kind} ${s.id} ₹${s.amount} ${s.date}`);
    if (!apply) continue;
    await posting.resetCategorizePosting('debit', txn.id);
    await matcher.link(txn.id, s);
  }

  console.log('\nDuplicate expense removed by month:');
  for (const [m, amt] of [...byMonth].sort()) console.log(`  ${m}  ₹${amt.toFixed(2)}`);
  console.log(`Total pairs: ${used.size}${apply ? ' — applied' : ' — dry run, re-run with --apply'}`);
  await pool.end();
}

/** Bank debits whose own bank_debit JE expensed them (or parked them in suspense). */
async function loadDirectlyPostedDebits(db: ReturnType<typeof createDb>['db']): Promise<PostedDebit[]> {
  const res = await db.execute(sql`
    SELECT bt.id, bt.amount::text, bt.transaction_date::text AS transaction_date, bt.vendor_id, a.code
    FROM bank_transactions bt
    JOIN journal_entries j ON j.id = bt.journal_entry_id AND j.source_type = 'bank_debit' AND j.source_id = bt.id
    JOIN journal_lines jl ON jl.journal_entry_id = j.id AND jl.debit > 0
    JOIN accounts a ON a.id = jl.account_id AND (a.type = 'expense' OR a.code = ${SUSPENSE_CODE})
    WHERE bt.tenant_id = ${TENANT_ID} AND bt.type = 'debit'
    ORDER BY bt.transaction_date, bt.id
  `);
  const rows = (res as { rows?: Record<string, string | null>[] }).rows ?? [];
  return rows.map((r) => ({
    id: r.id!, amount: r.amount!, transactionDate: r.transaction_date!, vendorId: r.vendor_id, accountCode: r.code!,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

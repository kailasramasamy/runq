/**
 * Undo salary booked twice. The payroll run expenses the month's salary
 * (Dr 5201 / Cr 2110 Salary Payable) and each salary transfer HR marks
 * settles 2110 against the bank. The same NEFT, imported from the bank
 * statement, was then categorized as salary again (Dr 5201 / Cr Bank) —
 * the Sep 2026 run's October payouts, ~₹90K.
 *
 * For each such bank debit: delete its bank_debit JE (the house re-categorize
 * path) and link the line to its transfer via PayrollSettlementMatchService —
 * by UTR, else employee name + amount. Where the bank sent a different amount
 * than HR recorded, the transfer is re-posted at the bank figure and the rest
 * stays pending. A debit already booked as salary (5201) may also short-pay a
 * still-pending transfer. Re-runnable: linked transfers drop out of the pool.
 *
 * Run dry:   tsx --env-file=../../.env src/scripts/fix-payroll-payment-double-count.ts
 * Run apply: tsx --env-file=../../.env src/scripts/fix-payroll-payment-double-count.ts --apply
 */

import { sql } from 'drizzle-orm';
import { createDb } from '@runq/db';
import { CategorizePostingService } from '../modules/banking/categorize-posting.service';
import {
  PayrollSettlementMatchService, type SalaryDebit, type SalaryMatch, type SalaryTransfer,
} from '../modules/banking/payroll-settlement-match.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const SALARY_CODE = '5201';

interface PostedDebit extends SalaryDebit { bankAccountId: string; accountCode: string }

/** A salary debit for less than a pending transfer: the employee was paid short. */
function pickShortPaid(txn: PostedDebit, pool: SalaryTransfer[], used: Set<string>): SalaryMatch | null {
  if (txn.accountCode !== SALARY_CODE) return null;
  const amount = parseFloat(txn.amount);
  const named = (txn.narration ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const candidates = pool.filter((t) => !used.has(t.id) && t.status === 'pending' && amount < t.amount
    && txn.transactionDate >= t.payableFrom && t.names.some((n) => named.includes(n)));
  return candidates.length === 1 ? { transfer: candidates[0]!, byUtr: false } : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);
  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');

  const matcher = new PayrollSettlementMatchService(db, TENANT_ID);
  const posting = new CategorizePostingService(db, TENANT_ID);
  const transfers = await matcher.loadOpen();
  const debits = await loadSalaryPostedDebits(db);
  console.log(`${transfers.length} open salary transfers, ${debits.length} bank debits booked to payroll`);

  const used = new Set<string>();
  let total = 0;
  for (const txn of debits) {
    const m = matcher.pick(txn, txn.bankAccountId, transfers, used) ?? pickShortPaid(txn, transfers, used);
    if (!m) continue;
    used.add(m.transfer.id);
    total += parseFloat(txn.amount);
    const how = m.byUtr ? 'UTR' : 'name+amount';
    const diff = Math.abs(m.transfer.amount - parseFloat(txn.amount)) >= 1
      ? ` — re-post at bank amount, ₹${(m.transfer.amount - parseFloat(txn.amount)).toFixed(2)} stays pending` : '';
    console.log(`${txn.transactionDate} ₹${txn.amount} (${txn.accountCode}) → ${m.transfer.status} transfer ₹${m.transfer.amount} [${how}]${diff}`);
    if (!apply) continue;
    await posting.resetCategorizePosting('debit', txn.id);
    await matcher.link(txn, txn.bankAccountId, m);
  }

  console.log(`\nDuplicate salary expense removed: ₹${total.toFixed(2)} across ${used.size} debits${apply ? ' — applied' : ' — dry run, re-run with --apply'}`);
  await pool.end();
}

/** Bank debits whose own bank_debit JE expensed them to a payroll (52xx) account. */
async function loadSalaryPostedDebits(db: ReturnType<typeof createDb>['db']): Promise<PostedDebit[]> {
  const res = await db.execute(sql`
    SELECT bt.id, bt.amount::text, bt.transaction_date::text AS transaction_date, bt.narration,
           bt.bank_account_id, a.code
    FROM bank_transactions bt
    JOIN journal_entries j ON j.id = bt.journal_entry_id AND j.source_type = 'bank_debit' AND j.source_id = bt.id
    JOIN journal_lines jl ON jl.journal_entry_id = j.id AND jl.debit > 0
    JOIN accounts a ON a.id = jl.account_id AND a.code LIKE '52%'
    WHERE bt.tenant_id = ${TENANT_ID} AND bt.type = 'debit'
    ORDER BY bt.transaction_date, bt.id
  `);
  const rows = (res as { rows?: Record<string, string | null>[] }).rows ?? [];
  return rows.map((r) => ({
    id: r.id!, amount: r.amount!, transactionDate: r.transaction_date!, narration: r.narration,
    bankAccountId: r.bank_account_id!, accountCode: r.code!,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

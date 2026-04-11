/**
 * One-shot backfill: create journal entries for already-categorized bank
 * transactions that don't have a linked JE yet. Idempotent — safe to re-run.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/backfill-bank-debit-jes.ts
 */

import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { createDb, bankTransactions, bankAccounts, accounts } from '@runq/db';
import { CategorizePostingService } from '../modules/banking/categorize-posting.service';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  // Find all categorized transactions without a JE
  const rows = await db
    .select({
      id: bankTransactions.id,
      tenantId: bankTransactions.tenantId,
      type: bankTransactions.type,
      bankAccountId: bankTransactions.bankAccountId,
      transactionDate: bankTransactions.transactionDate,
      amount: bankTransactions.amount,
      narration: bankTransactions.narration,
      glAccountId: bankTransactions.glAccountId,
    })
    .from(bankTransactions)
    .where(and(
      isNotNull(bankTransactions.glAccountId),
      isNull(bankTransactions.journalEntryId),
    ));

  console.log(`Found ${rows.length} categorized transactions without JEs`);

  let posted = 0;
  let skipped = 0;

  for (const row of rows) {
    const [glAccount] = await db
      .select({ code: accounts.code })
      .from(accounts)
      .where(eq(accounts.id, row.glAccountId!))
      .limit(1);

    const [bankGl] = await db
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
      .where(eq(bankAccounts.id, row.bankAccountId))
      .limit(1);

    if (!glAccount || !bankGl) {
      console.log(`  SKIP ${row.id} — missing GL mapping`);
      skipped++;
      continue;
    }

    const posting = new CategorizePostingService(db, row.tenantId);
    const params = {
      transactionId: row.id,
      transactionDate: row.transactionDate,
      amount: parseFloat(row.amount),
      narration: row.narration,
      glAccountCode: glAccount.code,
      bankGlAccountCode: bankGl.code,
    };

    const jeId = row.type === 'debit'
      ? await posting.postBankDebit(params)
      : await posting.postBankCredit(params);

    if (jeId) {
      posted++;
      console.log(`  OK  [${row.type}] ${row.narration?.slice(0, 50)} → ${glAccount.code} (${jeId})`);
    } else {
      skipped++;
      console.log(`  SKIP ${row.id} — already posted`);
    }
  }

  console.log(`\nDone: ${posted} JEs created, ${skipped} skipped`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

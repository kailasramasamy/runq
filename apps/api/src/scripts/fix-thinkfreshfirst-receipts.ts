/**
 * One-shot remediation for Think FreshFirst Technologies Pvt Ltd.
 *
 * Same duplicate-JE pattern as Freshalicious, but narrower: 2 of the 3
 * bank credits (both Apr-09) have a `bank_credit` JE from categorize-
 * posting plus a later `receipt` JE from the Apr-13 backfill. Both JEs
 * post DR Cash / CR AR, so AR is over-credited and Cash over-debited
 * by ₹85,615.00 in total.
 *
 * Unlike Freshalicious, the receipts + allocations are correct (OB-TFTP-
 * 2526 was created on Apr-12, before the Apr-13 backfill, and got
 * properly allocated). So we only need to reverse the 2 duplicate
 * bank_credit JEs and clear the stale journal_entry_id on the 2 bank
 * txns. Receipts, recon matches, and invoice statuses stay intact.
 *
 * Run dry: tsx src/scripts/fix-thinkfreshfirst-receipts.ts
 * Run apply: tsx src/scripts/fix-thinkfreshfirst-receipts.ts --apply
 */

import { eq, and, inArray } from 'drizzle-orm';
import {
  createDb,
  bankTransactions,
  journalEntries,
  auditLog,
} from '@runq/db';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';

// The 2 Apr-09 bank txns with duplicate JEs (the Apr-20 txn is clean).
const TXN_IDS = [
  'da7e31f9-f71c-495c-87d7-98a8aa4ac14a', // 2026-04-09 ₹2,722.00
  '9f543fea-8f84-4657-a44d-3da4b4fc5912', // 2026-04-09 ₹82,893.00
];

const REMEDIATION_NOTE =
  'Reversed by fix-thinkfreshfirst-receipts.ts on 2026-04-29. Duplicate ' +
  'bank_credit JE — categorize-posting first posted DR Cash / CR AR, then ' +
  'a Apr-13 backfill turned the bank txn into a receipt and posted DR Cash / ' +
  'CR AR a second time via the receipt JE. Receipts and allocations ' +
  '(including OB-TFTP-2526) are already correct, so only the duplicate ' +
  'bank_credit JE is reversed and the stale journal_entry_id on the bank ' +
  'txn is cleared. Net effect: AR over-credit of ₹85,615.00 unwound.';

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');

  const dupJes = await db
    .select({ id: journalEntries.id, sourceId: journalEntries.sourceId, totalDebit: journalEntries.totalDebit })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.tenantId, TENANT_ID),
      eq(journalEntries.sourceType, 'bank_credit'),
      eq(journalEntries.status, 'posted'),
      inArray(journalEntries.sourceId, TXN_IDS),
    ));

  console.log(`\nDuplicate bank_credit JEs to reverse: ${dupJes.length}`);
  for (const je of dupJes) {
    console.log(`  ${je.id}  ₹${je.totalDebit}  on bank txn ${je.sourceId}`);
  }

  if (!apply) {
    console.log('\nRe-run with --apply to execute.');
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(journalEntries)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(and(
        eq(journalEntries.tenantId, TENANT_ID),
        inArray(journalEntries.id, dupJes.map((j) => j.id)),
      ));

    await tx
      .update(bankTransactions)
      .set({ journalEntryId: null, updatedAt: new Date() })
      .where(and(
        eq(bankTransactions.tenantId, TENANT_ID),
        inArray(bankTransactions.id, TXN_IDS),
      ));

    for (const je of dupJes) {
      await tx.insert(auditLog).values({
        tenantId: TENANT_ID,
        action: 'reversed',
        entityType: 'journal_entry',
        entityId: je.id,
        metadata: { reason: REMEDIATION_NOTE, bankTransactionId: je.sourceId, duplicateOf: 'receipt' },
      });
    }
    for (const txnId of TXN_IDS) {
      await tx.insert(auditLog).values({
        tenantId: TENANT_ID,
        action: 'remediated',
        entityType: 'bank_transaction',
        entityId: txnId,
        metadata: { details: REMEDIATION_NOTE },
      });
    }
  });

  console.log('\n✅ Done.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

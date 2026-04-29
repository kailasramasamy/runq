/**
 * Backfill audit_log entries for the BB Daily / BB Now remediation done by
 * fix-bb-misposted-receipts.ts. The script ran direct DB updates and called
 * AutoReceiptService (which at the time did not write audit logs), so the
 * paper trail is missing. This adds two entries per affected bank txn:
 *
 *   - one `je_reversed` entry on the original bank_credit JE
 *   - one `auto_created_from_bank_txn` entry on the new payment_receipt
 *
 * Run: tsx src/scripts/backfill-bb-audit-trail.ts
 *
 * Idempotent: skips entries that already exist for the same entity + action.
 */

import { eq, and, inArray } from 'drizzle-orm';
import {
  createDb,
  bankTransactions,
  journalEntries,
  paymentReceipts,
  receiptAllocations,
  reconciliationMatches,
  auditLog,
} from '@runq/db';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';

const TXN_IDS = [
  'ec75b247-05fb-49eb-a480-20f8bf456601',
  'baead7bb-6384-4dd6-a439-5495b8a6182f',
  '8b3b1272-132d-4d9b-807d-86e5efa82314',
  'f672fa90-ff7a-4214-9120-a773a65eb1f1',
  'e42d834c-e28e-4c4e-9013-65091144861e',
  '16a25dfd-f3f5-436d-919e-dc082d142d0b',
  '668bbded-61f7-4c41-8fc4-93d12b030fc9',
  '177deb08-604a-406f-9235-74439367de39',
  'ea6fcdca-a6e5-4e7f-9360-bc039b969c05',
  '16612aa3-4e29-481c-b1c2-6979863f1601',
  '006ea61a-0b7e-4546-aa4c-b2255dd57188',
  '8f8ae84b-d354-42cc-b207-f9a47eb005ca',
  'ce09fd83-23d2-4ef1-8027-519e4c799653',
  '4113b297-61d9-4fd3-a460-17a72c907532',
];

const REMEDIATION_NOTE =
  'Remediated by fix-bb-misposted-receipts.ts on 2026-04-29. ' +
  'Original JE wrongly credited Sales Revenue (4001) instead of AR (1103) ' +
  'because a learned narration rule mismapped the customer. ' +
  'Bad rule deleted; receipt + allocations created via AutoReceiptService.';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  // Reversed bank_credit JEs (the original wrong ones)
  const reversedJes = await db
    .select({ id: journalEntries.id, sourceId: journalEntries.sourceId })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.tenantId, TENANT_ID),
      eq(journalEntries.sourceType, 'bank_credit'),
      eq(journalEntries.status, 'reversed'),
      inArray(journalEntries.sourceId, TXN_IDS),
    ));

  // New receipts linked to those bank txns via reconciliation_matches
  const matches = await db
    .select({
      bankTxnId: reconciliationMatches.bankTransactionId,
      receiptId: reconciliationMatches.receiptId,
    })
    .from(reconciliationMatches)
    .where(and(
      eq(reconciliationMatches.tenantId, TENANT_ID),
      inArray(reconciliationMatches.bankTransactionId, TXN_IDS),
    ));

  console.log(`Reversed JEs: ${reversedJes.length}, recon matches: ${matches.length}`);

  let inserted = 0;
  let skipped = 0;

  for (const je of reversedJes) {
    const existing = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenantId, TENANT_ID),
        eq(auditLog.entityType, 'journal_entry'),
        eq(auditLog.entityId, je.id),
        eq(auditLog.action, 'reversed'),
      ))
      .limit(1);
    if (existing.length > 0) { skipped++; continue; }

    await db.insert(auditLog).values({
      tenantId: TENANT_ID,
      action: 'reversed',
      entityType: 'journal_entry',
      entityId: je.id,
      metadata: { reason: REMEDIATION_NOTE, bankTransactionId: je.sourceId },
    });
    inserted++;
  }

  for (const m of matches) {
    if (!m.receiptId) continue;
    const existing = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenantId, TENANT_ID),
        eq(auditLog.entityType, 'payment_receipt'),
        eq(auditLog.entityId, m.receiptId),
        eq(auditLog.action, 'auto_created_from_bank_txn'),
      ))
      .limit(1);
    if (existing.length > 0) { skipped++; continue; }

    const [receipt] = await db
      .select({
        amount: paymentReceipts.amount,
        customerId: paymentReceipts.customerId,
      })
      .from(paymentReceipts)
      .where(eq(paymentReceipts.id, m.receiptId))
      .limit(1);
    const allocs = await db
      .select({ invoiceId: receiptAllocations.invoiceId, amount: receiptAllocations.amount })
      .from(receiptAllocations)
      .where(eq(receiptAllocations.receiptId, m.receiptId));

    await db.insert(auditLog).values({
      tenantId: TENANT_ID,
      action: 'auto_created_from_bank_txn',
      entityType: 'payment_receipt',
      entityId: m.receiptId,
      metadata: {
        bankTransactionId: m.bankTxnId,
        customerId: receipt?.customerId,
        amount: receipt?.amount,
        allocations: allocs,
        backfilledBy: REMEDIATION_NOTE,
      },
    });
    inserted++;
  }

  // Also leave a single bank_transaction-level breadcrumb so the UI's audit
  // trail panel for each txn shows what happened.
  for (const txnId of TXN_IDS) {
    const existing = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.tenantId, TENANT_ID),
        eq(auditLog.entityType, 'bank_transaction'),
        eq(auditLog.entityId, txnId),
        eq(auditLog.action, 'remediated'),
      ))
      .limit(1);
    if (existing.length > 0) { skipped++; continue; }

    const [txn] = await db
      .select({
        amount: bankTransactions.amount,
        customerId: bankTransactions.customerId,
      })
      .from(bankTransactions)
      .where(eq(bankTransactions.id, txnId))
      .limit(1);

    await db.insert(auditLog).values({
      tenantId: TENANT_ID,
      action: 'remediated',
      entityType: 'bank_transaction',
      entityId: txnId,
      metadata: {
        amount: txn?.amount,
        customerId: txn?.customerId,
        details: REMEDIATION_NOTE,
      },
    });
    inserted++;
  }

  console.log(`✅ Inserted ${inserted} audit_log entries (skipped ${skipped} duplicates).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-shot remediation for "Innovative Retail Concepts" mis-posted bank credits.
 *
 * Background: a learned narration rule mapped INNOVATIVE RETAIL CONCEPTS P
 * → GL 4001 (Sales Revenue). The categorize-posting flow then posted every
 * credit from this customer pair as DR Cash / CR Sales Revenue, double-
 * counting revenue and never reducing AR. 14 txns affected (₹77,935.61).
 *
 * This script (in a single transaction):
 *   1. Marks the 14 wrong JEs as `reversed`.
 *   2. Resets the 14 bank txns to unreconciled with no customer/GL/JE link.
 *   3. Deletes the bad narration rule.
 *   4. Retags 13 txns to BB Daily, 1 (Apr-17 ₹3,420.43) to BB Now.
 *   5. Calls AutoReceiptService oldest-first for each, so the OB invoice
 *      clears first then payments waterfall to subsequent invoices.
 *
 * Run dry: tsx src/scripts/fix-bb-misposted-receipts.ts
 * Run apply: tsx src/scripts/fix-bb-misposted-receipts.ts --apply
 */

import { eq, and, inArray } from 'drizzle-orm';
import {
  createDb,
  bankTransactions,
  bankAccounts,
  accounts,
  journalEntries,
  bankNarrationRules,
} from '@runq/db';
import { AutoReceiptService } from '../modules/banking/auto-receipt.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const BB_DAILY = '2e550dd0-bbcf-488b-a9c0-bd91d506e07c';
const BB_NOW = 'b6b8bb9b-5106-4254-a45e-9850f226272c';
const BAD_RULE_ID = '375d686c-29b0-4b04-b416-4b8cd55aacb4';

// The single Apr-17 txn that genuinely belongs to BB Now per the user.
const BB_NOW_TXN_ID = '006ea61a-0b7e-4546-aa4c-b2255dd57188';

// All 14 affected bank txn IDs (date-ordered, oldest first).
const ALL_TXN_IDS = [
  'ec75b247-05fb-49eb-a480-20f8bf456601', // 2026-04-06 6,838.40
  'baead7bb-6384-4dd6-a439-5495b8a6182f', // 2026-04-07 10,819.57
  '8b3b1272-132d-4d9b-807d-86e5efa82314', // 2026-04-08 1,998.80
  'f672fa90-ff7a-4214-9120-a773a65eb1f1', // 2026-04-09 12,939.72
  'e42d834c-e28e-4c4e-9013-65091144861e', // 2026-04-10 1,963.64
  '16a25dfd-f3f5-436d-919e-dc082d142d0b', // 2026-04-13 8,071.94
  '668bbded-61f7-4c41-8fc4-93d12b030fc9', // 2026-04-14 6,681.22
  '177deb08-604a-406f-9235-74439367de39', // 2026-04-15 1,933.27
  'ea6fcdca-a6e5-4e7f-9360-bc039b969c05', // 2026-04-16 1,740.65
  '16612aa3-4e29-481c-b1c2-6979863f1601', // 2026-04-17 6,454.30
  '006ea61a-0b7e-4546-aa4c-b2255dd57188', // 2026-04-17 3,420.43 (BB Now)
  '8f8ae84b-d354-42cc-b207-f9a47eb005ca', // 2026-04-18 2,547.06
  'ce09fd83-23d2-4ef1-8027-519e4c799653', // 2026-04-20 11,099.24
  '4113b297-61d9-4fd3-a460-17a72c907532', // 2026-04-20 1,427.37
];

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');
  console.log('---');

  // 1. Load all 14 bank txns with their JE + bank GL info
  const txns = await db
    .select({
      id: bankTransactions.id,
      transactionDate: bankTransactions.transactionDate,
      amount: bankTransactions.amount,
      narration: bankTransactions.narration,
      reference: bankTransactions.reference,
      bankAccountId: bankTransactions.bankAccountId,
      journalEntryId: bankTransactions.journalEntryId,
      customerId: bankTransactions.customerId,
    })
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.tenantId, TENANT_ID),
      inArray(bankTransactions.id, ALL_TXN_IDS),
    ));

  if (txns.length !== ALL_TXN_IDS.length) {
    console.error(`Expected ${ALL_TXN_IDS.length} txns, got ${txns.length}. Aborting.`);
    process.exit(1);
  }

  const jeIds = txns.map((t) => t.journalEntryId).filter((id): id is string => !!id);
  console.log(`Found ${txns.length} bank txns, ${jeIds.length} linked JEs.`);

  // Sort oldest-first for waterfall
  txns.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  // 2. Resolve bank GL code (cache by bankAccountId)
  const bankGlByAccount = new Map<string, string>();
  for (const t of txns) {
    if (bankGlByAccount.has(t.bankAccountId)) continue;
    const [row] = await db
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
      .where(and(eq(bankAccounts.id, t.bankAccountId), eq(bankAccounts.tenantId, TENANT_ID)))
      .limit(1);
    if (!row) throw new Error(`Bank GL missing for account ${t.bankAccountId}`);
    bankGlByAccount.set(t.bankAccountId, row.code);
  }

  if (!apply) {
    console.log('\nWould reverse JEs:', jeIds);
    console.log('Would delete narration rule:', BAD_RULE_ID);
    console.log('\nWould retag and run AutoReceiptService for:');
    for (const t of txns) {
      const targetCustomer = t.id === BB_NOW_TXN_ID ? 'BB Now' : 'BB Daily';
      console.log(`  ${t.transactionDate}  ₹${t.amount.padStart(10)}  → ${targetCustomer}`);
    }
    console.log('\nRe-run with --apply to execute.');
    await pool.end();
    return;
  }

  // 3. Apply: reverse JEs + clear bank txns + delete bad rule (single tx)
  await db.transaction(async (tx) => {
    if (jeIds.length > 0) {
      await tx
        .update(journalEntries)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(and(
          eq(journalEntries.tenantId, TENANT_ID),
          inArray(journalEntries.id, jeIds),
        ));
    }
    await tx
      .update(bankTransactions)
      .set({
        customerId: null,
        vendorId: null,
        glAccountId: null,
        journalEntryId: null,
        reconStatus: 'unreconciled',
        updatedAt: new Date(),
      })
      .where(and(
        eq(bankTransactions.tenantId, TENANT_ID),
        inArray(bankTransactions.id, ALL_TXN_IDS),
      ));
    await tx
      .delete(bankNarrationRules)
      .where(and(
        eq(bankNarrationRules.tenantId, TENANT_ID),
        eq(bankNarrationRules.id, BAD_RULE_ID),
      ));
  });
  console.log('✅ Phase 1 done: JEs reversed, txns reset, bad rule deleted.');

  // 4. Retag + run AutoReceiptService oldest-first
  const autoReceipt = new AutoReceiptService(db, TENANT_ID);
  for (const t of txns) {
    const customerId = t.id === BB_NOW_TXN_ID ? BB_NOW : BB_DAILY;
    const customerName =
      t.id === BB_NOW_TXN_ID
        ? 'Innovative Retail Concepts Private Limited - BB Now'
        : 'Innovative Retail Concepts Private Limited - BB Daily';
    const bankGlAccountCode = bankGlByAccount.get(t.bankAccountId)!;

    await db
      .update(bankTransactions)
      .set({ customerId, updatedAt: new Date() })
      .where(eq(bankTransactions.id, t.id));

    const result = await autoReceipt.createFromBankTxn({
      bankTransactionId: t.id,
      customerId,
      customerName,
      bankAccountId: t.bankAccountId,
      bankGlAccountCode,
      amount: parseFloat(t.amount),
      transactionDate: t.transactionDate,
      narration: t.narration,
      reference: t.reference,
    });

    const tag = customerId === BB_NOW ? 'BB Now ' : 'BB Daily';
    console.log(
      `  ${t.transactionDate}  ₹${t.amount.padStart(10)}  ${tag}  →  ` +
        (result
          ? `receipt ${result.receiptId.slice(0, 8)}, ${result.allocations.length} allocs, ₹${result.unallocated} unallocated`
          : 'tagged-only (no open invoices or linked existing)'),
    );
  }

  console.log('\n✅ Phase 2 done.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

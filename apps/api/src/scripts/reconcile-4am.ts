/**
 * One-off reconciliation script — 4am (Think FreshFirst Technologies Pvt Ltd)
 * vs Vrindavan Dairy LLP, surfaced by the May reconciliation pass.
 *
 * Plan: docs/gst-amendment-plan.md Phase 6
 * Tracker: docs/gst-amendment-tracker.md Phase 6
 *
 * Eight discrepancies; this script handles seven (260047 is a clerical fix
 * on the customer's side, no runq change). All fixes are dated 2026-05-31
 * (May issue date) so they flow into May GSTR-1 naturally. Original invoice
 * date is preserved in amends_invoice_* on each CN/DN, and 260142 keeps
 * its true April invoice_date so the GSTR-1 generator picks it up as a
 * Table 9A (b2ba) missed-invoice amendment.
 *
 * Usage:
 *   # Dry-run (default): logs what would happen, no DB writes.
 *   pnpm --filter @runq/api exec tsx src/scripts/reconcile-4am.ts
 *
 *   # Live execution:
 *   RECONCILE_LIVE=1 pnpm --filter @runq/api exec tsx src/scripts/reconcile-4am.ts
 */
import { createDb } from '@runq/db';
import { sql } from 'drizzle-orm';
import { CreditNoteService } from '../modules/ar/credit-note.service';
import { CustomerDebitNoteService } from '../modules/ar/customer-debit-note.service';
import { InvoiceService } from '../modules/ar/invoice.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';     // Vrindavan Dairy LLP
const CUSTOMER_ID = '22a2b7da-2adf-484d-8496-962897132d30';   // Think FreshFirst Technologies Pvt Ltd
const ISSUE_DATE = '2026-05-31';                              // All May-issued
const LIVE = process.env.RECONCILE_LIVE === '1';

// Karnataka intra-state for both tenant + customer (POS 29). Most line items
// on the original 4am invoices are 0% (milk, HSN 04012000). Reconciliation
// CNs / DNs are issued at 0% as quantity/price adjustments on the milk
// portion — matches the dominant SKU mix on the source invoices.
const HSN_MILK = '04012000';
const POS_CODE = '29';
const POS_NAME = 'Karnataka';

interface Fix {
  kind: 'cn' | 'dn' | 'void' | 'missed-invoice';
  label: string;
  invoiceNumber: string;
  invoiceDate?: string;
  amount: number;
  reason: string;
}

const FIXES: Fix[] = [
  // Customer paid LESS than runq invoice → issue CN
  { kind: 'cn', label: 'CN — 260130 short pay reconciliation', invoiceNumber: '260130', invoiceDate: '2026-04-19', amount: 144.00, reason: 'Reconciliation against 4am payment file — short pay of ₹144 on supply' },
  { kind: 'cn', label: 'CN — 260207 short pay reconciliation', invoiceNumber: '260207', invoiceDate: '2026-04-30', amount:  64.50, reason: 'Reconciliation against 4am payment file — short pay of ₹64.50 on supply' },
  { kind: 'cn', label: 'CN — 260373 short pay reconciliation', invoiceNumber: '260373', invoiceDate: '2026-05-19', amount: 211.43, reason: 'Reconciliation against 4am payment file — short pay of ₹211.43 on supply' },

  // Customer paid MORE than runq invoice → issue customer debit note
  { kind: 'dn', label: 'DN — 260067 under-billed adjustment', invoiceNumber: '260067', invoiceDate: '2026-04-10', amount:  55.09, reason: 'Reconciliation against 4am payment file — under-billed by ₹55.09 on supply' },
  { kind: 'dn', label: 'DN — 260253 under-billed adjustment', invoiceNumber: '260253', invoiceDate: '2026-05-02', amount:  54.00, reason: 'Reconciliation against 4am payment file — under-billed by ₹54 on supply' },

  // Invoice raised in runq, NOT paid by 4am — likely duplicate / invalid → void
  { kind: 'void', label: 'VOID — 260291 not invoiced to customer', invoiceNumber: '260291', invoiceDate: '2026-05-07', amount: 1840.49, reason: 'Reconciliation against 4am payment file — invoice was not actually supplied' },

  // Invoice supplied to customer but missing from runq → create with original April date
  { kind: 'missed-invoice', label: 'NEW — 260142 missed invoice', invoiceNumber: '260142', invoiceDate: '2026-04-22', amount: 14570.00, reason: 'Reconciliation: invoice supplied to 4am but missed in runq book' },
];

async function main(): Promise<void> {
  const { db } = createDb(process.env.DATABASE_URL!);

  // RLS: scope all subsequent queries to this tenant. SET doesn't accept
  // bind parameters, so use sql.raw for the value.
  await db.execute(sql.raw(`SET app.current_tenant_id = '${TENANT_ID}'`));

  console.log('━'.repeat(70));
  console.log(`4am reconciliation — ${LIVE ? '🔴 LIVE' : '🟢 DRY-RUN'}`);
  console.log(`Tenant:    Vrindavan Dairy LLP (${TENANT_ID})`);
  console.log(`Customer:  Think FreshFirst (${CUSTOMER_ID})`);
  console.log(`Issue dt:  ${ISSUE_DATE}`);
  console.log('━'.repeat(70));

  for (const fix of FIXES) {
    console.log(`\n→ ${fix.label} (₹${fix.amount.toFixed(2)})`);
    if (!LIVE) {
      console.log('  [dry-run] skipped');
      continue;
    }
    try {
      const result = await applyFix(db, fix);
      console.log(`  ✓ ${result}`);
    } catch (err) {
      console.error(`  ✗ FAILED: ${(err as Error).message}`);
      console.error('  Stopping — review state before re-running.');
      process.exit(1);
    }
  }

  console.log('\n━'.repeat(70));
  console.log(LIVE ? '✅ Reconciliation complete.' : 'Dry-run complete. Set RECONCILE_LIVE=1 to execute.');
  console.log('Next: regenerate May GSTR-1 preview and verify Table 9A/9B contents.');
}

async function applyFix(db: ReturnType<typeof createDb>['db'], fix: Fix): Promise<string> {
  switch (fix.kind) {
    case 'cn':       return doCreditNote(db, fix);
    case 'dn':       return doCustomerDebitNote(db, fix);
    case 'void':     return doVoid(db, fix);
    case 'missed-invoice': return doMissedInvoice(db, fix);
  }
}

async function findInvoiceId(db: ReturnType<typeof createDb>['db'], invoiceNumber: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT id FROM sales_invoices
    WHERE tenant_id = ${TENANT_ID}
      AND customer_id = ${CUSTOMER_ID}
      AND invoice_number = ${invoiceNumber}
    LIMIT 1
  `);
  // execute() returns a ResultLike; access .rows or treat as array per drizzle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (rows as any).rows?.[0] ?? (rows as any)[0];
  if (!row?.id) throw new Error(`Invoice ${invoiceNumber} not found`);
  return row.id as string;
}

async function doCreditNote(db: ReturnType<typeof createDb>['db'], fix: Fix): Promise<string> {
  const invoiceId = await findInvoiceId(db, fix.invoiceNumber);
  const cnService = new CreditNoteService(db, TENANT_ID);
  const draft = await cnService.create({
    customerId: CUSTOMER_ID,
    invoiceId,
    issueDate: ISSUE_DATE,
    reason: fix.reason,
    placeOfSupply: POS_NAME,
    placeOfSupplyCode: POS_CODE,
    isInterState: false,
    reverseCharge: false,
    // amends_invoice_* auto-populated from invoiceId
    items: [{
      itemId: null,
      description: `Sales adjustment — milk supply (HSN ${HSN_MILK})`,
      quantity: 1,
      unitPrice: fix.amount,
      amount: fix.amount,
      hsnSacCode: HSN_MILK,
      taxCategory: 'nil_rated',
      taxRate: 0,
      cgstRate: 0, cgstAmount: 0,
      sgstRate: 0, sgstAmount: 0,
      igstRate: 0, igstAmount: 0,
      cessRate: 0, cessAmount: 0,
      packSizeValue: 1,
    }],
  });
  await cnService.issue(draft.id);
  await cnService.applyToInvoice(draft.id, invoiceId);
  return `CN ${draft.creditNoteNumber} issued & applied (₹${fix.amount.toFixed(2)})`;
}

async function doCustomerDebitNote(db: ReturnType<typeof createDb>['db'], fix: Fix): Promise<string> {
  const invoiceId = await findInvoiceId(db, fix.invoiceNumber);
  const dnService = new CustomerDebitNoteService(db, TENANT_ID);
  const draft = await dnService.create({
    customerId: CUSTOMER_ID,
    invoiceId,
    issueDate: ISSUE_DATE,
    reason: fix.reason,
    placeOfSupply: POS_NAME,
    placeOfSupplyCode: POS_CODE,
    isInterState: false,
    reverseCharge: false,
    items: [{
      itemId: null,
      description: `Sales adjustment — milk supply (HSN ${HSN_MILK})`,
      quantity: 1,
      unitPrice: fix.amount,
      amount: fix.amount,
      hsnSacCode: HSN_MILK,
      taxCategory: 'nil_rated',
      taxRate: 0,
      cgstRate: 0, cgstAmount: 0,
      sgstRate: 0, sgstAmount: 0,
      igstRate: 0, igstAmount: 0,
      cessRate: 0, cessAmount: 0,
      packSizeValue: 1,
    }],
  });
  await dnService.issue(draft.id);
  await dnService.apply(draft.id);
  return `Customer DN ${draft.debitNoteNumber} issued & applied (₹${fix.amount.toFixed(2)})`;
}

async function doVoid(db: ReturnType<typeof createDb>['db'], fix: Fix): Promise<string> {
  const invoiceId = await findInvoiceId(db, fix.invoiceNumber);
  const svc = new InvoiceService(db, TENANT_ID);
  const result = await svc.voidInvoice(invoiceId, {
    reason: fix.reason,
    issueDate: ISSUE_DATE,
  });
  return `Invoice ${fix.invoiceNumber} voided; CN ${result.creditNoteId.slice(0, 8)}… issued (₹${fix.amount.toFixed(2)})`;
}

async function doMissedInvoice(db: ReturnType<typeof createDb>['db'], fix: Fix): Promise<string> {
  // Insert directly — InvoiceService.create() runs through validators and
  // numbering which would assign the next sequence number, not 260142.
  // The whole point of this fix is to preserve the original invoice number.
  await db.execute(sql`
    INSERT INTO sales_invoices (
      tenant_id, invoice_number, customer_id, invoice_date, due_date,
      subtotal, tax_amount, total_amount, amount_received, balance_due,
      status, place_of_supply, place_of_supply_code, is_inter_state,
      cgst_amount, sgst_amount, igst_amount, cess_amount, reverse_charge,
      notes
    ) VALUES (
      ${TENANT_ID}, ${fix.invoiceNumber}, ${CUSTOMER_ID},
      ${fix.invoiceDate!}, ${fix.invoiceDate!},
      ${fix.amount.toFixed(2)}, '0.00', ${fix.amount.toFixed(2)}, '0.00', ${fix.amount.toFixed(2)},
      'sent', ${POS_NAME}, ${POS_CODE}, false,
      '0.00', '0.00', '0.00', '0.00', false,
      ${'Back-dated reconciliation entry — supplied to 4am in April, missed in runq book. Will appear in May GSTR-1 as Table 9A amendment.'}
    )
  `);
  // Also insert a single line item so HSN aggregation in GSTR-1 works.
  await db.execute(sql`
    INSERT INTO sales_invoice_items (
      tenant_id, invoice_id, description, quantity, unit_price, amount,
      hsn_sac_code, tax_category, tax_rate,
      cgst_rate, cgst_amount, sgst_rate, sgst_amount,
      igst_rate, igst_amount, cess_rate, cess_amount,
      pack_size_value
    )
    SELECT
      ${TENANT_ID}, id, ${'Milk supply — April reconciliation entry'},
      '1', ${fix.amount.toFixed(2)}, ${fix.amount.toFixed(2)},
      ${HSN_MILK}, 'nil_rated', '0',
      '0', '0', '0', '0',
      '0', '0', '0', '0',
      '1'
    FROM sales_invoices
    WHERE tenant_id = ${TENANT_ID} AND invoice_number = ${fix.invoiceNumber}
  `);
  return `Invoice ${fix.invoiceNumber} created with original April date ${fix.invoiceDate} (₹${fix.amount.toFixed(2)})`;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

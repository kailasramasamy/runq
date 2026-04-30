/**
 * Create individual JEs for each OB invoice and bill.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/fix-ob-individual-jes.ts
 */
import { eq, and, sql } from 'drizzle-orm';
import { createDb, salesInvoices, purchaseInvoices, customers, vendors } from '@runq/db';
import { GLService } from '../modules/gl/gl.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const gl = new GLService(db, TENANT_ID);
  let created = 0;

  // OB Invoices → DR 1103 AR, CR 3002 Retained Earnings
  const obInvoices = await db.select({
    id: salesInvoices.id, num: salesInvoices.invoiceNumber,
    amt: salesInvoices.totalAmount, date: salesInvoices.invoiceDate,
    custName: customers.name,
  }).from(salesInvoices)
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(and(eq(salesInvoices.tenantId, TENANT_ID), sql`${salesInvoices.invoiceNumber} LIKE 'OB-%'`));

  for (const inv of obInvoices) {
    const amt = parseFloat(inv.amt);
    try {
      await gl.createJournalEntry({
        date: inv.date,
        description: `Opening balance: ${inv.custName}`,
        sourceType: 'opening_balance_ar',
        sourceId: inv.id,
        lines: [
          { accountCode: '1103', debit: amt },
          { accountCode: '3002', credit: amt },
        ],
      });
      created++;
      console.log(`  OK AR  ${inv.num} — ${inv.custName} — ₹${inv.amt}`);
    } catch (e) {
      console.log(`  SKIP AR ${inv.num} — ${(e as Error).message}`);
    }
  }

  // OB Bills → DR 3002 Retained Earnings, CR 2101 AP
  const obBills = await db.select({
    id: purchaseInvoices.id, num: purchaseInvoices.invoiceNumber,
    amt: purchaseInvoices.totalAmount, date: purchaseInvoices.invoiceDate,
    vendName: vendors.name,
  }).from(purchaseInvoices)
    .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
    .where(and(eq(purchaseInvoices.tenantId, TENANT_ID), sql`${purchaseInvoices.invoiceNumber} LIKE 'OB-%'`));

  for (const bill of obBills) {
    const amt = parseFloat(bill.amt);
    try {
      await gl.createJournalEntry({
        date: bill.date,
        description: `Opening balance: ${bill.vendName}`,
        sourceType: 'opening_balance_ap',
        sourceId: bill.id,
        lines: [
          { accountCode: '3002', debit: amt },
          { accountCode: '2101', credit: amt },
        ],
      });
      created++;
      console.log(`  OK AP  ${bill.num} — ${bill.vendName} — ₹${bill.amt}`);
    } catch (e) {
      console.log(`  SKIP AP ${bill.num} — ${(e as Error).message}`);
    }
  }

  console.log(`\nDone: ${created} JEs created`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * One-shot: recompute tax fields on invoice VMP-2627-0016 by re-running it
 * through the new InvoiceService.update() GST recompute path. Delete this
 * script after use (or keep as a smoke harness for similar one-offs).
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/fix-invoice-tax.ts
 */

import { createDb } from '@runq/db';
import { InvoiceService } from '../modules/ar/invoice.service';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  const tenantId = 'c74fabbb-f342-4741-a2a5-e96043449546';
  const invoiceId = '98664853-205c-4b89-ae85-4d5d591a0c83';

  const svc = new InvoiceService(db, tenantId);
  const inv = await svc.getById(invoiceId);

  console.log('Before:');
  console.log('  taxAmount:', inv.taxAmount, 'igst:', inv.igstAmount);
  inv.items.forEach((it, i) =>
    console.log(`  L${i + 1} rate=${it.taxRate}% cgst=${it.cgstAmount} sgst=${it.sgstAmount} igst=${it.igstAmount}`),
  );

  await svc.update(invoiceId, {
    customerId: inv.customerId,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    notes: inv.notes,
    items: inv.items.map((it) => ({
      itemId: it.itemId,
      description: it.description,
      uom: it.uom,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      amount: it.amount,
      hsnSacCode: it.hsnSacCode,
      taxCategory: it.taxCategory,
      taxRate: it.taxRate,
    })),
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    totalAmount: inv.totalAmount,
  });

  const after = await svc.getById(invoiceId);
  console.log('\nAfter:');
  console.log('  subtotal:', after.subtotal);
  console.log('  cgst:', after.cgstAmount, 'sgst:', after.sgstAmount, 'igst:', after.igstAmount, 'cess:', after.cessAmount);
  console.log('  taxAmount:', after.taxAmount, 'totalAmount:', after.totalAmount);
  after.items.forEach((it, i) =>
    console.log(`  L${i + 1} rate=${it.taxRate}% cgst=${it.cgstAmount} sgst=${it.sgstAmount} igst=${it.igstAmount}`),
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Regenerate Vrindavan April 2026 GSTR-1 draft using the new pack-size
 * canonical-UQC logic, persist to gst_returns, and print the HSN summary.
 *
 * Usage: pnpm --filter @runq/api exec tsx src/scripts/regen-gstr1-april.ts
 */
import { createDb, gstReturns, tenants } from '@runq/db';
import { eq, and } from 'drizzle-orm';
import { Gstr1Generator } from '../modules/gst/gstr1-generator';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const PERIOD = '042026';

async function main() {
  const { db } = createDb(process.env.DATABASE_URL!);

  const [t] = await db.select().from(tenants).where(eq(tenants.id, TENANT_ID)).limit(1);
  const settings = t?.settings as { gstin?: string; gstStateCode?: string } | undefined;
  const gstin = settings?.gstin ?? '';
  const stateCode = settings?.gstStateCode ?? gstin.slice(0, 2);

  const gen = new Gstr1Generator(db, TENANT_ID);
  const result = await gen.generate('2026-04-01', '2026-04-30', { gstin, stateCode });

  await db.update(gstReturns)
    .set({ data: result.data, updatedAt: new Date() })
    .where(and(
      eq(gstReturns.tenantId, TENANT_ID),
      eq(gstReturns.period, PERIOD),
      eq(gstReturns.returnType, 'gstr1'),
    ));

  console.log('\n=== HSN Summary (April 2026, post-canonical-UQC) ===\n');
  console.log('HSN       Rate UQC  Qty           Taxable        Tax');
  for (const e of result.data.hsn) {
    const tax = e.igstAmount + e.cgstAmount + e.sgstAmount;
    console.log(
      `${e.hsnCode.padEnd(9)} ${String(e.gstRate).padStart(4)} ${e.uqc.padEnd(4)} ` +
      `${e.totalQuantity.toFixed(3).padStart(13)} ${e.taxableValue.toFixed(2).padStart(14)} ${tax.toFixed(2).padStart(10)}`,
    );
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

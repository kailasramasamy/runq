/**
 * Purchase & Procurement test-data seed.
 *
 * Idempotent. Run against any tenant; defaults to "Vrindavan Dairy LLP"
 * (the pilot).
 *
 * Architectural notes (match the architecture the user envisioned):
 *
 *   1. Items master is FG-only. Vendor-procured consumables live ONLY
 *      in `vendor_catalog_items` — per-vendor product lists. The optional
 *      `inventory_item_id` bridge on each catalog row stays NULL unless
 *      the user explicitly wires inventory tracking via the admin UI.
 *
 *   2. PP handles FORMAL procurement only — packaging, equipment,
 *      spares, lab chemicals, ingredients. Workflow: PO → Receive →
 *      3-way match. Predictable qty, planned in advance.
 *
 *   3. Milk is OUT OF SCOPE for PP entirely:
 *        - Bills + JEs: OPS syncs farmer bills every 15 days, runq
 *          Finance auto-creates vendor_bills + journal entries.
 *        - Daily intake quantity (A1 / A2 / Buffalo totals): handled
 *          by the BOM / Manufacturing module so batches can consume
 *          raw milk. Belongs with the milk-RM model defined there.
 *      So this seed creates NO milk catalog rows, NO milk PO, NO
 *      milk-vendor wiring.
 *
 * What this seed creates:
 *   A. Three packaging catalog rows under Rathna Packaging India Pvt
 *      Ltd — A1 / A2 / Buffalo Milk Film 55mm. These drive the formal-
 *      PO + 3-way-match test flow.
 *
 *   B. One sample PO in `sent` status to Rathna Packaging — 50 kg A2
 *      milk film @ ₹350/kg + 18% GST — so the home screen has signal
 *      and the Receive flow is one tap away from any test session.
 *
 * Usage:
 *   pnpm --filter @runq/db db:seed:pp
 *   pnpm --filter @runq/db db:seed:pp <tenantId>
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import {
  tenants,
  vendors,
  vendorCatalogItems,
  normaliseCatalogDescription,
  purchaseOrdersV2,
  purchaseOrderLinesV2,
} from '../src';

/**
 * Per-vendor catalog rows. NOT linked to items master — catalog-only
 * entries. `inventoryItemId` stays NULL forever for these. Packaging
 * vendor only; milk is OUT OF SCOPE for PP (see header).
 */
const CATALOG_ENTRIES: Array<{
  vendorNameContains: string;
  description: string;
  uom: string;
  rate: number;
  hsn: string;
  taxRate: number;
}> = [
  { vendorNameContains: 'Rathna', description: 'A1 Milk Film 55mm',      uom: 'kg', rate: 320, hsn: '3923', taxRate: 18 },
  { vendorNameContains: 'Rathna', description: 'A2 Milk Film 55mm',      uom: 'kg', rate: 350, hsn: '3923', taxRate: 18 },
  { vendorNameContains: 'Rathna', description: 'Buffalo Milk Film 55mm', uom: 'kg', rate: 310, hsn: '3923', taxRate: 18 },
];

async function main(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is required');
    process.exit(1);
  }
  const targetTenantArg = process.argv[2];

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const db = drizzle(client);

  // 1. Resolve tenant.
  const tenantRow = targetTenantArg
    ? await db.select().from(tenants).where(eq(tenants.id, targetTenantArg)).limit(1).then((r) => r[0])
    : await db.select().from(tenants).where(ilike(tenants.name, '%Vrindavan%')).limit(1).then((r) => r[0]);
  if (!tenantRow) {
    console.error('ERROR: tenant not found. Pass a tenant id or create a tenant named "Vrindavan…"');
    process.exit(1);
  }
  const tenantId = tenantRow.id;
  console.log(`Seeding PP test data into tenant: ${tenantRow.name} (${tenantId})`);

  // 2. Vendor catalog entries — per-vendor product list. NOT linked to
  //    the items master. The catalog combobox on PO + bill line entry
  //    pulls from here. If you later decide to inventory-track one of
  //    these, set `inventory_item_id` via the catalog admin UI; the seed
  //    intentionally leaves it NULL.
  for (const entry of CATALOG_ENTRIES) {
    const [vendor] = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(and(
        eq(vendors.tenantId, tenantId),
        ilike(vendors.name, `%${entry.vendorNameContains}%`),
        isNull(vendors.deletedAt),
      ))
      .limit(1);
    if (!vendor) {
      console.log(`  ! vendor matching "${entry.vendorNameContains}" not found — skipping catalog entry`);
      continue;
    }
    const normalized = normaliseCatalogDescription(entry.description);
    const [existing] = await db
      .select({ id: vendorCatalogItems.id })
      .from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.tenantId, tenantId),
        eq(vendorCatalogItems.vendorId, vendor.id),
        eq(vendorCatalogItems.normalizedDescription, normalized),
        eq(vendorCatalogItems.isActive, true),
      ))
      .limit(1);
    if (existing) {
      console.log(`  ✓ catalog entry for ${vendor.name} / ${entry.description} exists`);
      continue;
    }
    await db.insert(vendorCatalogItems).values({
      tenantId,
      vendorId: vendor.id,
      description: entry.description,
      normalizedDescription: normalized,
      defaultUom: entry.uom,
      defaultRate: String(entry.rate),
      hsnSacCode: entry.hsn,
      defaultTaxRate: String(entry.taxRate),
      defaultTaxCategory: entry.taxRate === 0 ? 'exempt' : 'taxable',
      // Intentionally NULL — catalog-only entry, not inventory-tracked.
      inventoryItemId: null,
      isActive: true,
    });
    console.log(`  + catalog entry: ${vendor.name} → ${entry.description} @ ₹${entry.rate}`);
  }

  // 4. One sample PO in `sent` status so the home screen has signal and
  //    the "Receive" button is exercisable without extra clicks.
  //    Targets the packaging vendor (Rathna) — POs are for formal
  //    procurement only, not for daily milk.
  const [pkgVendor] = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(and(
      eq(vendors.tenantId, tenantId),
      ilike(vendors.name, '%Rathna%'),
      isNull(vendors.deletedAt),
    ))
    .limit(1);
  const [pkgCatalog] = pkgVendor
    ? await db
        .select({ id: vendorCatalogItems.id })
        .from(vendorCatalogItems)
        .where(and(
          eq(vendorCatalogItems.tenantId, tenantId),
          eq(vendorCatalogItems.vendorId, pkgVendor.id),
          eq(vendorCatalogItems.normalizedDescription, normaliseCatalogDescription('A2 Milk Film 55mm')),
          eq(vendorCatalogItems.isActive, true),
        ))
        .limit(1)
    : [];

  if (pkgVendor) {
    // Check if a sample PO already exists for the packaging vendor.
    const [existingPo] = await db
      .select({ id: purchaseOrdersV2.id, poNumber: purchaseOrdersV2.poNumber })
      .from(purchaseOrdersV2)
      .where(and(
        eq(purchaseOrdersV2.tenantId, tenantId),
        eq(purchaseOrdersV2.vendorId, pkgVendor.id),
        eq(purchaseOrdersV2.status, 'sent'),
      ))
      .limit(1);
    if (existingPo) {
      console.log(`  ✓ sample sent PO already exists: ${existingPo.poNumber}`);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const year = today.slice(0, 4);
      const existingRows = await db
        .select({ id: purchaseOrdersV2.id })
        .from(purchaseOrdersV2)
        .where(and(
          eq(purchaseOrdersV2.tenantId, tenantId),
          ilike(purchaseOrdersV2.poNumber, `PO-${year}-%`),
        ));
      const next = existingRows.length + 1;
      const poNumber = `PO-${year}-${String(next).padStart(4, '0')}-SEED`;
      // 50 kg A2 milk film @ ₹350/kg + 18% GST.
      const qty = 50;
      const rate = 350;
      const subtotal = qty * rate;           // 17,500
      const taxAmount = subtotal * 0.18;     //  3,150
      const total = subtotal + taxAmount;    // 20,650
      const [po] = await db
        .insert(purchaseOrdersV2)
        .values({
          tenantId,
          poNumber,
          vendorId: pkgVendor.id,
          poDate: today,
          expectedDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
          paymentTerms: 'Net 30',
          status: 'sent',
          sentAt: new Date(),
          approvedAt: new Date(),
          subtotal: String(subtotal),
          taxTotal: String(taxAmount),
          total: String(total),
        })
        .returning();
      await db.insert(purchaseOrderLinesV2).values({
        tenantId,
        poId: po!.id,
        lineNo: 1,
        description: 'A2 Milk Film 55mm',
        catalogItemId: pkgCatalog?.id ?? null,
        uom: 'kg',
        hsnSacCode: '3923',
        qtyOrdered: String(qty),
        unitRate: String(rate),
        amount: String(subtotal),
        taxRate: '18',
        taxAmount: String(taxAmount),
      });
      console.log(`  + sample PO created: ${poNumber} (50 kg A2 milk film @ ₹350 + GST → ₹${total})`);
    }
  } else {
    console.log('  ! skipping sample PO — Rathna Packaging vendor missing');
  }

  console.log('\nPP test data seeded.');
  await client.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

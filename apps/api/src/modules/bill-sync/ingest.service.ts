import { eq, and, sql } from 'drizzle-orm';
import {
  purchaseInvoices, purchaseInvoiceItems, vendors,
  billSyncLogs, paymentAllocations,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { BillSyncSourceService } from './source.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = NodePgDatabase<any> | PgTransaction<any, any, any>;

export interface IngestLine {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  hsnSacCode?: string;
  taxRate?: number;
}

export interface IngestPayload {
  externalId: string;
  version: number;
  vendor: { externalRef?: string; gstin?: string; phone?: string; name?: string };
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  lines: IngestLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
}

export type IngestResultStatus = 'created' | 'updated' | 'skipped' | 'rejected' | 'unchanged';

export interface IngestResult {
  status: IngestResultStatus;
  billId?: string;
  externalVersion?: number;
  reason?: string;
}

const PROTECTED_STATUSES = new Set(['paid', 'partially_paid', 'cancelled']);

export class BillSyncIngestService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * Ingest one bill from an external source. Idempotent on (sourceId, externalId).
   * Resync allowed only if the existing bill is unpaid, has no payments, and
   * is not bank-reconciled. Caller must have verified the source is active.
   */
  async ingestBill(sourceId: string, slug: string, payload: IngestPayload): Promise<IngestResult> {
    const vendorId = await this.resolveVendor(slug, payload.vendor);
    if (!vendorId) {
      const result: IngestResult = { status: 'rejected', reason: 'vendor_not_found' };
      await this.log(sourceId, payload.externalId, 'ingest', result, payload);
      return result;
    }

    const [existing] = await this.db.select().from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        eq(purchaseInvoices.sourceId, sourceId),
        eq(purchaseInvoices.externalId, payload.externalId),
      ))
      .limit(1);

    const result = existing
      ? await this.updateExisting(existing, payload, vendorId)
      : await this.createNew(sourceId, vendorId, payload);

    await this.log(sourceId, payload.externalId, 'ingest', result, payload);
    if (result.status === 'created' || result.status === 'updated') {
      await new BillSyncSourceService(this.db, this.tenantId).touchLastSync(sourceId);
    }
    return result;
  }

  private async resolveVendor(sourceSlug: string, ref: IngestPayload['vendor']): Promise<string | null> {
    if (ref.externalRef) {
      const rows = await this.db.select({ id: vendors.id }).from(vendors)
        .where(and(
          eq(vendors.tenantId, this.tenantId),
          sql`${vendors.externalRefs}->>${sourceSlug} = ${ref.externalRef}`,
        ))
        .limit(1);
      if (rows.length) return rows[0]!.id;
    }
    if (ref.gstin) {
      const rows = await this.db.select({ id: vendors.id }).from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.gstin, ref.gstin)))
        .limit(1);
      if (rows.length) return rows[0]!.id;
    }
    if (ref.phone) {
      const rows = await this.db.select({ id: vendors.id }).from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.phone, ref.phone)))
        .limit(1);
      if (rows.length) return rows[0]!.id;
    }
    if (ref.name) {
      const rows = await this.db.select({ id: vendors.id }).from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.name, ref.name)))
        .limit(1);
      if (rows.length) return rows[0]!.id;
    }
    return null;
  }

  private async createNew(sourceId: string, vendorId: string, p: IngestPayload): Promise<IngestResult> {
    return this.db.transaction(async (tx) => {
      const [invoice] = await tx.insert(purchaseInvoices).values({
        tenantId: this.tenantId,
        vendorId,
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate,
        dueDate: p.dueDate,
        subtotal: String(p.subtotal),
        taxAmount: String(p.taxAmount),
        totalAmount: String(p.totalAmount),
        balanceDue: String(p.totalAmount),
        status: 'draft',
        sourceId,
        externalId: p.externalId,
        externalVersion: p.version,
      }).returning();

      await this.insertLines(tx, invoice!.id, p.lines);
      return { status: 'created' as const, billId: invoice!.id, externalVersion: p.version };
    });
  }

  private async updateExisting(
    existing: typeof purchaseInvoices.$inferSelect,
    p: IngestPayload,
    vendorId: string,
  ): Promise<IngestResult> {
    if (p.version <= existing.externalVersion) {
      return { status: 'unchanged', billId: existing.id, externalVersion: existing.externalVersion };
    }
    const guard = await this.checkResyncGuard(existing);
    if (guard) return { status: 'rejected', billId: existing.id, reason: guard };

    return this.db.transaction(async (tx) => {
      await tx.update(purchaseInvoices).set({
        vendorId,
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate,
        dueDate: p.dueDate,
        subtotal: String(p.subtotal),
        taxAmount: String(p.taxAmount),
        totalAmount: String(p.totalAmount),
        balanceDue: String(p.totalAmount),
        externalVersion: p.version,
        updatedAt: new Date(),
      }).where(eq(purchaseInvoices.id, existing.id));

      await tx.delete(purchaseInvoiceItems).where(eq(purchaseInvoiceItems.invoiceId, existing.id));
      await this.insertLines(tx, existing.id, p.lines);
      return { status: 'updated' as const, billId: existing.id, externalVersion: p.version };
    });
  }

  private async checkResyncGuard(existing: typeof purchaseInvoices.$inferSelect): Promise<string | null> {
    if (PROTECTED_STATUSES.has(existing.status)) return `bill_${existing.status}`;
    if (parseFloat(existing.amountPaid) > 0) return 'has_payments';
    const [alloc] = await this.db.select({ id: paymentAllocations.id }).from(paymentAllocations)
      .where(eq(paymentAllocations.invoiceId, existing.id))
      .limit(1);
    if (alloc) return 'has_allocations';
    return null;
  }

  private async insertLines(tx: AnyTx, billId: string, lines: IngestLine[]) {
    if (!lines.length) return;
    await tx.insert(purchaseInvoiceItems).values(lines.map((l) => ({
      tenantId: this.tenantId,
      invoiceId: billId,
      itemName: l.description,
      quantity: String(l.quantity ?? 1),
      unitPrice: String(l.unitPrice ?? l.amount),
      amount: String(l.amount),
      hsnSacCode: l.hsnSacCode ?? null,
      taxRate: l.taxRate != null ? String(l.taxRate) : null,
    })));
  }

  private async log(sourceId: string, externalId: string, action: string, result: IngestResult, payload?: IngestPayload) {
    await this.db.insert(billSyncLogs).values({
      tenantId: this.tenantId,
      sourceId,
      externalId,
      action,
      status: result.status,
      billId: result.billId ?? null,
      message: result.reason ?? null,
      payload: payload ? { vendor: payload.vendor, invoiceNumber: payload.invoiceNumber, totalAmount: payload.totalAmount } : null,
    });
  }
}

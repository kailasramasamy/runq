import { eq, and, sql } from 'drizzle-orm';
import {
  salesInvoices, salesInvoiceItems,
  purchaseInvoices, purchaseInvoiceItems,
  customers, vendors,
} from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';
import { toNumber } from '../../utils/decimal';
import { randomUUID } from 'crypto';

interface OBEntry {
  id: string;
  name: string;
  amount: number;
  hasOpeningBalance: boolean;
}

export interface OpeningBalanceStatus {
  customers: OBEntry[];
  vendors: OBEntry[];
}

interface SaveInput {
  effectiveDate: string;
  customers: { id: string; amount: number }[];
  vendors: { id: string; amount: number }[];
}

export class OpeningBalanceService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getStatus(): Promise<OpeningBalanceStatus> {
    const [custs, vends] = await Promise.all([
      this.db.select({ id: customers.id, name: customers.name }).from(customers)
        .where(eq(customers.tenantId, this.tenantId)).orderBy(customers.name),
      this.db.select({ id: vendors.id, name: vendors.name }).from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), sql`${vendors.deletedAt} IS NULL`))
        .orderBy(vendors.name),
    ]);

    // Check which already have OB invoices
    const [obInvoices, obBills] = await Promise.all([
      this.db.select({ customerId: salesInvoices.customerId, amt: salesInvoices.totalAmount })
        .from(salesInvoices)
        .where(and(eq(salesInvoices.tenantId, this.tenantId), sql`${salesInvoices.invoiceNumber} LIKE 'OB-%'`)),
      this.db.select({ vendorId: purchaseInvoices.vendorId, amt: purchaseInvoices.totalAmount })
        .from(purchaseInvoices)
        .where(and(eq(purchaseInvoices.tenantId, this.tenantId), sql`${purchaseInvoices.invoiceNumber} LIKE 'OB-%'`)),
    ]);

    const obInvMap = new Map(obInvoices.map((i) => [i.customerId, toNumber(i.amt)]));
    const obBillMap = new Map(obBills.map((b) => [b.vendorId, toNumber(b.amt)]));

    return {
      customers: custs.map((c) => ({
        id: c.id,
        name: c.name,
        amount: obInvMap.get(c.id) ?? 0,
        hasOpeningBalance: obInvMap.has(c.id),
      })),
      vendors: vends.map((v) => ({
        id: v.id,
        name: v.name,
        amount: obBillMap.get(v.id) ?? 0,
        hasOpeningBalance: obBillMap.has(v.id),
      })),
    };
  }

  /** Save or update a single customer opening balance */
  async saveCustomer(customerId: string, amount: number, effectiveDate: string): Promise<{ created: boolean }> {
    const [existing] = await this.db.select({ id: salesInvoices.id }).from(salesInvoices)
      .where(and(eq(salesInvoices.tenantId, this.tenantId), eq(salesInvoices.customerId, customerId), sql`${salesInvoices.invoiceNumber} LIKE 'OB-%'`)).limit(1);

    if (existing) {
      await this.db.update(salesInvoices).set({
        totalAmount: String(amount), subtotal: String(amount), balanceDue: String(amount),
        updatedAt: new Date(),
      }).where(eq(salesInvoices.id, existing.id));
      await this.db.update(salesInvoiceItems).set({
        unitPrice: String(amount), amount: String(amount),
      }).where(eq(salesInvoiceItems.invoiceId, existing.id));
      return { created: false };
    }

    const fy = this.getFY(effectiveDate);
    const created = await this.createOpeningInvoice(customerId, amount, effectiveDate, fy);
    if (created) {
      const [cust] = await this.db.select({ name: customers.name }).from(customers).where(eq(customers.id, customerId)).limit(1);
      try {
        await this.postIndividualJE(effectiveDate, `Opening balance: ${cust?.name ?? 'Customer'}`, 'opening_balance_ar', customerId,
          [{ accountCode: '1103', debit: amount }, { accountCode: '3002', credit: amount }]);
      } catch { /* logged */ }
    }
    return { created };
  }

  /** Save or update a single vendor opening balance */
  async saveVendor(vendorId: string, amount: number, effectiveDate: string): Promise<{ created: boolean }> {
    const [existing] = await this.db.select({ id: purchaseInvoices.id }).from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.tenantId, this.tenantId), eq(purchaseInvoices.vendorId, vendorId), sql`${purchaseInvoices.invoiceNumber} LIKE 'OB-%'`)).limit(1);

    if (existing) {
      await this.db.update(purchaseInvoices).set({
        totalAmount: String(amount), subtotal: String(amount), balanceDue: String(amount),
        updatedAt: new Date(),
      }).where(eq(purchaseInvoices.id, existing.id));
      await this.db.update(purchaseInvoiceItems).set({
        unitPrice: String(amount), amount: String(amount),
      }).where(eq(purchaseInvoiceItems.invoiceId, existing.id));
      return { created: false };
    }

    const fy = this.getFY(effectiveDate);
    const created = await this.createOpeningBill(vendorId, amount, effectiveDate, fy);
    if (created) {
      const [vend] = await this.db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vendorId)).limit(1);
      try {
        await this.postIndividualJE(effectiveDate, `Opening balance: ${vend?.name ?? 'Vendor'}`, 'opening_balance_ap', vendorId,
          [{ accountCode: '3002', debit: amount }, { accountCode: '2101', credit: amount }]);
      } catch { /* logged */ }
    }
    return { created };
  }

  /** Bulk save (kept for backward compat) */
  async save(input: SaveInput): Promise<{ invoicesCreated: number; billsCreated: number }> {
    const custEntries = input.customers.filter((c) => c.amount > 0);
    const vendEntries = input.vendors.filter((v) => v.amount > 0);
    const fy = this.getFY(input.effectiveDate);

    let invoicesCreated = 0;
    let billsCreated = 0;
    let newARTotal = 0;
    let newAPTotal = 0;

    // Create opening invoices for customers
    for (const entry of custEntries) {
      const created = await this.createOpeningInvoice(entry.id, entry.amount, input.effectiveDate, fy);
      if (created) { invoicesCreated++; newARTotal += entry.amount; }
    }

    // Create opening bills for vendors
    for (const entry of vendEntries) {
      const created = await this.createOpeningBill(entry.id, entry.amount, input.effectiveDate, fy);
      if (created) { billsCreated++; newAPTotal += entry.amount; }
    }

    // Post JE only for newly created amounts
    if (newARTotal > 0 || newAPTotal > 0) {
      try {
        await this.postOpeningJE(input.effectiveDate, newARTotal, newAPTotal);
      } catch (err) {
        // Log but don't fail — invoices/bills are already created
        console.error('Opening balance JE failed:', (err as Error).message);
      }
    }

    return { invoicesCreated, billsCreated };
  }

  private async createOpeningInvoice(customerId: string, amount: number, date: string, fy: string): Promise<boolean> {
    const [cust] = await this.db.select({ name: customers.name }).from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!cust) return false;

    // Use customerId suffix to avoid collisions when names share initials
    const initials = cust.name.split(/\s+/).map((w) => w[0]?.toUpperCase()).filter(Boolean).join('').slice(0, 4);
    const suffix = customerId.slice(0, 4).toUpperCase();
    const invoiceNumber = `OB-${initials}-${suffix}-${fy}`;

    // Check if any OB invoice already exists for this customer
    const [existing] = await this.db.select({ id: salesInvoices.id }).from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        eq(salesInvoices.customerId, customerId),
        sql`${salesInvoices.invoiceNumber} LIKE 'OB-%'`,
      )).limit(1);
    if (existing) return false;

    const [inv] = await this.db.insert(salesInvoices).values({
      tenantId: this.tenantId,
      customerId,
      invoiceNumber,
      invoiceDate: date,
      dueDate: date,
      subtotal: String(amount),
      taxAmount: '0',
      totalAmount: String(amount),
      amountReceived: '0',
      balanceDue: String(amount),
      status: 'sent',
    }).returning();

    await this.db.insert(salesInvoiceItems).values({
      tenantId: this.tenantId,
      invoiceId: inv!.id,
      description: 'Opening balance — outstanding from previous FY',
      quantity: '1',
      unitPrice: String(amount),
      amount: String(amount),
    });

    return true;
  }

  private async createOpeningBill(vendorId: string, amount: number, date: string, fy: string): Promise<boolean> {
    const [vend] = await this.db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vendorId)).limit(1);
    if (!vend) return false;

    const initials = vend.name.split(/\s+/).map((w) => w[0]?.toUpperCase()).filter(Boolean).join('').slice(0, 4);
    const suffix = vendorId.slice(0, 4).toUpperCase();
    const invoiceNumber = `OB-${initials}-${suffix}-${fy}`;

    const [existing] = await this.db.select({ id: purchaseInvoices.id }).from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        eq(purchaseInvoices.vendorId, vendorId),
        sql`${purchaseInvoices.invoiceNumber} LIKE 'OB-%'`,
      )).limit(1);
    if (existing) return false;

    const [bill] = await this.db.insert(purchaseInvoices).values({
      tenantId: this.tenantId,
      vendorId,
      invoiceNumber,
      invoiceDate: date,
      dueDate: date,
      subtotal: String(amount),
      taxAmount: '0',
      totalAmount: String(amount),
      amountPaid: '0',
      balanceDue: String(amount),
      status: 'approved',
    }).returning();

    await this.db.insert(purchaseInvoiceItems).values({
      tenantId: this.tenantId,
      invoiceId: bill!.id,
      itemName: 'Opening balance — outstanding from previous FY',
      quantity: '1',
      unitPrice: String(amount),
      amount: String(amount),
    });

    return true;
  }

  private async postIndividualJE(
    date: string, description: string, sourceType: string, sourceId: string,
    lines: { accountCode: string; debit?: number; credit?: number }[],
  ): Promise<void> {
    const gl = new GLService(this.db, this.tenantId);
    await gl.createJournalEntry({ date, description, sourceType, sourceId, lines });
  }

  /** @deprecated Use postIndividualJE instead */
  private async postOpeningJE(date: string, totalAR: number, totalAP: number): Promise<void> {
    const gl = new GLService(this.db, this.tenantId);

    const lines: { accountCode: string; debit?: number; credit?: number }[] = [];
    if (totalAR > 0) lines.push({ accountCode: '1103', debit: totalAR });
    if (totalAP > 0) lines.push({ accountCode: '2101', credit: totalAP });

    // Balancing entry to Retained Earnings
    const net = totalAR - totalAP;
    if (net > 0) {
      lines.push({ accountCode: '3002', credit: net });
    } else if (net < 0) {
      lines.push({ accountCode: '3002', debit: Math.abs(net) });
    }

    if (lines.length >= 2) {
      await gl.createJournalEntry({
        date,
        description: `Opening balances as of ${date}`,
        sourceType: 'opening_balance',
        sourceId: randomUUID(),
        lines,
      });
    }
  }

  private getFY(date: string): string {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const startYear = month >= 4 ? year : year - 1;
    const endYear = startYear + 1;
    return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
  }
}

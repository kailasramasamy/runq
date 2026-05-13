import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { eq, and, sql, inArray } from 'drizzle-orm';
import {
  salesInvoices,
  customers,
  receiptAllocations,
  paymentReceipts,
  tenants,
  creditNotes,
} from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';

const PORTAL_SECRET = process.env.PORTAL_JWT_SECRET || process.env.JWT_SECRET!;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface PortalPayload {
  tenantId: string;
  customerId: string;
  exp: number;
}

function signPayload(payload: PortalPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', PORTAL_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyPayload(token: string): PortalPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new UnauthorizedError('Invalid portal token');
  const [data, sig] = parts;
  const expected = createHmac('sha256', PORTAL_SECRET).update(data!).digest('base64url');
  if (sig !== expected) throw new UnauthorizedError('Invalid portal token');

  const payload = JSON.parse(Buffer.from(data!, 'base64url').toString()) as PortalPayload;
  if (Date.now() > payload.exp) throw new UnauthorizedError('Portal token expired');
  return payload;
}

function generateSlug(): string {
  return randomBytes(4).toString('hex');
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 27);
}

export class PortalService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  generateToken(customerId: string): string {
    const payload: PortalPayload = {
      tenantId: this.tenantId,
      customerId,
      exp: Date.now() + TOKEN_TTL_MS,
    };
    return signPayload(payload);
  }

  async getOrCreateSlug(customerId: string): Promise<string> {
    const [customer] = await this.db
      .select({
        portalSlug: customers.portalSlug,
        nickname: customers.nickname,
        name: customers.name,
      })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)))
      .limit(1);

    if (!customer) throw new NotFoundError('Customer');
    if (customer.portalSlug) return customer.portalSlug;

    const slug = await this.allocateSlug(customer.nickname || customer.name);
    await this.db
      .update(customers)
      .set({ portalSlug: slug })
      .where(eq(customers.id, customerId));
    return slug;
  }

  async getExistingSlug(customerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ portalSlug: customers.portalSlug })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Customer');
    return row.portalSlug ?? null;
  }

  private async allocateSlug(sourceName: string | null): Promise<string> {
    const base = sourceName ? slugifyName(sourceName) : '';
    if (!base) return generateSlug();

    const [existing] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.portalSlug, base))
      .limit(1);
    if (!existing) return base;

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `${base}-${randomBytes(2).toString('hex')}`;
      const [taken] = await this.db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.portalSlug, candidate))
        .limit(1);
      if (!taken) return candidate;
    }
    return generateSlug();
  }

  async resolveSlug(slug: string): Promise<{ tenantId: string; customerId: string }> {
    const [row] = await this.db
      .select({ id: customers.id, tenantId: customers.tenantId })
      .from(customers)
      .where(eq(customers.portalSlug, slug))
      .limit(1);
    if (!row) throw new NotFoundError('Portal link');
    return { tenantId: row.tenantId, customerId: row.id };
  }

  static verifyToken(token: string): PortalPayload {
    return verifyPayload(token);
  }

  async setPin(customerId: string, pin: string): Promise<void> {
    if (!/^\d{4,6}$/.test(pin)) {
      throw new Error('PIN must be 4 to 6 digits');
    }
    const hash = await argon2.hash(pin);
    await this.db
      .update(customers)
      .set({ portalPinHash: hash, portalPin: pin, portalPinSetAt: new Date() })
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)));
  }

  async clearPin(customerId: string): Promise<void> {
    await this.db
      .update(customers)
      .set({ portalPinHash: null, portalPin: null, portalPinSetAt: null })
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)));
  }

  async hasPin(customerId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ hash: customers.portalPinHash })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)))
      .limit(1);
    return !!row?.hash;
  }

  async getPin(customerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ pin: customers.portalPin })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)))
      .limit(1);
    return row?.pin ?? null;
  }

  async verifyPinAndIssueSession(customerId: string, pin: string): Promise<string | null> {
    const [row] = await this.db
      .select({ hash: customers.portalPinHash })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)))
      .limit(1);
    if (!row?.hash) return null;
    const ok = await argon2.verify(row.hash, pin);
    if (!ok) return null;
    return signPayload({
      tenantId: this.tenantId,
      customerId,
      exp: Date.now() + SESSION_TTL_MS,
    });
  }

  static verifySession(token: string): PortalPayload {
    return verifyPayload(token);
  }

  async getOutstandingInvoices(customerId: string) {
    const rows = await this.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
        dueDate: salesInvoices.dueDate,
        totalAmount: salesInvoices.totalAmount,
        balanceDue: salesInvoices.balanceDue,
        status: salesInvoices.status,
      })
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          eq(salesInvoices.customerId, customerId),
          sql`${salesInvoices.balanceDue} > 0`,
          inArray(salesInvoices.status, ['sent', 'partially_paid']),
        ),
      )
      .orderBy(salesInvoices.dueDate);

    return rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate,
      dueDate: r.dueDate,
      totalAmount: Number(r.totalAmount),
      balanceDue: Number(r.balanceDue),
      status: r.status,
    }));
  }

  async getPaymentHistory(customerId: string) {
    const rows = await this.db
      .select({
        id: paymentReceipts.id,
        receiptDate: paymentReceipts.receiptDate,
        amount: receiptAllocations.amount,
        paymentMethod: paymentReceipts.paymentMethod,
        invoiceNumber: salesInvoices.invoiceNumber,
      })
      .from(receiptAllocations)
      .innerJoin(paymentReceipts, eq(receiptAllocations.receiptId, paymentReceipts.id))
      .innerJoin(salesInvoices, eq(receiptAllocations.invoiceId, salesInvoices.id))
      .where(
        and(
          eq(receiptAllocations.tenantId, this.tenantId),
          eq(salesInvoices.customerId, customerId),
        ),
      )
      .orderBy(paymentReceipts.receiptDate);

    return rows.map((r) => ({
      id: r.id,
      receiptDate: r.receiptDate,
      amount: Number(r.amount),
      paymentMethod: r.paymentMethod,
      invoiceNumber: r.invoiceNumber,
    }));
  }

  async getCompanyName(): Promise<string> {
    const [row] = await this.db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    return row?.name ?? 'Company';
  }

  async getCustomerName(customerId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(
        and(eq(customers.id, customerId), eq(customers.tenantId, this.tenantId)),
      )
      .limit(1);
    if (!row) throw new NotFoundError('Customer');
    return row.name;
  }

  async getStatementOfAccount(
    customerId: string,
    fromDate: string,
    toDate: string,
  ): Promise<StatementOfAccount> {
    const [invoiceRows, receiptRows, creditRows] = await Promise.all([
      this.db
        .select({
          date: salesInvoices.invoiceDate,
          ref: salesInvoices.invoiceNumber,
          amount: salesInvoices.totalAmount,
          id: salesInvoices.id,
        })
        .from(salesInvoices)
        .where(
          and(
            eq(salesInvoices.tenantId, this.tenantId),
            eq(salesInvoices.customerId, customerId),
            inArray(salesInvoices.status, ['sent', 'partially_paid', 'paid']),
          ),
        ),
      this.db
        .select({
          date: paymentReceipts.receiptDate,
          amount: paymentReceipts.amount,
          method: paymentReceipts.paymentMethod,
          ref: paymentReceipts.referenceNumber,
          id: paymentReceipts.id,
        })
        .from(paymentReceipts)
        .where(
          and(
            eq(paymentReceipts.tenantId, this.tenantId),
            eq(paymentReceipts.customerId, customerId),
          ),
        ),
      this.db
        .select({
          date: creditNotes.issueDate,
          amount: creditNotes.amount,
          ref: creditNotes.id,
        })
        .from(creditNotes)
        .where(
          and(
            eq(creditNotes.tenantId, this.tenantId),
            eq(creditNotes.customerId, customerId),
            inArray(creditNotes.status, ['issued', 'adjusted']),
          ),
        ),
    ]);

    let openingBalance = 0;
    const allRows: StatementRow[] = [];

    for (const inv of invoiceRows) {
      const amt = Number(inv.amount);
      if (inv.date < fromDate) {
        openingBalance += amt;
      } else if (inv.date <= toDate) {
        allRows.push({
          date: inv.date,
          type: 'invoice',
          ref: inv.ref,
          entityId: inv.id,
          description: `Invoice ${inv.ref}`,
          debit: amt,
          credit: 0,
          runningBalance: 0,
        });
      }
    }
    for (const rcpt of receiptRows) {
      const amt = Number(rcpt.amount);
      if (rcpt.date < fromDate) {
        openingBalance -= amt;
      } else if (rcpt.date <= toDate) {
        const utr = rcpt.ref ? ` (Ref: ${rcpt.ref})` : '';
        allRows.push({
          date: rcpt.date,
          type: 'receipt',
          ref: rcpt.ref ?? rcpt.id,
          entityId: rcpt.id,
          description: `Payment received via ${rcpt.method.replace(/_/g, ' ')}${utr}`,
          debit: 0,
          credit: amt,
          runningBalance: 0,
        });
      }
    }
    for (const cn of creditRows) {
      const amt = Number(cn.amount);
      if (cn.date < fromDate) {
        openingBalance -= amt;
      } else if (cn.date <= toDate) {
        allRows.push({
          date: cn.date,
          type: 'credit_note',
          ref: cn.ref,
          description: 'Credit note issued',
          debit: 0,
          credit: amt,
          runningBalance: 0,
        });
      }
    }

    allRows.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      // Invoices first on same date, then credit notes, then receipts
      const order = { invoice: 0, credit_note: 1, receipt: 2 };
      return order[a.type] - order[b.type];
    });

    let running = openingBalance;
    for (const row of allRows) {
      running = running + row.debit - row.credit;
      row.runningBalance = running;
    }

    return {
      fromDate,
      toDate,
      openingBalance,
      closingBalance: running,
      rows: allRows,
    };
  }

  async getReceiptsWithAllocations(customerId: string): Promise<ReceiptWithAllocations[]> {
    const rows = await this.db
      .select({
        receiptId: paymentReceipts.id,
        receiptDate: paymentReceipts.receiptDate,
        receiptAmount: paymentReceipts.amount,
        method: paymentReceipts.paymentMethod,
        referenceNumber: paymentReceipts.referenceNumber,
        notes: paymentReceipts.notes,
        allocationAmount: receiptAllocations.amount,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceId: salesInvoices.id,
        invoiceDate: salesInvoices.invoiceDate,
        invoiceDueDate: salesInvoices.dueDate,
        invoiceTotalAmount: salesInvoices.totalAmount,
        invoiceBalanceDue: salesInvoices.balanceDue,
        invoiceStatus: salesInvoices.status,
      })
      .from(paymentReceipts)
      .leftJoin(
        receiptAllocations,
        eq(receiptAllocations.receiptId, paymentReceipts.id),
      )
      .leftJoin(salesInvoices, eq(receiptAllocations.invoiceId, salesInvoices.id))
      .where(
        and(
          eq(paymentReceipts.tenantId, this.tenantId),
          eq(paymentReceipts.customerId, customerId),
        ),
      )
      .orderBy(sql`${paymentReceipts.receiptDate} desc`);

    const grouped = new Map<string, ReceiptWithAllocations>();
    for (const r of rows) {
      let entry = grouped.get(r.receiptId);
      if (!entry) {
        entry = {
          receiptId: r.receiptId,
          receiptDate: r.receiptDate,
          totalAmount: Number(r.receiptAmount),
          method: r.method,
          referenceNumber: r.referenceNumber,
          notes: r.notes,
          allocations: [],
          allocatedTotal: 0,
        };
        grouped.set(r.receiptId, entry);
      }
      if (r.invoiceId && r.allocationAmount) {
        const amt = Number(r.allocationAmount);
        entry.allocations.push({
          invoiceId: r.invoiceId,
          invoiceNumber: r.invoiceNumber!,
          amount: amt,
          invoiceDate: r.invoiceDate ?? '',
          dueDate: r.invoiceDueDate ?? '',
          totalAmount: Number(r.invoiceTotalAmount ?? 0),
          balanceDue: Number(r.invoiceBalanceDue ?? 0),
          status: r.invoiceStatus ?? '',
        });
        entry.allocatedTotal += amt;
      }
    }

    return Array.from(grouped.values());
  }
}

export interface StatementRow {
  date: string;
  type: 'invoice' | 'receipt' | 'credit_note';
  ref: string;
  /** UUID of the underlying invoice/receipt — used for client-side linking. Absent for credit notes. */
  entityId?: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface StatementOfAccount {
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  rows: StatementRow[];
}

export interface ReceiptAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
}

export interface ReceiptWithAllocations {
  receiptId: string;
  receiptDate: string;
  totalAmount: number;
  method: string;
  referenceNumber: string | null;
  notes: string | null;
  allocations: ReceiptAllocation[];
  allocatedTotal: number;
}

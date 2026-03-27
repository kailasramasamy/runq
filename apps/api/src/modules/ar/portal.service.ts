import { createHmac } from 'node:crypto';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { salesInvoices, customers, receiptAllocations, paymentReceipts, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';

const PORTAL_SECRET = process.env.PORTAL_JWT_SECRET || process.env.JWT_SECRET || 'portal-secret';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

  static verifyToken(token: string): PortalPayload {
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
}

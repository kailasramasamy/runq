import { createHmac, randomBytes } from 'node:crypto';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { vendors, purchaseOrders, purchaseInvoices, payments, paymentAllocations, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';

const PORTAL_SECRET = process.env.PORTAL_JWT_SECRET || process.env.JWT_SECRET || 'portal-secret';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PortalPayload {
  tenantId: string;
  vendorId: string;
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

export class VendorPortalService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  generateToken(vendorId: string): string {
    const payload: PortalPayload = {
      tenantId: this.tenantId,
      vendorId,
      exp: Date.now() + TOKEN_TTL_MS,
    };
    return signPayload(payload);
  }

  static verifyToken(token: string): PortalPayload {
    return verifyPayload(token);
  }

  async getOrCreateSlug(vendorId: string): Promise<string> {
    const [vendor] = await this.db
      .select({ portalSlug: vendors.portalSlug })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, this.tenantId)))
      .limit(1);

    if (!vendor) throw new NotFoundError('Vendor');
    if (vendor.portalSlug) return vendor.portalSlug;

    const slug = generateSlug();
    await this.db.update(vendors).set({ portalSlug: slug }).where(eq(vendors.id, vendorId));
    return slug;
  }

  async resolveSlug(slug: string): Promise<{ tenantId: string; vendorId: string }> {
    const [row] = await this.db
      .select({ id: vendors.id, tenantId: vendors.tenantId })
      .from(vendors)
      .where(eq(vendors.portalSlug, slug))
      .limit(1);
    if (!row) throw new NotFoundError('Portal link');
    return { tenantId: row.tenantId, vendorId: row.id };
  }

  async getPurchaseOrders(vendorId: string) {
    const rows = await this.db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        orderDate: purchaseOrders.orderDate,
        expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
        totalAmount: purchaseOrders.totalAmount,
        status: purchaseOrders.status,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, this.tenantId),
          eq(purchaseOrders.vendorId, vendorId),
          inArray(purchaseOrders.status, ['confirmed', 'partially_received']),
        ),
      )
      .orderBy(purchaseOrders.orderDate);

    return rows.map((r) => ({
      ...r,
      totalAmount: Number(r.totalAmount),
    }));
  }

  async getOutstandingBills(vendorId: string) {
    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        dueDate: purchaseInvoices.dueDate,
        totalAmount: purchaseInvoices.totalAmount,
        balanceDue: purchaseInvoices.balanceDue,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          eq(purchaseInvoices.vendorId, vendorId),
          sql`${purchaseInvoices.balanceDue} > 0`,
          inArray(purchaseInvoices.status, ['approved', 'partially_paid']),
        ),
      )
      .orderBy(purchaseInvoices.dueDate);

    return rows.map((r) => ({
      ...r,
      totalAmount: Number(r.totalAmount),
      balanceDue: Number(r.balanceDue),
    }));
  }

  async getPaymentHistory(vendorId: string) {
    const rows = await this.db
      .select({
        id: payments.id,
        paymentDate: payments.paymentDate,
        amount: paymentAllocations.amount,
        paymentMethod: payments.paymentMethod,
        invoiceNumber: purchaseInvoices.invoiceNumber,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
      .innerJoin(purchaseInvoices, eq(paymentAllocations.invoiceId, purchaseInvoices.id))
      .where(
        and(
          eq(paymentAllocations.tenantId, this.tenantId),
          eq(payments.vendorId, vendorId),
        ),
      )
      .orderBy(payments.paymentDate);

    return rows.map((r) => ({
      id: r.id,
      paymentDate: r.paymentDate,
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

  async getVendorName(vendorId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: vendors.name })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Vendor');
    return row.name;
  }
}

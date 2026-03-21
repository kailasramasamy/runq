import { eq, and, ilike, isNull, sql } from 'drizzle-orm';
import { vendors, purchaseInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { Vendor, VendorWithOutstanding } from '@runq/types';
import type { CreateVendorInput, UpdateVendorInput } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface VendorListParams {
  page: number;
  limit: number;
  search?: string;
}

export interface VendorListResult {
  data: VendorWithOutstanding[];
  meta: PaginationMeta;
}

export class VendorService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: VendorListParams): Promise<VendorListResult> {
    const { page, limit, search } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(vendors.tenantId, this.tenantId),
      isNull(vendors.deletedAt),
      search ? ilike(vendors.name, `%${search}%`) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(vendors)
        .where(baseWhere)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(vendors)
        .where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data: VendorWithOutstanding[] = rows.map((v) => ({
      ...this.toVendor(v),
      outstandingAmount: 0,
      overdueAmount: 0,
    }));

    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<VendorWithOutstanding> {
    const [row] = await this.db
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, this.tenantId), isNull(vendors.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundError('Vendor');

    return { ...this.toVendor(row), outstandingAmount: 0, overdueAmount: 0 };
  }

  async create(input: CreateVendorInput): Promise<Vendor> {
    const [row] = await this.db
      .insert(vendors)
      .values({ ...input, tenantId: this.tenantId })
      .returning();

    return this.toVendor(row!);
  }

  async update(id: string, input: UpdateVendorInput): Promise<Vendor> {
    const [row] = await this.db
      .update(vendors)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, this.tenantId), isNull(vendors.deletedAt)))
      .returning();

    if (!row) throw new NotFoundError('Vendor');
    return this.toVendor(row);
  }

  async softDelete(id: string): Promise<void> {
    const unpaid = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.vendorId, id),
          eq(purchaseInvoices.tenantId, this.tenantId),
          sql`${purchaseInvoices.balanceDue} > 0`,
        ),
      );

    if ((unpaid[0]?.count ?? 0) > 0) {
      throw new ConflictError('Cannot delete vendor with unpaid invoices');
    }

    const [row] = await this.db
      .update(vendors)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(vendors.id, id), eq(vendors.tenantId, this.tenantId), isNull(vendors.deletedAt)))
      .returning({ id: vendors.id });

    if (!row) throw new NotFoundError('Vendor');
  }

  private toVendor(row: typeof vendors.$inferSelect): Vendor {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      gstin: row.gstin,
      pan: row.pan,
      email: row.email,
      phone: row.phone,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      bankAccountName: row.bankAccountName,
      bankAccountNumber: row.bankAccountNumber,
      bankIfsc: row.bankIfsc,
      bankName: row.bankName,
      paymentTermsDays: row.paymentTermsDays,
      wmsVendorId: row.wmsVendorId,
      category: row.category ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

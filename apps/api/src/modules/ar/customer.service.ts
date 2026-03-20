import { eq, and, ilike, isNull, sql } from 'drizzle-orm';
import { customers, salesInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { Customer, CustomerWithOutstanding, PaginationMeta } from '@runq/types';
import type { CreateCustomerInput, UpdateCustomerInput, CustomerFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface CustomerListParams {
  page: number;
  limit: number;
  search?: string;
  type?: CustomerFilter['type'];
  hasOutstanding?: boolean;
}

export interface CustomerListResult {
  data: CustomerWithOutstanding[];
  meta: PaginationMeta;
}

export class CustomerService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: CustomerListParams): Promise<CustomerListResult> {
    const { page, limit, search, type, hasOutstanding } = params;
    const { offset } = applyPagination(page, limit);

    const baseWhere = and(
      eq(customers.tenantId, this.tenantId),
      isNull(customers.deletedAt),
      search ? ilike(customers.name, `%${search}%`) : undefined,
      type ? eq(customers.type, type) : undefined,
    );

    const [rows, countResult] = await Promise.all([
      this.db.select().from(customers).where(baseWhere).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(customers).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = await this.attachOutstanding(rows, hasOutstanding);

    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }

  async getById(id: string): Promise<CustomerWithOutstanding> {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenantId, this.tenantId), isNull(customers.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundError('Customer');

    const [outstanding] = await this.queryOutstanding([id]);
    return { ...this.toCustomer(row), outstandingAmount: outstanding?.amount ?? 0, overdueAmount: 0 };
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    const [row] = await this.db
      .insert(customers)
      .values({ ...input, tenantId: this.tenantId })
      .returning();

    return this.toCustomer(row!);
  }

  async update(id: string, input: UpdateCustomerInput): Promise<Customer> {
    const [row] = await this.db
      .update(customers)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.tenantId, this.tenantId), isNull(customers.deletedAt)))
      .returning();

    if (!row) throw new NotFoundError('Customer');
    return this.toCustomer(row);
  }

  async softDelete(id: string): Promise<void> {
    const unpaid = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.customerId, id),
          eq(salesInvoices.tenantId, this.tenantId),
          sql`${salesInvoices.balanceDue} > 0`,
        ),
      );

    if ((unpaid[0]?.count ?? 0) > 0) {
      throw new ConflictError('Cannot delete customer with unpaid invoices');
    }

    const [row] = await this.db
      .update(customers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.tenantId, this.tenantId), isNull(customers.deletedAt)))
      .returning({ id: customers.id });

    if (!row) throw new NotFoundError('Customer');
  }

  private async queryOutstanding(ids: string[]): Promise<{ customerId: string; amount: number }[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        customerId: salesInvoices.customerId,
        amount: sql<number>`coalesce(sum(${salesInvoices.balanceDue}), 0)::float`,
      })
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          sql`${salesInvoices.customerId} = ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}])`,
          sql`${salesInvoices.balanceDue} > 0`,
        ),
      )
      .groupBy(salesInvoices.customerId);
  }

  private async attachOutstanding(
    rows: (typeof customers.$inferSelect)[],
    hasOutstanding?: boolean,
  ): Promise<CustomerWithOutstanding[]> {
    const ids = rows.map((r) => r.id);
    const outstandingMap = new Map<string, number>();

    if (ids.length > 0) {
      const results = await this.queryOutstanding(ids);
      for (const r of results) outstandingMap.set(r.customerId, r.amount);
    }

    const result: CustomerWithOutstanding[] = rows.map((r) => ({
      ...this.toCustomer(r),
      outstandingAmount: outstandingMap.get(r.id) ?? 0,
      overdueAmount: 0,
    }));

    if (hasOutstanding === true) return result.filter((r) => r.outstandingAmount > 0);
    if (hasOutstanding === false) return result.filter((r) => r.outstandingAmount === 0);
    return result;
  }

  private toCustomer(row: typeof customers.$inferSelect): Customer {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      type: row.type,
      email: row.email ?? null,
      phone: row.phone ?? null,
      gstin: row.gstin ?? null,
      pan: row.pan ?? null,
      addressLine1: row.addressLine1 ?? null,
      addressLine2: row.addressLine2 ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      pincode: row.pincode ?? null,
      paymentTermsDays: row.paymentTermsDays,
      contactPerson: row.contactPerson ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

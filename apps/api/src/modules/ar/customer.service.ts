import { eq, and, ilike, isNull, sql } from 'drizzle-orm';
import { customers, salesInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { Customer, CustomerWithOutstanding, PaginationMeta } from '@runq/types';
import type { CreateCustomerInput, UpdateCustomerInput, CustomerFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

interface SyncCustomerResult {
  action: 'created' | 'updated';
  customer: Customer;
}

interface SyncCustomersResult {
  created: number;
  updated: number;
  errors: Array<{ index: number; name: string; message: string }>;
}

interface ImportCSVResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name: string; message: string }>;
}

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

  async syncCustomer(data: CreateCustomerInput): Promise<SyncCustomerResult> {
    const [byName] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, this.tenantId), ilike(customers.name, data.name), isNull(customers.deletedAt)))
      .limit(1);

    if (byName) {
      const customer = await this.update(byName.id, data);
      return { action: 'updated', customer };
    }

    const customer = await this.create(data);
    return { action: 'created', customer };
  }

  async syncCustomers(customerList: CreateCustomerInput[]): Promise<SyncCustomersResult> {
    let created = 0;
    let updated = 0;
    const errors: SyncCustomersResult['errors'] = [];

    for (let i = 0; i < customerList.length; i++) {
      const item = customerList[i]!;
      try {
        const { action } = await this.syncCustomer(item);
        if (action === 'created') created++;
        else updated++;
      } catch (err) {
        errors.push({ index: i, name: item.name, message: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    return { created, updated, errors };
  }

  async importFromCSV(csvData: string): Promise<ImportCSVResult> {
    const lines = csvData.split('\n').map((l) => l.trim()).filter(Boolean);
    const result: ImportCSVResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    if (lines.length < 2) return result;

    const headers = lines[0]!.split(',').map((h) => h.trim().replace(/"/g, '').toLowerCase());

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCSVLine(lines[i]!);
      const get = (key: string) => cols[headers.indexOf(key)]?.trim().replace(/"/g, '') ?? '';

      const name = get('name');
      if (!name) { result.skipped++; continue; }

      try {
        const input = this.buildCSVInput(get);
        await this.syncCSVRow(name, input, result);
      } catch (err) {
        result.errors.push({ row: i + 1, name, message: err instanceof Error ? err.message : 'Parse error' });
      }
    }

    return result;
  }

  private buildCSVInput(get: (key: string) => string): Partial<CreateCustomerInput> & { name: string } {
    const payTermsRaw = get('payment terms');
    const typeRaw = get('type');
    return {
      name: get('name'),
      type: (typeRaw === 'payment_gateway' ? 'payment_gateway' : 'b2b') as 'b2b' | 'payment_gateway',
      phone: get('phone') || undefined,
      email: get('email') || undefined,
      gstin: get('gstin') || undefined,
      pan: get('pan') || undefined,
      addressLine1: get('address') || undefined,
      city: get('city') || undefined,
      state: get('state') || undefined,
      pincode: get('pincode') || undefined,
      contactPerson: get('contact person') || undefined,
      paymentTermsDays: payTermsRaw ? (parseInt(payTermsRaw, 10) || 30) : 30,
    };
  }

  private async syncCSVRow(
    name: string,
    input: Partial<CreateCustomerInput> & { name: string },
    result: ImportCSVResult,
  ): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, this.tenantId), ilike(customers.name, name), isNull(customers.deletedAt)))
      .limit(1);

    if (existing) {
      const patch = this.buildNonEmptyPatch(existing, input);
      if (Object.keys(patch).length > 0) {
        await this.update(existing.id, patch);
        result.updated++;
      } else {
        result.skipped++;
      }
    } else {
      await this.create({ type: 'b2b', paymentTermsDays: 30, ...input });
      result.created++;
    }
  }

  private buildNonEmptyPatch(
    existing: typeof customers.$inferSelect,
    input: Partial<CreateCustomerInput> & { name: string },
  ): UpdateCustomerInput {
    const patch: UpdateCustomerInput = {};
    const fields = ['phone', 'email', 'gstin', 'pan', 'addressLine1', 'city', 'state', 'pincode', 'contactPerson'] as const;
    for (const f of fields) {
      const newVal = input[f as keyof typeof input];
      if (newVal && !existing[f as keyof typeof existing]) {
        (patch as Record<string, unknown>)[f] = newVal;
      }
    }
    return patch;
  }

  private splitCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
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

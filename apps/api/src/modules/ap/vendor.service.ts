import { eq, and, ilike, isNull, sql } from 'drizzle-orm';
import { vendors, purchaseInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import type { Vendor, VendorWithOutstanding } from '@runq/types';
import type { CreateVendorInput, UpdateVendorInput } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

type SyncVendorInput = CreateVendorInput & { wmsVendorId?: string | null };

interface SyncVendorResult {
  action: 'created' | 'updated';
  vendor: Vendor;
}

interface SyncVendorsResult {
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

  async syncVendor(data: SyncVendorInput): Promise<SyncVendorResult> {
    const { wmsVendorId, ...fields } = data;

    if (wmsVendorId) {
      const [existing] = await this.db
        .select()
        .from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.wmsVendorId, wmsVendorId), isNull(vendors.deletedAt)))
        .limit(1);
      if (existing) {
        const vendor = await this.update(existing.id, { ...fields, wmsVendorId });
        return { action: 'updated', vendor };
      }
    }

    const [byName] = await this.db
      .select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, fields.name), isNull(vendors.deletedAt)))
      .limit(1);

    if (byName) {
      const vendor = await this.update(byName.id, { ...fields, wmsVendorId: wmsVendorId ?? undefined });
      return { action: 'updated', vendor };
    }

    const vendor = await this.create({ ...fields, wmsVendorId: wmsVendorId ?? undefined });
    return { action: 'created', vendor };
  }

  async syncVendors(vendorList: SyncVendorInput[]): Promise<SyncVendorsResult> {
    let created = 0;
    let updated = 0;
    const errors: SyncVendorsResult['errors'] = [];

    for (let i = 0; i < vendorList.length; i++) {
      const item = vendorList[i]!;
      try {
        const { action } = await this.syncVendor(item);
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
        const input = this.buildCSVInput(get, name, headers, cols);
        await this.syncCSVRow(name, input, result);
      } catch (err) {
        result.errors.push({ row: i + 1, name, message: err instanceof Error ? err.message : 'Parse error' });
      }
    }

    return result;
  }

  private buildCSVInput(
    get: (key: string) => string,
    name: string,
    _headers: string[],
    _cols: string[],
  ): Partial<CreateVendorInput> & { name: string } {
    const payTermsRaw = get('payment terms');
    return {
      name,
      phone: get('phone') || undefined,
      email: get('email') || undefined,
      gstin: get('gstin') || undefined,
      pan: get('pan') || undefined,
      bankAccountNumber: get('bank account') || undefined,
      bankIfsc: get('ifsc') || undefined,
      bankName: get('bank name') || undefined,
      addressLine1: get('address') || undefined,
      city: get('city') || undefined,
      state: get('state') || undefined,
      pincode: get('pincode') || undefined,
      category: get('category') || undefined,
      paymentTermsDays: payTermsRaw ? (parseInt(payTermsRaw, 10) || 30) : 30,
    };
  }

  private async syncCSVRow(
    name: string,
    input: Partial<CreateVendorInput> & { name: string },
    result: ImportCSVResult,
  ): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, name), isNull(vendors.deletedAt)))
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
      await this.create({ paymentTermsDays: 30, ...input });
      result.created++;
    }
  }

  private buildNonEmptyPatch(
    existing: typeof vendors.$inferSelect,
    input: Partial<CreateVendorInput> & { name: string },
  ): UpdateVendorInput {
    const patch: UpdateVendorInput = {};
    const fields = ['phone', 'email', 'gstin', 'pan', 'bankAccountNumber', 'bankIfsc', 'bankName', 'addressLine1', 'city', 'state', 'pincode', 'category'] as const;
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
      earlyPaymentDiscountPercent: row.earlyPaymentDiscountPercent ? Number(row.earlyPaymentDiscountPercent) : null,
      earlyPaymentDiscountDays: row.earlyPaymentDiscountDays ?? null,
      wmsVendorId: row.wmsVendorId,
      category: row.category ?? null,
      expenseAccountCode: row.expenseAccountCode ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

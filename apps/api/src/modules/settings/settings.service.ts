import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { Tenant, TenantSettings } from '@runq/types';
import type { CompanySettingsInput, InvoiceNumberingInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

export class SettingsService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getCompanySettings(): Promise<Tenant> {
    const [row] = await this.db.select().from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!row) throw new NotFoundError('Tenant');
    return this.toTenant(row);
  }

  async updateCompanySettings(data: CompanySettingsInput): Promise<Tenant> {
    const [existing] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!existing) throw new NotFoundError('Tenant');

    const merged = { ...(existing.settings as object), ...data };
    const [row] = await this.db
      .update(tenants)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(tenants.id, this.tenantId))
      .returning();

    if (!row) throw new NotFoundError('Tenant');
    return this.toTenant(row);
  }

  async getInvoiceNumbering(): Promise<Pick<TenantSettings, 'invoicePrefix' | 'invoiceFormat'>> {
    const [row] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!row) throw new NotFoundError('Tenant');
    const s = (row.settings ?? {}) as Partial<TenantSettings>;
    return {
      invoicePrefix: s.invoicePrefix ?? 'INV',
      invoiceFormat: s.invoiceFormat ?? '{prefix}-{fy}-{seq}',
    };
  }

  async updateInvoiceNumbering(data: InvoiceNumberingInput): Promise<Pick<TenantSettings, 'invoicePrefix' | 'invoiceFormat'>> {
    const [existing] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!existing) throw new NotFoundError('Tenant');

    const merged = { ...(existing.settings as object), invoicePrefix: data.invoicePrefix, invoiceFormat: data.invoiceFormat, invoiceStartSequence: data.invoiceStartSequence };
    const [row] = await this.db
      .update(tenants)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(tenants.id, this.tenantId))
      .returning();

    if (!row) throw new NotFoundError('Tenant');
    const s = (row.settings ?? {}) as Partial<TenantSettings>;
    return {
      invoicePrefix: s.invoicePrefix ?? 'INV',
      invoiceFormat: s.invoiceFormat ?? '{prefix}-{fy}-{seq}',
    };
  }

  private toTenant(row: typeof tenants.$inferSelect): Tenant {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      settings: row.settings as TenantSettings,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

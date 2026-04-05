import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { Tenant, TenantSettings } from '@runq/types';
import type { CompanySettingsInput, InvoiceNumberingInput, EmailProviderConfigInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { createEmailProvider } from '../../utils/email-provider';

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

  async getEmailProviderConfig() {
    const [row] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!row) throw new NotFoundError('Tenant');
    const s = (row.settings ?? {}) as Partial<TenantSettings>;
    const cfg = s.emailConfig;
    return {
      emailProvider: s.emailProvider ?? null,
      emailConfig: cfg ? {
        // Mask secrets — show only last 4 chars
        apiKey: cfg.apiKey ? `****${cfg.apiKey.slice(-4)}` : undefined,
        smtpHost: cfg.smtpHost,
        smtpPort: cfg.smtpPort,
        smtpSecure: cfg.smtpSecure,
        smtpUser: cfg.smtpUser,
        smtpPass: cfg.smtpPass ? '****' : undefined,
        fromEmail: cfg.fromEmail,
        fromName: cfg.fromName,
      } : undefined,
    };
  }

  async updateEmailProviderConfig(data: EmailProviderConfigInput) {
    const [existing] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!existing) throw new NotFoundError('Tenant');

    const currentSettings = (existing.settings ?? {}) as Record<string, unknown>;
    const currentConfig = (currentSettings.emailConfig ?? {}) as Record<string, unknown>;

    // Merge config — don't overwrite secrets with masked values
    let newConfig = data.emailConfig ?? {};
    if (newConfig.apiKey?.startsWith('****')) {
      newConfig = { ...newConfig, apiKey: currentConfig.apiKey as string };
    }
    if (newConfig.smtpPass === '****') {
      newConfig = { ...newConfig, smtpPass: currentConfig.smtpPass as string };
    }

    const merged = { ...currentSettings, emailProvider: data.emailProvider, emailConfig: newConfig };
    await this.db
      .update(tenants)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(tenants.id, this.tenantId));

    return this.getEmailProviderConfig();
  }

  async sendTestEmail(to: string): Promise<void> {
    const [row] = await this.db.select({ settings: tenants.settings, name: tenants.name }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!row) throw new NotFoundError('Tenant');

    const settings = row.settings as TenantSettings;
    const provider = createEmailProvider(settings);
    if (!provider) throw new Error('Email provider not configured. Save your settings first.');

    const sent = await provider.send({
      to,
      subject: `Test Email from ${row.name} — runQ`,
      html: `<div style="font-family:sans-serif;padding:20px;"><h2>Email Configuration Working</h2><p>This is a test email from <strong>${row.name}</strong> via runQ.</p><p style="color:#666;font-size:12px;">Provider: ${settings.emailProvider}</p></div>`,
      text: `Test email from ${row.name}. Your email configuration is working correctly.`,
    });

    if (!sent) throw new Error('Failed to send test email');
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

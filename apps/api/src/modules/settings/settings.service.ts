import { eq, and, isNull, sql } from 'drizzle-orm';
import { tenants, customers, items, bankAccounts } from '@runq/db';
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

  // ─── Onboarding ────────────────────────────────────────────────────────────

  /**
   * Returns the onboarding wizard state for the dashboard. The `steps` map is
   * the union of:
   *   1. What the user clicked through in the wizard (stored in tenant.settings.onboardingSteps)
   *   2. What's actually present in the DB (derived live)
   *
   * The (2) backfill handles tenants who set things up via direct settings
   * routes BEFORE the wizard existed, or who skip the wizard entirely. Without
   * it, the dashboard auto-opens the wizard for any tenant whose explicit map
   * is empty — even when their company profile, bank accounts, etc. already
   * exist.
   */
  async getOnboarding(): Promise<{ steps: Record<string, boolean>; completed: boolean; dismissed: boolean }> {
    const [row] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!row) throw new NotFoundError('Tenant');
    const s = (row.settings ?? {}) as Partial<TenantSettings> & {
      onboardingSteps?: Record<string, boolean>;
      onboardingCompleted?: boolean;
      onboardingDismissed?: boolean;
    };

    const explicit = s.onboardingSteps ?? {};
    const derived = await this.deriveOnboardingFromState(s);

    // Union: a step counts as done if either source says so
    const merged: Record<string, boolean> = {
      company: explicit.company || derived.company,
      bank: explicit.bank || derived.bank,
      invoice: explicit.invoice || derived.invoice,
      customer: explicit.customer || derived.customer,
      item: explicit.item || derived.item,
    };

    return {
      steps: merged,
      completed: s.onboardingCompleted ?? false,
      dismissed: s.onboardingDismissed ?? false,
    };
  }

  /**
   * Derive each onboarding step's "done" state from real DB state.
   * Cheap — three count queries + a settings shape check.
   */
  private async deriveOnboardingFromState(s: Partial<TenantSettings>): Promise<{
    company: boolean;
    bank: boolean;
    invoice: boolean;
    customer: boolean;
    item: boolean;
  }> {
    // Company profile is "done" once GSTIN OR a state code is filled —
    // both are non-default fields the wizard's CompanyProfileStep writes.
    const company = !!(s.gstin || s.stateCode || s.legalName);

    // Invoice settings is "done" once the tenant has customized the prefix
    // or format beyond the empty default. We check explicit presence rather
    // than equality with the default so any user touch counts.
    const invoice = !!(s.invoicePrefix && s.invoicePrefix.length > 0)
      || !!(s.invoiceFormat && s.invoiceFormat.length > 0);

    const [bankCount, customerCount, itemCount] = await Promise.all([
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.tenantId, this.tenantId), eq(bankAccounts.isActive, true))),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(customers)
        .where(and(eq(customers.tenantId, this.tenantId), isNull(customers.deletedAt))),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(items)
        .where(and(eq(items.tenantId, this.tenantId), eq(items.isActive, true))),
    ]);

    return {
      company,
      bank: (bankCount[0]?.n ?? 0) > 0,
      invoice,
      customer: (customerCount[0]?.n ?? 0) > 0,
      item: (itemCount[0]?.n ?? 0) > 0,
    };
  }

  async completeOnboardingStep(step: string): Promise<{ steps: Record<string, boolean>; completed: boolean; dismissed: boolean }> {
    const [existing] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!existing) throw new NotFoundError('Tenant');

    const current = (existing.settings ?? {}) as Record<string, unknown>;
    const currentSteps = (current.onboardingSteps ?? {}) as Record<string, boolean>;
    const newSteps = { ...currentSteps, [step]: true };

    await this.db
      .update(tenants)
      .set({ settings: { ...current, onboardingSteps: newSteps }, updatedAt: new Date() })
      .where(eq(tenants.id, this.tenantId));

    return this.getOnboarding();
  }

  async dismissOnboarding(): Promise<{ steps: Record<string, boolean>; completed: boolean; dismissed: boolean }> {
    const [existing] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!existing) throw new NotFoundError('Tenant');

    const current = (existing.settings ?? {}) as Record<string, unknown>;
    await this.db
      .update(tenants)
      .set({ settings: { ...current, onboardingDismissed: true }, updatedAt: new Date() })
      .where(eq(tenants.id, this.tenantId));

    return this.getOnboarding();
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

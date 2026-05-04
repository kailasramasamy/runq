import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import { gstReturns, gstReturnInvoices, gspAuthTokens, tenants, salesInvoiceItems, salesInvoices, customers } from '@runq/db';
import { WhiteBooksGspClient } from './gsp-client';
import type { Db } from '@runq/db';
import type { Gstr1Data, Gstr3bData } from '@runq/db';
import { Gstr1Generator } from './gstr1-generator';
import { Gstr3bGenerator } from './gstr3b-generator';
import { Gstr2bReconciliationService } from './gstr2b-reconciliation';
import { validateGstr1 } from './gstr1-validator';
import { createGspClient } from './gsp-client';
import type { GspAuthToken, GspClient } from './gsp-client';
import { NotFoundError, ConflictError } from '../../utils/errors';

type GstReturn = typeof gstReturns.$inferSelect;

interface TenantGstProfile {
  gstin: string;
  stateCode: string;
  gstUsername: string;
}

export class GstReturnService {
  private gsp: GspClient;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.gsp = createGspClient();
  }

  // ── List returns ─────────────────────────────────────────────────────

  async list(filters?: { returnType?: string; status?: string }): Promise<GstReturn[]> {
    const conditions = [eq(gstReturns.tenantId, this.tenantId)];
    if (filters?.returnType) {
      conditions.push(eq(gstReturns.returnType, filters.returnType as 'gstr1' | 'gstr3b'));
    }

    return this.db
      .select()
      .from(gstReturns)
      .where(and(...conditions))
      .orderBy(desc(gstReturns.period));
  }

  // ── Delete return (only drafts/errors, not filed) ────────────────────

  async delete(id: string): Promise<void> {
    const ret = await this.getById(id);
    if (ret.status === 'filed') {
      throw new ConflictError('Cannot delete a filed return. Filed returns require amendments.');
    }
    // Cascade will clean up gst_return_invoices
    await this.db.delete(gstReturns).where(eq(gstReturns.id, id));
  }

  // ── Get single return ────────────────────────────────────────────────

  async getById(id: string): Promise<GstReturn> {
    const [row] = await this.db
      .select()
      .from(gstReturns)
      .where(and(eq(gstReturns.id, id), eq(gstReturns.tenantId, this.tenantId)));
    if (!row) throw new NotFoundError('GST Return');
    return row;
  }

  // ── Generate GSTR-1 draft ────────────────────────────────────────────

  async generateGstr1(period: string): Promise<GstReturn> {
    const profile = await this.getTenantGstProfile();
    const { periodStart, periodEnd } = this.periodToDateRange(period);

    // Check for existing draft
    const [existing] = await this.db
      .select()
      .from(gstReturns)
      .where(and(
        eq(gstReturns.tenantId, this.tenantId),
        eq(gstReturns.returnType, 'gstr1'),
        eq(gstReturns.period, period),
      ));

    if (existing && existing.status === 'filed') {
      throw new ConflictError(`GSTR-1 for period ${period} is already filed`);
    }

    const generator = new Gstr1Generator(this.db, this.tenantId);
    const { data, classifiedInvoices, classifiedCreditNotes } = await generator.generate(
      periodStart, periodEnd, profile,
    );

    if (existing) {
      // Update existing draft. Clear errorDetails so stale validation errors
      // from a previous run don't linger after the user regenerates.
      const [updated] = await this.db
        .update(gstReturns)
        .set({ data, status: 'draft', errorDetails: null, updatedAt: new Date() })
        .where(eq(gstReturns.id, existing.id))
        .returning();

      // Replace invoice links
      await this.db.delete(gstReturnInvoices).where(eq(gstReturnInvoices.returnId, existing.id));
      await this.insertReturnInvoiceLinks(existing.id, classifiedInvoices, classifiedCreditNotes);

      return updated;
    }

    // Create new return
    const [created] = await this.db
      .insert(gstReturns)
      .values({
        tenantId: this.tenantId,
        gstin: profile.gstin,
        returnType: 'gstr1',
        period,
        status: 'draft',
        data,
      })
      .returning();

    await this.insertReturnInvoiceLinks(created.id, classifiedInvoices, classifiedCreditNotes);
    return created;
  }

  // ── Generate GSTR-3B draft ──────────────────────────────────────────

  async generateGstr3b(period: string): Promise<GstReturn> {
    const profile = await this.getTenantGstProfile();
    const { periodStart, periodEnd } = this.periodToDateRange(period);

    // Check for existing
    const [existing] = await this.db
      .select()
      .from(gstReturns)
      .where(and(
        eq(gstReturns.tenantId, this.tenantId),
        eq(gstReturns.returnType, 'gstr3b'),
        eq(gstReturns.period, period),
      ));

    if (existing && existing.status === 'filed') {
      throw new ConflictError(`GSTR-3B for period ${period} is already filed`);
    }

    // Try to use GSTR-1 data if available for this period
    const [gstr1Return] = await this.db
      .select()
      .from(gstReturns)
      .where(and(
        eq(gstReturns.tenantId, this.tenantId),
        eq(gstReturns.returnType, 'gstr1'),
        eq(gstReturns.period, period),
      ));

    const generator = new Gstr3bGenerator(this.db, this.tenantId);
    const gstr1Data = gstr1Return?.data as Gstr1Data | undefined;

    // Try to use stored GSTR-2B data for ITC (Table 4) instead of purchase invoices
    const recon = new Gstr2bReconciliationService(this.db, this.tenantId);
    const itcFrom2b = await recon.computeItcFrom2b(period);

    const data = await generator.generate(periodStart, periodEnd, gstr1Data, itcFrom2b);
    const notes = itcFrom2b
      ? 'ITC (Table 4) auto-populated from GSTR-2B data'
      : 'ITC (Table 4) computed from purchase invoices';

    if (existing) {
      const [updated] = await this.db
        .update(gstReturns)
        .set({ data, notes, status: 'draft', errorDetails: null, updatedAt: new Date() })
        .where(eq(gstReturns.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(gstReturns)
      .values({
        tenantId: this.tenantId,
        gstin: profile.gstin,
        returnType: 'gstr3b',
        period,
        status: 'draft',
        data,
        notes,
      })
      .returning();

    return created;
  }

  // ── Upload GSTR-3B to GSTN ─────────────────────────────────────────

  async upload3b(id: string) {
    const ret = await this.getById(id);
    if (ret.returnType !== 'gstr3b') throw new ConflictError('Not a GSTR-3B return');
    if (ret.status !== 'validated') throw new ConflictError('Return must be validated before upload');

    const profile = await this.getTenantGstProfile();
    const token = await this.getValidToken(ret.gstin);
    const result = await this.gsp.saveGstr3b(token, ret.gstin, profile.gstUsername, ret.period, ret.data as Gstr3bData);

    if (result.success) {
      await this.db
        .update(gstReturns)
        .set({ status: 'uploaded', errorDetails: null, updatedAt: new Date() })
        .where(eq(gstReturns.id, id));
    } else {
      await this.db
        .update(gstReturns)
        .set({ status: 'error', errorDetails: result.errors, updatedAt: new Date() })
        .where(eq(gstReturns.id, id));
    }

    return result;
  }

  // ── Fetch auto-populated 3B from GSTN ──────────────────────────────

  async getAutoPopulated3b(id: string): Promise<Gstr3bData> {
    const ret = await this.getById(id);
    const profile = await this.getTenantGstProfile();
    const token = await this.getValidToken(ret.gstin);
    return this.gsp.getAutoPopulated3b(token, ret.gstin, profile.gstUsername, ret.period);
  }

  // ── Validate ─────────────────────────────────────────────────────────

  async validate(id: string) {
    const ret = await this.getById(id);
    if (!ret.data) throw new ConflictError('Return has no data — generate it first');

    // GSTR-3B is a self-declared summary return — no pre-flight schema validation needed.
    // (GSTN validates the numbers on upload and flags issues via retstatus polling.)
    if (ret.returnType === 'gstr3b') {
      await this.db
        .update(gstReturns)
        .set({ status: 'validated', errorDetails: null, updatedAt: new Date() })
        .where(eq(gstReturns.id, id));
      return { valid: true, errors: [] };
    }

    const errors = validateGstr1(ret.data as Gstr1Data, ret.period);

    if (errors.length === 0) {
      await this.db
        .update(gstReturns)
        .set({ status: 'validated', errorDetails: null, updatedAt: new Date() })
        .where(eq(gstReturns.id, id));
    } else {
      const mapped = errors.map((e) => ({
        code: `${e.section}.${e.field}`,
        message: e.message,
        section: e.section,
      }));
      await this.db
        .update(gstReturns)
        .set({ status: 'draft', errorDetails: mapped, updatedAt: new Date() })
        .where(eq(gstReturns.id, id));
    }

    return { valid: errors.length === 0, errors };
  }

  // ── GSP Auth ─────────────────────────────────────────────────────────

  async requestOtp(gstin: string, username: string) {
    return this.gsp.requestOtp(gstin, username);
  }

  /**
   * Force-logout: try logging out the most recent cached session, then delete
   * cached tokens for this tenant+GSTIN. Useful when "max sessions" error blocks
   * a fresh OTP request.
   */
  async forceLogout(gstin: string, username: string): Promise<{ success: boolean; message: string }> {
    const [cached] = await this.db
      .select()
      .from(gspAuthTokens)
      .where(and(
        eq(gspAuthTokens.tenantId, this.tenantId),
        eq(gspAuthTokens.gstin, gstin),
      ))
      .orderBy(desc(gspAuthTokens.createdAt))
      .limit(1);

    let result = { success: true, message: 'No cached session to log out' };
    if (cached?.txn) {
      try {
        result = await this.gsp.logout(gstin, username, cached.txn);
      } catch (e: any) {
        result = { success: false, message: e?.message ?? 'Logout call failed' };
      }
    }

    // Always clear local cache regardless of remote result
    await this.db
      .delete(gspAuthTokens)
      .where(and(
        eq(gspAuthTokens.tenantId, this.tenantId),
        eq(gspAuthTokens.gstin, gstin),
      ));

    return result;
  }

  async verifyOtp(gstin: string, username: string, otp: string, txn: string) {
    const token = await this.gsp.verifyOtp(gstin, username, otp, txn);

    // Cache the token
    await this.db
      .insert(gspAuthTokens)
      .values({
        tenantId: this.tenantId,
        gstin,
        gspProvider: this.gsp.provider,
        accessToken: token.accessToken,
        txn: token.txn,
        expiresAt: token.expiresAt,
      });

    return token;
  }

  // ── Upload to GSTN ───────────────────────────────────────────────────

  async upload(id: string) {
    const ret = await this.getById(id);
    if (ret.status !== 'validated') {
      throw new ConflictError('Return must be validated before upload');
    }

    const profile = await this.getTenantGstProfile();
    const token = await this.getValidToken(ret.gstin);
    const result = await this.gsp.uploadGstr1(token, ret.gstin, profile.gstUsername, ret.period, ret.data as Gstr1Data);

    if (result.success) {
      await this.db
        .update(gstReturns)
        .set({ status: 'uploaded', errorDetails: null, updatedAt: new Date() })
        .where(eq(gstReturns.id, id));
    } else {
      await this.db
        .update(gstReturns)
        .set({ status: 'error', errorDetails: result.errors, updatedAt: new Date() })
        .where(eq(gstReturns.id, id));
    }

    return result;
  }

  // ── Get GSTN summary ─────────────────────────────────────────────────

  /** Build the GSTN-wire-format JSON payload for a GSTR-1 return so the
   *  user can download it and upload to GST portal directly (bypass GSP). */
  async getGstr1UploadPayload(id: string): Promise<{ payload: unknown; gstin: string; period: string }> {
    const ret = await this.getById(id);
    if (ret.returnType !== 'gstr1') throw new ConflictError('Only GSTR-1 supports JSON download');
    if (!ret.data) throw new ConflictError('Return has no data — generate first');
    const client = new WhiteBooksGspClient();
    const payload = client.transformGstr1ForUpload(ret.gstin, ret.period, ret.data as Gstr1Data);
    return { payload, gstin: ret.gstin, period: ret.period };
  }

  /** Return the invoice line items that aggregated into one HSN+rate row
   *  of the GSTR-1 HSN summary. Lets users drill down to verify groupings. */
  async getHsnBreakdown(id: string, hsn: string, rate: number) {
    const ret = await this.getById(id);
    const period = ret.period; // MMYYYY
    const month = period.slice(0, 2);
    const year = period.slice(2);
    const periodStart = `${year}-${month}-01`;
    const periodEnd = new Date(Number(year), Number(month), 0).toISOString().slice(0, 10);

    const rows = await this.db
      .select({
        lineId: salesInvoiceItems.id,
        description: salesInvoiceItems.description,
        quantity: salesInvoiceItems.quantity,
        unitPrice: salesInvoiceItems.unitPrice,
        amount: salesInvoiceItems.amount,
        uom: salesInvoiceItems.uom,
        packSizeValue: salesInvoiceItems.packSizeValue,
        packSizeUqc: salesInvoiceItems.packSizeUqc,
        cgstAmount: salesInvoiceItems.cgstAmount,
        sgstAmount: salesInvoiceItems.sgstAmount,
        igstAmount: salesInvoiceItems.igstAmount,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
        customerName: customers.name,
      })
      .from(salesInvoiceItems)
      .innerJoin(salesInvoices, eq(salesInvoices.id, salesInvoiceItems.invoiceId))
      .leftJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(and(
        eq(salesInvoiceItems.tenantId, this.tenantId),
        eq(salesInvoiceItems.hsnSacCode, hsn),
        eq(salesInvoiceItems.taxRate, String(rate)),
        gte(salesInvoices.invoiceDate, periodStart),
        lte(salesInvoices.invoiceDate, periodEnd),
        inArray(salesInvoices.status, ['sent', 'partially_paid', 'paid', 'overdue']),
      ));

    return rows;
  }

  async getGstnSummary(id: string) {
    const ret = await this.getById(id);
    const profile = await this.getTenantGstProfile();
    const token = await this.getValidToken(ret.gstin);
    return this.gsp.getGstr1Summary(token, ret.gstin, profile.gstUsername, ret.period);
  }

  // ── File with EVC ────────────────────────────────────────────────────

  async file(id: string, evc: string, userId: string) {
    const ret = await this.getById(id);
    if (ret.status !== 'uploaded') {
      throw new ConflictError('Return must be uploaded before filing');
    }

    const profile = await this.getTenantGstProfile();
    const token = await this.getValidToken(ret.gstin);
    const result = ret.returnType === 'gstr1'
      ? await this.gsp.fileGstr1(token, ret.gstin, profile.gstUsername, ret.period, evc)
      : await this.gsp.fileGstr3b(token, ret.gstin, profile.gstUsername, ret.period, evc);

    if (result.success) {
      await this.db
        .update(gstReturns)
        .set({
          status: 'filed',
          arn: result.arn,
          filedAt: new Date(),
          filedBy: userId,
          errorDetails: null,
          updatedAt: new Date(),
        })
        .where(eq(gstReturns.id, id));
    } else {
      // Filing failed — keep status as 'uploaded' so user can retry filing
      // without having to re-upload. Only record the errors.
      await this.db
        .update(gstReturns)
        .set({ errorDetails: result.errors, updatedAt: new Date() })
        .where(eq(gstReturns.id, id));
    }

    return result;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async getTenantGstProfile(): Promise<TenantGstProfile> {
    const [tenant] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId));

    const s = tenant?.settings as Record<string, unknown> | undefined;
    const gstin = (s?.gstin as string) || '';
    const stateCode = (s?.stateCode as string) || '';
    const gstUsername = (s?.gstUsername as string) || '';

    if (!gstin) throw new ConflictError('Company GSTIN not configured in settings');
    if (!stateCode) throw new ConflictError('Company state code not configured in settings');

    return { gstin, stateCode, gstUsername };
  }

  /** Public accessor for cached token — used by the 2B reconciliation service */
  async getValidTokenForGstin(gstin: string): Promise<GspAuthToken> {
    return this.getValidToken(gstin);
  }

  private async getValidToken(gstin: string): Promise<GspAuthToken> {
    const [cached] = await this.db
      .select()
      .from(gspAuthTokens)
      .where(and(
        eq(gspAuthTokens.tenantId, this.tenantId),
        eq(gspAuthTokens.gstin, gstin),
      ))
      .orderBy(desc(gspAuthTokens.createdAt))
      .limit(1);

    if (cached && new Date(cached.expiresAt) > new Date()) {
      return { accessToken: cached.accessToken, txn: cached.txn || '', expiresAt: new Date(cached.expiresAt) };
    }

    throw new ConflictError('GST portal session expired. Please authenticate again with OTP.');
  }

  private async insertReturnInvoiceLinks(
    returnId: string,
    invoices: Array<{ invoiceId: string; section: string }>,
    creditNotes: Array<{ creditNoteId: string; section: string }>,
  ): Promise<void> {
    const rows = [
      ...invoices.map((i) => ({
        tenantId: this.tenantId,
        returnId,
        invoiceId: i.invoiceId,
        section: i.section as 'b2b' | 'b2cs' | 'b2cl' | 'exp' | 'nil' | 'cdn',
      })),
      ...creditNotes.map((cn) => ({
        tenantId: this.tenantId,
        returnId,
        creditNoteId: cn.creditNoteId,
        section: cn.section as 'cdn',
      })),
    ];

    if (rows.length > 0) {
      await this.db.insert(gstReturnInvoices).values(rows);
    }
  }

  /** Convert MMYYYY to date range: { periodStart: YYYY-MM-01, periodEnd: YYYY-MM-lastDay } */
  private periodToDateRange(period: string): { periodStart: string; periodEnd: string } {
    const month = parseInt(period.substring(0, 2), 10);
    const year = parseInt(period.substring(2), 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0); // last day of month
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { periodStart: fmt(start), periodEnd: fmt(end) };
  }
}

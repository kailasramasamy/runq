import { createHmac, randomBytes } from 'node:crypto';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import {
  tenants,
  accounts,
  journalEntries,
  journalLines,
  salesInvoices,
  purchaseInvoices,
  vendors,
  customers,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';
import { ReportsService } from '../reports/reports.service';
import { TallyService } from '../tally/tally.service';
import { toNumber } from '../../utils/decimal';

const CA_SECRET = process.env.CA_PORTAL_SECRET || process.env.JWT_SECRET || 'ca-portal-secret';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CAPayload {
  tenantId: string;
  purpose: 'ca_portal';
  exp: number;
}

function signPayload(payload: CAPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', CA_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyCAToken(token: string): CAPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new UnauthorizedError('Invalid CA portal token');
  const [data, sig] = parts;
  const expected = createHmac('sha256', CA_SECRET).update(data!).digest('base64url');
  if (sig !== expected) throw new UnauthorizedError('Invalid CA portal token');

  const payload = JSON.parse(Buffer.from(data!, 'base64url').toString()) as CAPayload;
  if (Date.now() > payload.exp) throw new UnauthorizedError('CA portal token expired');
  return payload;
}

export class CAPortalService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // --- Token & Slug Management ---

  generateToken(): string {
    return signPayload({
      tenantId: this.tenantId,
      purpose: 'ca_portal',
      exp: Date.now() + TOKEN_TTL_MS,
    });
  }

  async getOrCreateSlug(): Promise<string> {
    const [row] = await this.db.select({ settings: tenants.settings })
      .from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!row) throw new NotFoundError('Tenant');

    const settings = (row.settings ?? {}) as Record<string, unknown>;
    if (settings.caPortalSlug) return settings.caPortalSlug as string;

    const slug = randomBytes(6).toString('hex');
    await this.db.update(tenants).set({
      settings: { ...settings, caPortalSlug: slug },
      updatedAt: new Date(),
    }).where(eq(tenants.id, this.tenantId));

    return slug;
  }

  async resolveSlug(slug: string): Promise<string> {
    const rows = await this.db.select({ id: tenants.id, settings: tenants.settings })
      .from(tenants);

    for (const row of rows) {
      const s = (row.settings ?? {}) as Record<string, unknown>;
      if (s.caPortalSlug === slug) return row.id;
    }
    throw new NotFoundError('CA portal link');
  }

  async getCompanyInfo(): Promise<{ name: string; gstin?: string; address?: string }> {
    const [row] = await this.db.select({ name: tenants.name, settings: tenants.settings })
      .from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    if (!row) throw new NotFoundError('Tenant');
    const s = (row.settings ?? {}) as Partial<TenantSettings>;
    return {
      name: row.name,
      gstin: s.gstin,
      address: [s.addressLine1, s.addressLine2, s.city, s.state, s.pincode].filter(Boolean).join(', '),
    };
  }

  // --- Reports ---

  async getProfitAndLoss(dateFrom: string, dateTo: string) {
    const svc = new ReportsService(this.db, this.tenantId);
    return svc.getProfitAndLoss(dateFrom, dateTo);
  }

  async getBalanceSheet(asOfDate?: string) {
    const svc = new ReportsService(this.db, this.tenantId);
    return svc.getBalanceSheet(asOfDate);
  }

  async getCashFlow(dateFrom: string, dateTo: string) {
    const svc = new ReportsService(this.db, this.tenantId);
    return svc.getCashFlowStatement(dateFrom, dateTo);
  }

  // --- Trial Balance ---

  async getTrialBalance(asOfDate?: string) {
    const date = asOfDate || new Date().toISOString().slice(0, 10);

    const rows = await this.db
      .select({
        code: accounts.code,
        name: accounts.name,
        type: accounts.type,
        balance: sql<string>`coalesce(sum(
          case when ${journalEntries.entryDate} <= ${date}
          then ${journalLines.debitAmount} - ${journalLines.creditAmount}
          else 0 end
        ), 0)`,
      })
      .from(accounts)
      .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
      .leftJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.isActive, true)))
      .groupBy(accounts.code, accounts.name, accounts.type)
      .orderBy(accounts.code);

    let totalDebit = 0;
    let totalCredit = 0;
    const data = rows.map((r) => {
      const bal = Number(r.balance);
      const debit = bal > 0 ? bal : 0;
      const credit = bal < 0 ? Math.abs(bal) : 0;
      totalDebit += debit;
      totalCredit += credit;
      return { code: r.code, name: r.name, type: r.type, debit, credit };
    }).filter((r) => r.debit !== 0 || r.credit !== 0);

    return { asOfDate: date, accounts: data, totalDebit, totalCredit };
  }

  // --- Journal Entries ---

  async getJournalEntries(dateFrom: string, dateTo: string) {
    const entries = await this.db
      .select({
        id: journalEntries.id,
        entryNumber: journalEntries.entryNumber,
        entryDate: journalEntries.entryDate,
        narration: journalEntries.narration,
        status: journalEntries.status,
      })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        gte(journalEntries.entryDate, dateFrom),
        lte(journalEntries.entryDate, dateTo),
      ))
      .orderBy(desc(journalEntries.entryDate));

    return Promise.all(entries.map(async (e) => {
      const lines = await this.db
        .select({
          accountCode: accounts.code,
          accountName: accounts.name,
          debit: journalLines.debitAmount,
          credit: journalLines.creditAmount,
        })
        .from(journalLines)
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(eq(journalLines.journalEntryId, e.id));

      return {
        ...e,
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: toNumber(l.debit),
          credit: toNumber(l.credit),
        })),
      };
    }));
  }

  // --- Invoice Registers ---

  async getSalesRegister(dateFrom: string, dateTo: string) {
    const rows = await this.db
      .select({
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
        customerName: customers.name,
        totalAmount: salesInvoices.totalAmount,
        taxAmount: salesInvoices.taxAmount,
        balanceDue: salesInvoices.balanceDue,
        status: salesInvoices.status,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(
        eq(salesInvoices.tenantId, this.tenantId),
        gte(salesInvoices.invoiceDate, dateFrom),
        lte(salesInvoices.invoiceDate, dateTo),
      ))
      .orderBy(desc(salesInvoices.invoiceDate));

    return rows.map((r) => ({
      ...r,
      totalAmount: toNumber(r.totalAmount),
      taxAmount: toNumber(r.taxAmount),
      balanceDue: toNumber(r.balanceDue),
    }));
  }

  async getPurchaseRegister(dateFrom: string, dateTo: string) {
    const rows = await this.db
      .select({
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        vendorName: vendors.name,
        totalAmount: purchaseInvoices.totalAmount,
        taxAmount: purchaseInvoices.taxAmount,
        balanceDue: purchaseInvoices.balanceDue,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(and(
        eq(purchaseInvoices.tenantId, this.tenantId),
        gte(purchaseInvoices.invoiceDate, dateFrom),
        lte(purchaseInvoices.invoiceDate, dateTo),
      ))
      .orderBy(desc(purchaseInvoices.invoiceDate));

    return rows.map((r) => ({
      ...r,
      totalAmount: toNumber(r.totalAmount),
      taxAmount: toNumber(r.taxAmount),
      balanceDue: toNumber(r.balanceDue),
    }));
  }

  // --- Tally Export ---

  async exportTallyVouchers(dateFrom: string, dateTo: string): Promise<string> {
    const svc = new TallyService(this.db, this.tenantId);
    return svc.exportVouchers(dateFrom, dateTo);
  }

  async exportTallyLedgers(): Promise<string> {
    const svc = new TallyService(this.db, this.tenantId);
    return svc.exportLedgerMasters();
  }
}

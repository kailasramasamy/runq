import { eq, and, sql, lte, sum } from 'drizzle-orm';
import { accounts, journalEntries, journalLines, journalSequences } from '@runq/db';
import type { Db } from '@runq/db';
import type { Account, JournalEntry, JournalEntryWithLines, TrialBalanceRow } from '@runq/types';
import type { CreateAccountInput, CreateJournalEntryInput, JournalEntryFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

export interface JournalEntryListResult {
  data: JournalEntry[];
  meta: PaginationMeta;
}

export class GLService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async listAccounts(): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.tenantId, this.tenantId))
      .orderBy(accounts.code);
    return rows.map(this.toAccount);
  }

  async createAccount(data: CreateAccountInput): Promise<Account> {
    const parentId = await this.resolveParentId(data.parentId);

    const [row] = await this.db
      .insert(accounts)
      .values({
        tenantId: this.tenantId,
        code: data.code,
        name: data.name,
        type: data.type,
        parentId: parentId ?? null,
        description: data.description ?? null,
      })
      .returning();

    return this.toAccount(row!);
  }

  async createJournalEntry(params: CreateJournalEntryInput & { createdBy?: string }): Promise<JournalEntry> {
    this.validateLines(params.lines);

    return this.db.transaction(async (tx) => {
      const accountMap = await this.resolveAccountCodes(tx, params.lines.map((l) => l.accountCode));
      const entryNumber = await this.nextEntryNumber(tx);
      const totalDebit = params.lines.reduce((s, l) => s + (l.debit ?? 0), 0);

      const [entry] = await tx
        .insert(journalEntries)
        .values({
          tenantId: this.tenantId,
          entryNumber,
          date: params.date,
          description: params.description,
          sourceType: params.sourceType ?? null,
          sourceId: params.sourceId ?? null,
          totalDebit: String(totalDebit),
          totalCredit: String(totalDebit), // balanced by validation
          createdBy: params.createdBy ?? null,
        })
        .returning();

      await tx.insert(journalLines).values(
        params.lines.map((l) => ({
          tenantId: this.tenantId,
          journalEntryId: entry!.id,
          accountId: accountMap.get(l.accountCode)!,
          debit: String(l.debit ?? 0),
          credit: String(l.credit ?? 0),
          description: l.description ?? null,
        })),
      );

      return this.toJournalEntry(entry!);
    });
  }

  async getJournalEntry(id: string): Promise<JournalEntryWithLines> {
    const [entry] = await this.db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.tenantId, this.tenantId)))
      .limit(1);

    if (!entry) throw new NotFoundError('JournalEntry');

    const lines = await this.db
      .select({ line: journalLines, account: accounts })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(and(eq(journalLines.journalEntryId, id), eq(journalLines.tenantId, this.tenantId)));

    return {
      ...this.toJournalEntry(entry),
      lines: lines.map((r) => ({
        id: r.line.id,
        accountId: r.line.accountId,
        accountCode: r.account.code,
        accountName: r.account.name,
        debit: toNumber(r.line.debit),
        credit: toNumber(r.line.credit),
        description: r.line.description ?? null,
      })),
    };
  }

  async listJournalEntries(
    filters: JournalEntryFilter,
    pagination: { page: number; limit: number },
  ): Promise<JournalEntryListResult> {
    const { offset } = applyPagination(pagination.page, pagination.limit);
    const where = this.buildJeWhere(filters);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(journalEntries).where(where).orderBy(journalEntries.date).limit(pagination.limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(journalEntries).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(this.toJournalEntry),
      meta: { page: pagination.page, limit: pagination.limit, total, totalPages: calcTotalPages(total, pagination.limit) },
    };
  }

  async getAccountBalance(accountId: string, asOfDate?: string): Promise<number> {
    const [acct] = await this.db.select({ type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, this.tenantId)))
      .limit(1);

    if (!acct) throw new NotFoundError('Account');

    const where = asOfDate
      ? and(eq(journalLines.accountId, accountId), lte(journalEntries.date, asOfDate))
      : eq(journalLines.accountId, accountId);

    const [result] = await this.db
      .select({ totalDebit: sum(journalLines.debit), totalCredit: sum(journalLines.credit) })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(where);

    const dr = toNumber(result?.totalDebit ?? '0');
    const cr = toNumber(result?.totalCredit ?? '0');
    const isDebitNormal = acct.type === 'asset' || acct.type === 'expense';
    return isDebitNormal ? dr - cr : cr - dr;
  }

  async getTrialBalance(asOfDate?: string): Promise<TrialBalanceRow[]> {
    const where = asOfDate ? lte(journalEntries.date, asOfDate) : undefined;

    const rows = await this.db
      .select({
        accountId: accounts.id,
        accountCode: accounts.code,
        accountName: accounts.name,
        accountType: accounts.type,
        totalDebit: sum(journalLines.debit),
        totalCredit: sum(journalLines.credit),
      })
      .from(accounts)
      .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
      .leftJoin(journalEntries, and(eq(journalLines.journalEntryId, journalEntries.id), ...(where ? [where] : [])))
      .where(eq(accounts.tenantId, this.tenantId))
      .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
      .orderBy(accounts.code);

    return rows.map((r) => {
      const dr = toNumber(r.totalDebit ?? '0');
      const cr = toNumber(r.totalCredit ?? '0');
      const isDebitNormal = r.accountType === 'asset' || r.accountType === 'expense';
      const balance = isDebitNormal ? dr - cr : cr - dr;
      return { accountCode: r.accountCode, accountName: r.accountName, accountType: r.accountType, debit: dr, credit: cr, balance };
    });
  }

  // ─── Auto-posting helpers ────────────────────────────────────────────────

  async postPayment(payment: { amount: number; date: string; id: string; vendorName: string }): Promise<void> {
    await this.createJournalEntry({
      date: payment.date,
      description: `Payment to ${payment.vendorName}`,
      sourceType: 'payment',
      sourceId: payment.id,
      lines: [
        { accountCode: '2101', debit: payment.amount },
        { accountCode: '1101', credit: payment.amount },
      ],
    });
  }

  async postReceipt(receipt: { amount: number; date: string; id: string; customerName: string }): Promise<void> {
    await this.createJournalEntry({
      date: receipt.date,
      description: `Receipt from ${receipt.customerName}`,
      sourceType: 'receipt',
      sourceId: receipt.id,
      lines: [
        { accountCode: '1101', debit: receipt.amount },
        { accountCode: '1103', credit: receipt.amount },
      ],
    });
  }

  async postPurchaseInvoice(invoice: { totalAmount: number; date: string; id: string; vendorName: string }): Promise<void> {
    await this.createJournalEntry({
      date: invoice.date,
      description: `Purchase invoice from ${invoice.vendorName}`,
      sourceType: 'purchase_invoice',
      sourceId: invoice.id,
      lines: [
        { accountCode: '5002', debit: invoice.totalAmount },
        { accountCode: '2101', credit: invoice.totalAmount },
      ],
    });
  }

  async postSalesInvoice(invoice: { totalAmount: number; date: string; id: string; customerName: string }): Promise<void> {
    await this.createJournalEntry({
      date: invoice.date,
      description: `Sales invoice to ${invoice.customerName}`,
      sourceType: 'sales_invoice',
      sourceId: invoice.id,
      lines: [
        { accountCode: '1103', debit: invoice.totalAmount },
        { accountCode: '4001', credit: invoice.totalAmount },
      ],
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private validateLines(lines: CreateJournalEntryInput['lines']): void {
    if (lines.length < 2) throw new ConflictError('Journal entry requires at least 2 lines');

    const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new ConflictError(`Journal entry is not balanced: debits ${totalDebit} ≠ credits ${totalCredit}`);
    }
  }

  private async resolveAccountCodes(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    codes: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(codes)];
    const rows = await tx
      .select({ id: accounts.id, code: accounts.code })
      .from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), sql`${accounts.code} = ANY(${unique})`));

    const missing = unique.filter((c) => !rows.find((r: { code: string }) => r.code === c));
    if (missing.length > 0) throw new ConflictError(`Account codes not found: ${missing.join(', ')}`);

    return new Map(rows.map((r: { code: string; id: string }) => [r.code, r.id]));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async nextEntryNumber(tx: any): Promise<string> {
    const fy = this.getCurrentFY();
    const [seqRow] = await tx
      .insert(journalSequences)
      .values({ tenantId: this.tenantId, financialYear: fy, lastSequence: 1 })
      .onConflictDoUpdate({
        target: [journalSequences.tenantId, journalSequences.financialYear],
        set: { lastSequence: sql`${journalSequences.lastSequence} + 1`, updatedAt: new Date() },
      })
      .returning();

    const seq = String(seqRow!.lastSequence).padStart(4, '0');
    return `JE-${fy}-${seq}`;
  }

  private getCurrentFY(): string {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-based
    const year = now.getFullYear();
    // Indian FY: April to March
    const startYear = month >= 4 ? year : year - 1;
    const endYear = startYear + 1;
    return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
  }

  private async resolveParentId(parentId?: string | null): Promise<string | null> {
    if (!parentId) return null;
    const [row] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, parentId), eq(accounts.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Parent account');
    return row.id;
  }

  private buildJeWhere(filters: JournalEntryFilter) {
    const clauses = [eq(journalEntries.tenantId, this.tenantId)];
    if (filters.dateFrom) clauses.push(sql`${journalEntries.date} >= ${filters.dateFrom}`);
    if (filters.dateTo) clauses.push(sql`${journalEntries.date} <= ${filters.dateTo}`);
    if (filters.sourceType) clauses.push(eq(journalEntries.sourceType, filters.sourceType));
    return and(...clauses);
  }

  private toAccount(row: typeof accounts.$inferSelect): Account {
    return {
      id: row.id,
      tenantId: row.tenantId,
      code: row.code,
      name: row.name,
      type: row.type,
      parentId: row.parentId ?? null,
      isActive: row.isActive,
      isSystemAccount: row.isSystemAccount,
      description: row.description ?? null,
    };
  }

  private toJournalEntry(row: typeof journalEntries.$inferSelect): JournalEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      entryNumber: row.entryNumber,
      date: row.date,
      description: row.description,
      status: row.status,
      sourceType: row.sourceType ?? null,
      sourceId: row.sourceId ?? null,
      totalDebit: toNumber(row.totalDebit),
      totalCredit: toNumber(row.totalCredit),
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { bankTransactions, bankAccounts, accounts, cheques } from '@runq/db';
import type { Db } from '@runq/db';
import type { BankTransaction, BankStatementImportResult, PaginationMeta } from '@runq/types';
import type { TransactionFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { randomUUID } from 'crypto';
import { getBankFeedProvider } from '../../utils/banking';

export interface TransactionListParams {
  page: number;
  limit: number;
  filters: TransactionFilter;
}

export interface TransactionListResult {
  data: BankTransaction[];
  meta: PaginationMeta;
}

interface ParsedRow {
  transactionDate: string;
  valueDate?: string;
  type: 'credit' | 'debit';
  amount: number;
  reference: string | null;
  narration: string | null;
  runningBalance: number | null;
}

export class TransactionService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(bankAccountId: string, params: TransactionListParams): Promise<TransactionListResult> {
    const { page, limit, filters } = params;
    const { offset } = applyPagination(page, limit);

    const conditions = [
      eq(bankTransactions.tenantId, this.tenantId),
      eq(bankTransactions.bankAccountId, bankAccountId),
      filters.type ? eq(bankTransactions.type, filters.type) : undefined,
      filters.reconciled !== undefined
        ? filters.reconciled
          ? sql`${bankTransactions.reconStatus} != 'unreconciled'`
          : eq(bankTransactions.reconStatus, 'unreconciled')
        : undefined,
      filters.dateFrom ? gte(bankTransactions.transactionDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(bankTransactions.transactionDate, filters.dateTo) : undefined,
      filters.minAmount ? sql`${bankTransactions.amount}::numeric >= ${filters.minAmount}` : undefined,
    ];

    const baseWhere = and(...conditions.filter(Boolean) as Parameters<typeof and>);

    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          txn: bankTransactions,
          glAccountCode: accounts.code,
          glAccountName: accounts.name,
        })
        .from(bankTransactions)
        .leftJoin(accounts, eq(bankTransactions.glAccountId, accounts.id))
        .where(baseWhere)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(bankTransactions).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toTransaction(r.txn, r.glAccountCode, r.glAccountName)),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async importCSV(bankAccountId: string, csvData: string): Promise<BankStatementImportResult> {
    const [account] = await this.db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!account) throw new NotFoundError('Bank account');

    const { rows, errors } = this.parseCSV(csvData);
    const importBatchId = randomUUID();
    let imported = 0;
    let duplicatesSkipped = 0;
    let lastBalance: number | null = null;

    for (const row of rows) {
      const isDuplicate = await this.checkDuplicate(bankAccountId, row);
      if (isDuplicate) {
        duplicatesSkipped++;
        continue;
      }

      await this.insertTransaction(bankAccountId, row, importBatchId);

      imported++;
      if (row.runningBalance !== null) lastBalance = row.runningBalance;
    }

    if (lastBalance !== null) {
      await this.updateAccountBalance(bankAccountId, lastBalance);
    }

    await this.autoClearCheques(bankAccountId);

    return { imported, duplicatesSkipped, errors };
  }

  async syncFromFeed(bankAccountId: string): Promise<{ imported: number; duplicatesSkipped: number }> {
    const [account] = await this.db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!account) throw new NotFoundError('Bank account');

    const provider = getBankFeedProvider();
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const feedTxns = await provider.fetchTransactions(bankAccountId, fromDate, toDate);

    const importBatchId = randomUUID();
    let imported = 0;
    let duplicatesSkipped = 0;
    let lastBalance: number | null = null;

    for (const txn of feedTxns) {
      const row: ParsedRow = {
        transactionDate: txn.transactionDate,
        valueDate: txn.valueDate ?? undefined,
        type: txn.type,
        amount: txn.amount,
        reference: txn.reference,
        narration: txn.narration,
        runningBalance: txn.runningBalance,
      };

      const isDuplicate = await this.checkDuplicate(bankAccountId, row);
      if (isDuplicate) { duplicatesSkipped++; continue; }

      await this.insertTransaction(bankAccountId, row, importBatchId);
      imported++;
      if (row.runningBalance !== null) lastBalance = row.runningBalance;
    }

    if (lastBalance !== null) {
      await this.updateAccountBalance(bankAccountId, lastBalance);
    }

    await this.autoClearCheques(bankAccountId);

    return { imported, duplicatesSkipped };
  }

  /**
   * Match deposited cheques against credit bank transactions by amount + date range.
   * If a credit transaction matches a deposited cheque's amount (within the cheque date
   * to cheque date + 30 days window), auto-clear the cheque.
   */
  private async autoClearCheques(bankAccountId: string): Promise<void> {
    const depositedCheques = await this.db
      .select()
      .from(cheques)
      .where(
        and(
          eq(cheques.tenantId, this.tenantId),
          eq(cheques.bankAccountId, bankAccountId),
          eq(cheques.status, 'deposited'),
        ),
      );

    if (depositedCheques.length === 0) return;

    for (const cheque of depositedCheques) {
      const chequeAmount = parseFloat(cheque.amount);
      const fromDate = cheque.chequeDate;
      const toDate = new Date(new Date(cheque.chequeDate).getTime() + 30 * 86400_000)
        .toISOString().slice(0, 10);

      const [matchingTxn] = await this.db
        .select({ id: bankTransactions.id })
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.tenantId, this.tenantId),
            eq(bankTransactions.bankAccountId, bankAccountId),
            eq(bankTransactions.type, 'credit'),
            sql`ABS(${bankTransactions.amount}::numeric - ${chequeAmount}) < 0.01`,
            gte(bankTransactions.transactionDate, fromDate),
            lte(bankTransactions.transactionDate, toDate),
          ),
        )
        .limit(1);

      if (matchingTxn) {
        await this.db
          .update(cheques)
          .set({ status: 'cleared', updatedAt: new Date() })
          .where(eq(cheques.id, cheque.id));
      }
    }
  }

  private async insertTransaction(bankAccountId: string, row: ParsedRow, importBatchId: string): Promise<void> {
    await this.db.insert(bankTransactions).values({
      tenantId: this.tenantId,
      bankAccountId,
      transactionDate: row.transactionDate,
      valueDate: row.valueDate ?? null,
      type: row.type,
      amount: row.amount.toString(),
      reference: row.reference,
      narration: row.narration,
      runningBalance: row.runningBalance?.toString() ?? null,
      reconStatus: 'unreconciled',
      importBatchId,
    });
  }

  private async updateAccountBalance(bankAccountId: string, balance: number): Promise<void> {
    await this.db
      .update(bankAccounts)
      .set({ currentBalance: balance.toString(), updatedAt: new Date() })
      .where(eq(bankAccounts.id, bankAccountId));
  }

  private async checkDuplicate(bankAccountId: string, row: ParsedRow): Promise<boolean> {
    // If UTR/reference is present, it's globally unique — dedup by bankAccountId + reference only
    if (row.reference) {
      const [result] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(bankTransactions)
        .where(and(
          eq(bankTransactions.tenantId, this.tenantId),
          eq(bankTransactions.bankAccountId, bankAccountId),
          eq(bankTransactions.reference, row.reference),
        ));
      return (result?.count ?? 0) > 0;
    }

    // No reference: dedup by date + type + amount + narration to avoid false positives
    const narrationCondition = row.narration
      ? eq(bankTransactions.narration, row.narration)
      : sql`${bankTransactions.narration} IS NULL`;

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.bankAccountId, bankAccountId),
        eq(bankTransactions.transactionDate, row.transactionDate),
        eq(bankTransactions.type, row.type),
        sql`${bankTransactions.amount}::numeric = ${row.amount}`,
        narrationCondition,
      ));

    return (result?.count ?? 0) > 0;
  }

  private parseCSV(csvData: string): { rows: ParsedRow[]; errors: { row: number; message: string }[] } {
    const lines = csvData.split('\n').map((l) => l.trim()).filter(Boolean);
    const errors: { row: number; message: string }[] = [];
    const rows: ParsedRow[] = [];

    if (lines.length < 2) return { rows, errors };

    const headers = lines[0]!.toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''));
    const headerMap = this.detectColumns(headers);

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCSVLine(lines[i]!);
      try {
        const parsed = this.parseRow(cols, headerMap, i + 1);
        if (parsed) rows.push(parsed);
      } catch (err) {
        errors.push({ row: i + 1, message: err instanceof Error ? err.message : 'Parse error' });
      }
    }

    return { rows, errors };
  }

  private detectColumns(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]!;
      if (/date/i.test(h) && !map['date']) map['date'] = i;
      if (/value.*date|val.*dt/i.test(h)) map['valueDate'] = i;
      if (/narration|description|particulars|details/i.test(h)) map['narration'] = i;
      if (/reference|ref|chq|cheque|utr/i.test(h)) map['reference'] = i;
      if (/debit|dr|withdrawal/i.test(h)) map['debit'] = i;
      if (/credit|cr|deposit/i.test(h)) map['credit'] = i;
      if (/balance|bal/i.test(h)) map['balance'] = i;
    }
    return map;
  }

  private parseRow(cols: string[], map: Record<string, number>, rowNum: number): ParsedRow | null {
    const dateStr = cols[map['date'] ?? 0] ?? '';
    if (!dateStr) return null;

    const transactionDate = this.parseDate(dateStr);
    if (!transactionDate) throw new Error(`Invalid date: ${dateStr}`);

    const debitStr = map['debit'] !== undefined ? cols[map['debit']] ?? '' : '';
    const creditStr = map['credit'] !== undefined ? cols[map['credit']] ?? '' : '';
    const debit = parseFloat(debitStr.replace(/[,\s]/g, '')) || 0;
    const credit = parseFloat(creditStr.replace(/[,\s]/g, '')) || 0;

    if (debit === 0 && credit === 0) throw new Error(`Row ${rowNum}: no debit or credit amount`);

    const type: 'credit' | 'debit' = credit > 0 ? 'credit' : 'debit';
    const amount = credit > 0 ? credit : debit;

    const balanceStr = map['balance'] !== undefined ? cols[map['balance']] ?? '' : '';
    const runningBalance = balanceStr ? (parseFloat(balanceStr.replace(/[,\s]/g, '')) || null) : null;
    const valueDateStr = map['valueDate'] !== undefined ? cols[map['valueDate']] ?? '' : '';

    return {
      transactionDate,
      valueDate: valueDateStr ? this.parseDate(valueDateStr) ?? undefined : undefined,
      type,
      amount,
      reference: (map['reference'] !== undefined ? cols[map['reference']]?.trim() || null : null),
      narration: (map['narration'] !== undefined ? cols[map['narration']]?.trim() || null : null),
      runningBalance,
    };
  }

  private parseDate(str: string): string | null {
    const clean = str.trim().replace(/"/g, '');
    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      const year = y!.length === 2 ? `20${y}` : y;
      return `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
    }
    const iso = new Date(clean);
    return isNaN(iso.getTime()) ? null : iso.toISOString().slice(0, 10);
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

  private toTransaction(
    row: typeof bankTransactions.$inferSelect,
    glAccountCode?: string | null,
    glAccountName?: string | null,
  ): BankTransaction {
    return {
      id: row.id,
      tenantId: row.tenantId,
      bankAccountId: row.bankAccountId,
      transactionDate: row.transactionDate,
      valueDate: row.valueDate,
      type: row.type,
      amount: parseFloat(row.amount),
      reference: row.reference,
      narration: row.narration,
      runningBalance: row.runningBalance ? parseFloat(row.runningBalance) : null,
      reconStatus: row.reconStatus,
      importBatchId: row.importBatchId,
      glAccountId: row.glAccountId,
      glAccountCode: glAccountCode ?? null,
      glAccountName: glAccountName ?? null,
      glConfidence: row.glConfidence ? parseFloat(row.glConfidence) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

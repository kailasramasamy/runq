import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { pettyCashAccounts, pettyCashTransactions } from '@runq/db';
import type { Db } from '@runq/db';
import type { PettyCashAccount, PettyCashTransaction, PaginationMeta } from '@runq/types';
import type {
  CreatePettyCashAccountInput,
  UpdatePettyCashAccountInput,
  PettyCashTransactionInput,
} from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface PettyCashListResult {
  data: PettyCashAccount[];
  meta: PaginationMeta;
}

export interface PettyCashTxnListResult {
  data: PettyCashTransaction[];
  meta: PaginationMeta;
}

export interface PettyCashTxnFilters {
  type?: 'expense' | 'replenishment';
  dateFrom?: string;
  dateTo?: string;
}

export class PettyCashService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async listAccounts(page: number, limit: number): Promise<PettyCashListResult> {
    const { offset } = applyPagination(page, limit);
    const where = eq(pettyCashAccounts.tenantId, this.tenantId);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(pettyCashAccounts).where(where).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(pettyCashAccounts).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toAccount(r)),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getAccount(id: string): Promise<PettyCashAccount> {
    const [row] = await this.db
      .select()
      .from(pettyCashAccounts)
      .where(and(eq(pettyCashAccounts.id, id), eq(pettyCashAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Petty cash account');
    return this.toAccount(row);
  }

  async createAccount(input: CreatePettyCashAccountInput): Promise<PettyCashAccount> {
    const [row] = await this.db
      .insert(pettyCashAccounts)
      .values({
        tenantId: this.tenantId,
        name: input.name,
        location: input.location ?? null,
        cashLimit: input.cashLimit.toString(),
        currentBalance: '0',
      })
      .returning();

    return this.toAccount(row!);
  }

  async updateAccount(id: string, input: UpdatePettyCashAccountInput): Promise<PettyCashAccount> {
    const existing = await this.getAccount(id);

    const [row] = await this.db
      .update(pettyCashAccounts)
      .set({
        name: input.name ?? existing.name,
        location: input.location !== undefined ? (input.location ?? null) : existing.location,
        cashLimit: input.cashLimit !== undefined ? input.cashLimit.toString() : existing.cashLimit.toString(),
        updatedAt: new Date(),
      })
      .where(and(eq(pettyCashAccounts.id, id), eq(pettyCashAccounts.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Petty cash account');
    return this.toAccount(row);
  }

  async listTransactions(accountId: string, filters: PettyCashTxnFilters, page: number, limit: number): Promise<PettyCashTxnListResult> {
    await this.getAccount(accountId);
    const { offset } = applyPagination(page, limit);

    const dbType = filters.type ? (filters.type === 'expense' ? 'debit' : 'credit') : undefined;
    const conditions = [
      eq(pettyCashTransactions.accountId, accountId),
      eq(pettyCashTransactions.tenantId, this.tenantId),
      dbType ? eq(pettyCashTransactions.type, dbType) : undefined,
      filters.dateFrom ? gte(pettyCashTransactions.transactionDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(pettyCashTransactions.transactionDate, filters.dateTo) : undefined,
    ].filter(Boolean) as Parameters<typeof and>;

    const baseWhere = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(pettyCashTransactions).where(baseWhere).orderBy(desc(pettyCashTransactions.transactionDate)).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(pettyCashTransactions).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toTransaction(r)),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async createTransaction(accountId: string, input: PettyCashTransactionInput): Promise<PettyCashTransaction> {
    const account = await this.getAccount(accountId);
    const currentBalance = parseFloat(account.currentBalance.toString());

    if (input.type === 'expense') {
      if (currentBalance - input.amount < 0) {
        throw new ConflictError(`Insufficient balance. Available: ${currentBalance}, Required: ${input.amount}`);
      }
    } else {
      const cashLimit = parseFloat(account.cashLimit.toString());
      if (currentBalance + input.amount > cashLimit) {
        throw new ConflictError(`Replenishment would exceed cash limit of ${cashLimit}`);
      }
    }

    const dbType = input.type === 'expense' ? 'debit' : 'credit';
    const newBalance = input.type === 'expense' ? currentBalance - input.amount : currentBalance + input.amount;

    return this.db.transaction(async (tx) => {
      const [txnRow] = await tx
        .insert(pettyCashTransactions)
        .values({
          tenantId: this.tenantId,
          accountId,
          transactionDate: input.transactionDate,
          type: dbType,
          amount: input.amount.toString(),
          description: input.description,
          category: input.category ?? null,
          receiptUrl: input.receiptUrl ?? null,
        })
        .returning();

      await tx
        .update(pettyCashAccounts)
        .set({ currentBalance: newBalance.toString(), updatedAt: new Date() })
        .where(eq(pettyCashAccounts.id, accountId));

      return this.toTransaction(txnRow!);
    });
  }

  async approveTransaction(accountId: string, txnId: string, action: 'approve' | 'reject', userId: string): Promise<PettyCashTransaction> {
    await this.getAccount(accountId);

    const [txn] = await this.db
      .select()
      .from(pettyCashTransactions)
      .where(
        and(
          eq(pettyCashTransactions.id, txnId),
          eq(pettyCashTransactions.accountId, accountId),
          eq(pettyCashTransactions.tenantId, this.tenantId),
        ),
      )
      .limit(1);

    if (!txn) throw new NotFoundError('Petty cash transaction');
    if (txn.type !== 'debit') throw new ConflictError('Only expense transactions require approval');
    if (txn.approvedBy !== null) throw new ConflictError('Transaction has already been actioned');

    if (action === 'reject') {
      const account = await this.getAccount(accountId);
      const currentBalance = parseFloat(account.currentBalance.toString());
      const refundedBalance = currentBalance + parseFloat(txn.amount);

      return this.db.transaction(async (tx) => {
        await tx
          .update(pettyCashAccounts)
          .set({ currentBalance: refundedBalance.toString(), updatedAt: new Date() })
          .where(eq(pettyCashAccounts.id, accountId));

        const [updated] = await tx
          .delete(pettyCashTransactions)
          .where(eq(pettyCashTransactions.id, txnId))
          .returning();

        return this.toTransaction(updated ?? txn);
      });
    }

    const [updated] = await this.db
      .update(pettyCashTransactions)
      .set({ approvedBy: userId, updatedAt: new Date() })
      .where(eq(pettyCashTransactions.id, txnId))
      .returning();

    return this.toTransaction(updated!);
  }

  private toAccount(row: typeof pettyCashAccounts.$inferSelect): PettyCashAccount {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      location: row.location,
      cashLimit: parseFloat(row.cashLimit),
      currentBalance: parseFloat(row.currentBalance),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toTransaction(row: typeof pettyCashTransactions.$inferSelect): PettyCashTransaction {
    const type = row.type === 'debit' ? 'expense' : 'replenishment';
    return {
      id: row.id,
      tenantId: row.tenantId,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      type,
      amount: parseFloat(row.amount),
      description: row.description,
      category: row.category as PettyCashTransaction['category'],
      approvedBy: row.approvedBy,
      receiptUrl: row.receiptUrl,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

import { eq, and, sql, desc } from 'drizzle-orm';
import { bankAccounts, bankTransactions } from '@runq/db';
import type { Db } from '@runq/db';
import type { BankAccount } from '@runq/types';
import type { CreateBankAccountInput, UpdateBankAccountInput } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';

export interface BankAccountListParams {
  page: number;
  limit: number;
}

export interface BankAccountListResult {
  data: BankAccount[];
  meta: PaginationMeta;
}

export interface BankAccountBalance {
  id: string;
  currentBalance: number;
  lastTransactionDate: string | null;
}

export class BankAccountService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(params: BankAccountListParams): Promise<BankAccountListResult> {
    const { page, limit } = params;
    const { offset } = applyPagination(page, limit);

    const tenantWhere = eq(bankAccounts.tenantId, this.tenantId);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(bankAccounts).where(tenantWhere).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(bankAccounts).where(tenantWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toAccount(r)),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<BankAccount> {
    const [row] = await this.db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Bank account');
    return this.toAccount(row);
  }

  async create(input: CreateBankAccountInput): Promise<BankAccount> {
    const [row] = await this.db
      .insert(bankAccounts)
      .values({
        tenantId: this.tenantId,
        name: input.name,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        ifscCode: input.ifscCode,
        accountType: input.accountType,
        openingBalance: input.openingBalance.toString(),
        currentBalance: input.openingBalance.toString(),
      })
      .returning();

    return this.toAccount(row!);
  }

  async update(id: string, input: UpdateBankAccountInput): Promise<BankAccount> {
    const existing = await this.getById(id);

    const [row] = await this.db
      .update(bankAccounts)
      .set({
        name: input.name ?? existing.name,
        bankName: input.bankName ?? existing.bankName,
        accountNumber: input.accountNumber ?? existing.accountNumber,
        ifscCode: input.ifscCode ?? existing.ifscCode,
        accountType: input.accountType ?? existing.accountType,
        updatedAt: new Date(),
      })
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, this.tenantId)))
      .returning();

    if (!row) throw new NotFoundError('Bank account');
    return this.toAccount(row);
  }

  async getBalance(id: string): Promise<BankAccountBalance> {
    const account = await this.getById(id);

    const [lastTxn] = await this.db
      .select({ transactionDate: bankTransactions.transactionDate })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.bankAccountId, id), eq(bankTransactions.tenantId, this.tenantId)))
      .orderBy(desc(bankTransactions.transactionDate))
      .limit(1);

    return {
      id: account.id,
      currentBalance: account.currentBalance,
      lastTransactionDate: lastTxn?.transactionDate ?? null,
    };
  }

  async softDelete(id: string): Promise<void> {
    await this.getById(id);

    const [unreconciledCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.bankAccountId, id),
          eq(bankTransactions.tenantId, this.tenantId),
          eq(bankTransactions.reconStatus, 'unreconciled'),
        ),
      );

    if ((unreconciledCount?.count ?? 0) > 0) {
      throw new ConflictError('Cannot delete account with unreconciled transactions');
    }

    const [row] = await this.db
      .update(bankAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.tenantId, this.tenantId)))
      .returning({ id: bankAccounts.id });

    if (!row) throw new NotFoundError('Bank account');
  }

  private toAccount(row: typeof bankAccounts.$inferSelect): BankAccount {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      ifscCode: row.ifscCode,
      accountType: row.accountType,
      openingBalance: parseFloat(row.openingBalance),
      currentBalance: parseFloat(row.currentBalance),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

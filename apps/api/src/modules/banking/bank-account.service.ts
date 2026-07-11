import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { bankAccounts, bankTransactions } from '@runq/db';
import type { Db } from '@runq/db';
import type { BankAccount } from '@runq/types';
import type { CreateBankAccountInput, UpdateBankAccountInput } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { resolveBankLogoUrl } from './bank-logo';

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

    // Per-account unreconciled counts so each card can show its own badge —
    // the home Reconcile total spans all accounts, so a single-account view
    // otherwise can't explain the number.
    const ids = rows.map((r) => r.id);
    const unreconRows = ids.length
      ? await this.db
          .select({ bankAccountId: bankTransactions.bankAccountId, count: sql<number>`count(*)::int` })
          .from(bankTransactions)
          .where(and(
            eq(bankTransactions.tenantId, this.tenantId),
            eq(bankTransactions.reconStatus, 'unreconciled'),
            inArray(bankTransactions.bankAccountId, ids),
          ))
          .groupBy(bankTransactions.bankAccountId)
      : [];
    const unreconByAccount = new Map(unreconRows.map((u) => [u.bankAccountId, u.count]));

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => this.toAccount(r, unreconByAccount.get(r.id) ?? 0)),
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
        glAccountId: input.glAccountId ?? null,
        logoUrl: resolveBankLogoUrl(input.bankName),
      })
      .returning();

    return this.toAccount(row!);
  }

  async update(id: string, input: UpdateBankAccountInput): Promise<BankAccount> {
    const existing = await this.getById(id);
    // Resolve a fresh logo whenever the bank name changes; otherwise leave
    // the stored value alone (don't overwrite with null).
    const bankNameChanged = input.bankName !== undefined && input.bankName !== existing.bankName;

    const [row] = await this.db
      .update(bankAccounts)
      .set({
        name: input.name ?? existing.name,
        bankName: input.bankName ?? existing.bankName,
        accountNumber: input.accountNumber ?? existing.accountNumber,
        ifscCode: input.ifscCode ?? existing.ifscCode,
        accountType: input.accountType ?? existing.accountType,
        ...(input.glAccountId !== undefined ? { glAccountId: input.glAccountId ?? null } : {}),
        ...(bankNameChanged ? { logoUrl: resolveBankLogoUrl(input.bankName!) } : {}),
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

  private toAccount(row: typeof bankAccounts.$inferSelect, unreconciledCount = 0): BankAccount {
    // Always resolve from the bank name so URL/resolution bumps in
    // resolveBankLogoUrl propagate without needing to backfill the column.
    const logoUrl = resolveBankLogoUrl(row.bankName) ?? row.logoUrl;
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
      glAccountId: row.glAccountId ?? null,
      logoUrl,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      unreconciledCount,
    };
  }
}

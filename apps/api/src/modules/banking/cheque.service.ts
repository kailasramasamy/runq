import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { cheques, bankAccounts, vendors, customers } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { Cheque, PaginationMeta } from '@runq/types';
import type { CreateChequeInput, ChequeFilterInput, DepositChequeInput, BounceChequeInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';

interface ChequeListResult {
  data: Cheque[];
  meta: PaginationMeta;
}

export class ChequeService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(filters: ChequeFilterInput, page: number, limit: number): Promise<ChequeListResult> {
    const { offset } = applyPagination(page, limit);
    const conditions = this.buildFilterConditions(filters);
    const baseWhere = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(cheques).where(baseWhere).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(cheques).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    const chequesWithNames = await this.attachPartyNames(rows);

    return {
      data: chequesWithNames,
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getById(id: string): Promise<Cheque> {
    const [row] = await this.db
      .select()
      .from(cheques)
      .where(and(eq(cheques.id, id), eq(cheques.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Cheque');
    const [cheque] = await this.attachPartyNames([row]);
    return cheque!;
  }

  async create(input: CreateChequeInput): Promise<Cheque> {
    await this.validateBankAccount(input.bankAccountId);

    const [row] = await this.db
      .insert(cheques)
      .values({
        tenantId: this.tenantId,
        chequeNumber: input.chequeNumber,
        bankAccountId: input.bankAccountId,
        type: input.type,
        partyType: input.partyType,
        partyId: input.partyId,
        amount: input.amount.toString(),
        chequeDate: input.chequeDate,
        linkedInvoiceId: input.linkedInvoiceId ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    return this.toCheque(row!);
  }

  async deposit(id: string, input: DepositChequeInput): Promise<Cheque> {
    const cheque = await this.fetchRow(id);
    if (cheque.status !== 'pending') {
      throw new ConflictError(`Cannot deposit cheque with status "${cheque.status}"`);
    }

    const [row] = await this.db
      .update(cheques)
      .set({ status: 'deposited', depositDate: input.depositDate, updatedAt: new Date() })
      .where(and(eq(cheques.id, id), eq(cheques.tenantId, this.tenantId)))
      .returning();

    return this.toCheque(row!);
  }

  async clear(id: string): Promise<Cheque> {
    const cheque = await this.fetchRow(id);
    if (cheque.status !== 'deposited') {
      throw new ConflictError(`Cannot clear cheque with status "${cheque.status}"`);
    }

    const [row] = await this.db
      .update(cheques)
      .set({ status: 'cleared', updatedAt: new Date() })
      .where(and(eq(cheques.id, id), eq(cheques.tenantId, this.tenantId)))
      .returning();

    return this.toCheque(row!);
  }

  async bounce(id: string, input: BounceChequeInput): Promise<Cheque> {
    const cheque = await this.fetchRow(id);
    if (cheque.status !== 'deposited') {
      throw new ConflictError(`Cannot bounce cheque with status "${cheque.status}"`);
    }

    const [row] = await this.db
      .update(cheques)
      .set({ status: 'bounced', bouncedAt: new Date(), bounceReason: input.reason, updatedAt: new Date() })
      .where(and(eq(cheques.id, id), eq(cheques.tenantId, this.tenantId)))
      .returning();

    return this.toCheque(row!);
  }

  async cancel(id: string): Promise<void> {
    const cheque = await this.fetchRow(id);
    if (cheque.status !== 'pending') {
      throw new ConflictError(`Cannot cancel cheque with status "${cheque.status}"`);
    }

    await this.db
      .update(cheques)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(cheques.id, id), eq(cheques.tenantId, this.tenantId)));
  }

  async getUpcomingPDC(days: number): Promise<Cheque[]> {
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

    const rows = await this.db
      .select()
      .from(cheques)
      .where(
        and(
          eq(cheques.tenantId, this.tenantId),
          eq(cheques.status, 'pending'),
          gte(cheques.chequeDate, today),
          lte(cheques.chequeDate, futureDate),
        ),
      );

    return this.attachPartyNames(rows);
  }

  private buildFilterConditions(filters: ChequeFilterInput) {
    return [
      eq(cheques.tenantId, this.tenantId),
      filters.status ? eq(cheques.status, filters.status) : undefined,
      filters.type ? eq(cheques.type, filters.type) : undefined,
      filters.dateFrom ? gte(cheques.chequeDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(cheques.chequeDate, filters.dateTo) : undefined,
    ].filter(Boolean) as Parameters<typeof and>;
  }

  private async fetchRow(id: string) {
    const [row] = await this.db
      .select()
      .from(cheques)
      .where(and(eq(cheques.id, id), eq(cheques.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Cheque');
    return row;
  }

  private async validateBankAccount(bankAccountId: string) {
    const [account] = await this.db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);

    if (!account) throw new NotFoundError('Bank account');
  }

  private async attachPartyNames(rows: (typeof cheques.$inferSelect)[]): Promise<Cheque[]> {
    if (rows.length === 0) return [];

    const vendorIds = rows.filter((r) => r.partyType === 'vendor').map((r) => r.partyId);
    const customerIds = rows.filter((r) => r.partyType === 'customer').map((r) => r.partyId);

    const nameMap = new Map<string, string>();
    await this.fetchPartyNames(vendorIds, vendors, nameMap);
    await this.fetchPartyNames(customerIds, customers, nameMap);

    return rows.map((r) => ({ ...this.toCheque(r), partyName: nameMap.get(r.partyId) ?? '' }));
  }

  private async fetchPartyNames(
    ids: string[],
    table: typeof vendors | typeof customers,
    nameMap: Map<string, string>,
  ) {
    if (ids.length === 0) return;

    const rows = await this.db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(eq(table.tenantId, this.tenantId));

    const idSet = new Set(ids);
    for (const row of rows) {
      if (idSet.has(row.id)) nameMap.set(row.id, row.name);
    }
  }

  private toCheque(row: typeof cheques.$inferSelect): Cheque {
    return {
      id: row.id,
      tenantId: row.tenantId,
      chequeNumber: row.chequeNumber,
      bankAccountId: row.bankAccountId,
      type: row.type,
      partyType: row.partyType,
      partyId: row.partyId,
      amount: toNumber(row.amount),
      chequeDate: row.chequeDate,
      depositDate: row.depositDate,
      status: row.status,
      linkedInvoiceId: row.linkedInvoiceId,
      bouncedAt: row.bouncedAt?.toISOString() ?? null,
      bounceReason: row.bounceReason,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

import { eq, and, desc, sql } from 'drizzle-orm';
import { expenseClaims, expenseClaimItems, users, employees } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors';
import { applyHrScope, type HrAccessScope } from './access-scope';

type ClaimRow = typeof expenseClaims.$inferSelect;
type ItemRow = typeof expenseClaimItems.$inferSelect;

export class ExpenseClaimService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    /// Optional HR scope. Used by approve() to gate a manager to their
    /// reporting subtree. Defaults to org-wide so admin / accountant /
    /// internal callers keep their full reach.
    private readonly scope: HrAccessScope = { kind: 'all' },
  ) {}

  async list(filters?: { status?: string; claimantId?: string }) {
    const conditions = [eq(expenseClaims.tenantId, this.tenantId)];
    if (filters?.status) {
      conditions.push(eq(expenseClaims.status, filters.status as any));
    }
    if (filters?.claimantId) {
      conditions.push(eq(expenseClaims.claimantId, filters.claimantId));
    }

    // Scope: a viewer sees only their own claims, a manager their team's.
    // Claims are keyed by claimant user; left-join to the matching employee
    // (email match, same as /hr/me) so applyHrScope can filter on emp id.
    // A claimant with no employee row falls out of any non-`all` scope.
    const rows = await this.db
      .select({ claim: expenseClaims, claimantName: users.name })
      .from(expenseClaims)
      .innerJoin(users, eq(expenseClaims.claimantId, users.id))
      .leftJoin(employees, and(
        eq(employees.tenantId, this.tenantId),
        sql`lower(${employees.email}) = lower(${users.email})`,
      ))
      .where(applyHrScope(this.scope, employees.id, and(...conditions)))
      .orderBy(desc(expenseClaims.createdAt));

    return rows.map((r) => ({ ...this.toClaim(r.claim), claimantName: r.claimantName }));
  }

  async getById(id: string) {
    const [row] = await this.db
      .select({ claim: expenseClaims, claimantName: users.name })
      .from(expenseClaims)
      .innerJoin(users, eq(expenseClaims.claimantId, users.id))
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('ExpenseClaim');

    const items = await this.db
      .select()
      .from(expenseClaimItems)
      .where(and(eq(expenseClaimItems.claimId, id), eq(expenseClaimItems.tenantId, this.tenantId)));

    return {
      ...this.toClaim(row.claim),
      claimantName: row.claimantName,
      items: items.map((i) => this.toItem(i)),
    };
  }

  async create(input: CreateExpenseClaimInput, claimantId: string) {
    const claimNumber = await this.nextClaimNumber();
    const totalAmount = input.items
      .reduce((sum, item) => sum + item.amount, 0)
      .toFixed(2);

    const [claim] = await this.db
      .insert(expenseClaims)
      .values({
        tenantId: this.tenantId,
        claimNumber,
        claimantId,
        claimDate: input.claimDate,
        description: input.description ?? null,
        totalAmount,
        status: 'draft',
      })
      .returning();

    await this.db.insert(expenseClaimItems).values(
      input.items.map((item) => ({
        tenantId: this.tenantId,
        claimId: claim.id,
        expenseDate: item.expenseDate,
        category: item.category,
        description: item.description,
        amount: item.amount.toFixed(2),
        accountCode: item.accountCode ?? null,
      })),
    );

    return this.getById(claim.id);
  }

  async submit(id: string) {
    const claim = await this.requireClaim(id);
    if (claim.status !== 'draft') {
      throw new ConflictError('Only draft claims can be submitted');
    }
    await this.db
      .update(expenseClaims)
      .set({ status: 'submitted', updatedAt: new Date() })
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.tenantId, this.tenantId)));
    return this.getById(id);
  }

  async approve(id: string, userId: string, approved: boolean, rejectionReason?: string | null) {
    const claim = await this.requireClaim(id);
    if (claim.status !== 'submitted') {
      throw new ConflictError('Only submitted claims can be approved/rejected');
    }

    // Self-approval guard. A user can never decide on their own claim,
    // regardless of role — including owners. Audit trail expectation.
    if (claim.claimantId === userId) {
      throw new ForbiddenError('You cannot approve or reject your own expense claim');
    }

    // Scope guard. Managers (kind: 'subset') can only act on claims
    // filed by employees in their reporting subtree. Resolve the
    // claim's claimant → employee via the same email-match pattern
    // /hr/me uses, then check the resulting employee.id is in scope.
    if (this.scope.kind === 'subset' || this.scope.kind === 'self') {
      const [emp] = await this.db
        .select({ id: employees.id })
        .from(users)
        .innerJoin(
          employees,
          and(
            eq(employees.tenantId, this.tenantId),
            sql`lower(${employees.email}) = lower(${users.email})`,
          ),
        )
        .where(eq(users.id, claim.claimantId))
        .limit(1);
      const inScope = emp != null
        && (this.scope.kind === 'subset' ? this.scope.ids.has(emp.id) : this.scope.selfEmployeeId === emp.id);
      if (!inScope) {
        throw new ForbiddenError('This claim is outside your approval scope');
      }
    }

    const updates = approved
      ? { status: 'approved' as const, approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() }
      : { status: 'rejected' as const, rejectionReason: rejectionReason ?? null, updatedAt: new Date() };

    await this.db
      .update(expenseClaims)
      .set(updates)
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.tenantId, this.tenantId)));
    return this.getById(id);
  }

  async markReimbursed(id: string) {
    const claim = await this.requireClaim(id);
    if (claim.status !== 'approved') {
      throw new ConflictError('Only approved claims can be reimbursed');
    }
    await this.db
      .update(expenseClaims)
      .set({ status: 'reimbursed', reimbursedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.tenantId, this.tenantId)));
    return this.getById(id);
  }

  /**
   * Edit a claim's header + items. Mirrors the invoice / bill amend
   * policy: allowed until the money has actually moved (status ===
   * 'reimbursed') or the claim was rejected (terminal). Both prior
   * cases want a fresh claim, not a silent rewrite.
   */
  async update(id: string, input: CreateExpenseClaimInput) {
    const claim = await this.requireClaim(id);
    if (claim.status === 'reimbursed') {
      throw new ConflictError(
        'Cannot edit a claim that has been reimbursed. Create a fresh claim instead.',
      );
    }
    if (claim.status === 'rejected') {
      throw new ConflictError('Rejected claims cannot be edited');
    }

    const totalAmount = input.items
      .reduce((sum, item) => sum + item.amount, 0)
      .toFixed(2);

    await this.db.transaction(async (tx) => {
      await tx
        .update(expenseClaims)
        .set({
          claimDate: input.claimDate,
          description: input.description ?? null,
          totalAmount,
          updatedAt: new Date(),
        })
        .where(and(eq(expenseClaims.id, id), eq(expenseClaims.tenantId, this.tenantId)));

      await tx
        .delete(expenseClaimItems)
        .where(and(eq(expenseClaimItems.claimId, id), eq(expenseClaimItems.tenantId, this.tenantId)));

      await tx.insert(expenseClaimItems).values(
        input.items.map((item) => ({
          tenantId: this.tenantId,
          claimId: id,
          expenseDate: item.expenseDate,
          category: item.category,
          description: item.description,
          amount: item.amount.toFixed(2),
          accountCode: item.accountCode ?? null,
        })),
      );
    });

    return this.getById(id);
  }

  /**
   * Hard-delete a claim. Same gate as update(): refuses when the money
   * has already moved so we never silently rewind a real bank transfer.
   * Rejected claims can be deleted — they're terminal and harmless.
   */
  async hardDelete(id: string): Promise<void> {
    const claim = await this.requireClaim(id);
    if (claim.status === 'reimbursed') {
      throw new ConflictError(
        'Cannot delete a reimbursed claim. The payment has already moved.',
      );
    }
    await this.db.transaction(async (tx) => {
      await tx
        .delete(expenseClaimItems)
        .where(and(eq(expenseClaimItems.claimId, id), eq(expenseClaimItems.tenantId, this.tenantId)));
      await tx
        .delete(expenseClaims)
        .where(and(eq(expenseClaims.id, id), eq(expenseClaims.tenantId, this.tenantId)));
    });
  }

  private async requireClaim(id: string): Promise<ClaimRow> {
    const [row] = await this.db
      .select()
      .from(expenseClaims)
      .where(and(eq(expenseClaims.id, id), eq(expenseClaims.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('ExpenseClaim');
    return row;
  }

  private async nextClaimNumber(): Promise<string> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenseClaims)
      .where(eq(expenseClaims.tenantId, this.tenantId));
    const seq = (result?.count ?? 0) + 1;
    return `EXP-${String(seq).padStart(4, '0')}`;
  }

  private toClaim(row: ClaimRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      claimNumber: row.claimNumber,
      claimantId: row.claimantId,
      claimDate: row.claimDate,
      description: row.description,
      totalAmount: row.totalAmount,
      status: row.status,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      reimbursedAt: row.reimbursedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toItem(row: ItemRow) {
    return {
      id: row.id,
      claimId: row.claimId,
      expenseDate: row.expenseDate,
      category: row.category,
      description: row.description,
      amount: row.amount,
      accountCode: row.accountCode,
      receiptUrl: row.receiptUrl,
    };
  }
}

interface CreateExpenseClaimInput {
  claimDate: string;
  description?: string | null;
  items: {
    expenseDate: string;
    category: string;
    description: string;
    amount: number;
    accountCode?: string | null;
  }[];
}

import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import {
  customerPaymentClaims,
  customerPaymentClaimInvoices,
  salesInvoices,
  customers,
} from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { ReceiptService } from './receipt.service';

export interface CreateClaimInput {
  claimDate: string;
  paymentMethod: string;
  referenceNumber?: string | null;
  notes?: string | null;
  allocations: Array<{ invoiceId: string; amount: number }>;
}

export interface AdminClaimSummary extends ClaimSummary {
  customerId: string;
  customerName: string;
}

export interface ClaimInvoice {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate?: string;
  dueDate?: string;
  totalAmount?: number;
  balanceDue?: number;
  status?: string;
}

export interface ClaimSummary {
  id: string;
  claimedAmount: number;
  claimDate: string;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'cancelled';
  verifiedAt: string | null;
  createdAt: string;
  invoices: ClaimInvoice[];
}

export class PaymentClaimService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async create(customerId: string, input: CreateClaimInput): Promise<ClaimSummary> {
    if (input.allocations.length === 0) {
      throw new ConflictError('Select at least one invoice');
    }
    const invoiceIds = input.allocations.map((a) => a.invoiceId);
    const invoices = await this.db
      .select({ id: salesInvoices.id, customerId: salesInvoices.customerId })
      .from(salesInvoices)
      .where(and(eq(salesInvoices.tenantId, this.tenantId), inArray(salesInvoices.id, invoiceIds)));

    if (invoices.length !== invoiceIds.length) {
      throw new NotFoundError('Invoice');
    }
    for (const inv of invoices) {
      if (inv.customerId !== customerId) {
        throw new ConflictError('Invoice does not belong to this customer');
      }
    }

    const claimedIds = await this.findActiveClaimedInvoices(invoiceIds);
    if (claimedIds.size > 0) {
      throw new ConflictError('One or more invoices already have a pending payment report');
    }

    const totalAmount = input.allocations.reduce((s, a) => s + a.amount, 0);

    const claimId = await this.db.transaction(async (tx) => {
      const [claim] = await tx
        .insert(customerPaymentClaims)
        .values({
          tenantId: this.tenantId,
          customerId,
          claimedAmount: totalAmount.toFixed(2),
          claimDate: input.claimDate,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
        })
        .returning();
      if (!claim) throw new Error('Claim insert failed');

      await tx.insert(customerPaymentClaimInvoices).values(
        input.allocations.map((a) => ({
          claimId: claim.id,
          invoiceId: a.invoiceId,
          amount: a.amount.toFixed(2),
        })),
      );
      return claim.id;
    });

    return this.getById(customerId, claimId);
  }

  async list(customerId: string): Promise<ClaimSummary[]> {
    const rows = await this.db
      .select({
        claim: customerPaymentClaims,
        allocationAmount: customerPaymentClaimInvoices.amount,
        invoiceId: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
      })
      .from(customerPaymentClaims)
      .leftJoin(
        customerPaymentClaimInvoices,
        eq(customerPaymentClaimInvoices.claimId, customerPaymentClaims.id),
      )
      .leftJoin(salesInvoices, eq(customerPaymentClaimInvoices.invoiceId, salesInvoices.id))
      .where(
        and(
          eq(customerPaymentClaims.tenantId, this.tenantId),
          eq(customerPaymentClaims.customerId, customerId),
        ),
      )
      .orderBy(sql`${customerPaymentClaims.createdAt} desc`);

    const grouped = new Map<string, ClaimSummary>();
    for (const r of rows) {
      let entry = grouped.get(r.claim.id);
      if (!entry) {
        entry = toSummary(r.claim);
        grouped.set(r.claim.id, entry);
      }
      if (r.invoiceId && r.allocationAmount) {
        entry.invoices.push({
          invoiceId: r.invoiceId,
          invoiceNumber: r.invoiceNumber!,
          amount: Number(r.allocationAmount),
        });
      }
    }
    return Array.from(grouped.values());
  }

  async cancel(customerId: string, claimId: string): Promise<void> {
    const [claim] = await this.db
      .select({ status: customerPaymentClaims.status })
      .from(customerPaymentClaims)
      .where(
        and(
          eq(customerPaymentClaims.id, claimId),
          eq(customerPaymentClaims.tenantId, this.tenantId),
          eq(customerPaymentClaims.customerId, customerId),
        ),
      )
      .limit(1);
    if (!claim) throw new NotFoundError('Payment claim');
    if (claim.status !== 'pending') {
      throw new ConflictError('Only pending claims can be cancelled');
    }
    await this.db
      .update(customerPaymentClaims)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(customerPaymentClaims.id, claimId));
  }

  /** Returns the set of invoice IDs that already have an active (pending or verified) claim. */
  async findActiveClaimedInvoices(invoiceIds: string[]): Promise<Set<string>> {
    if (invoiceIds.length === 0) return new Set();
    const rows = await this.db
      .select({ invoiceId: customerPaymentClaimInvoices.invoiceId })
      .from(customerPaymentClaimInvoices)
      .innerJoin(
        customerPaymentClaims,
        eq(customerPaymentClaims.id, customerPaymentClaimInvoices.claimId),
      )
      .where(
        and(
          eq(customerPaymentClaims.tenantId, this.tenantId),
          inArray(customerPaymentClaimInvoices.invoiceId, invoiceIds),
          inArray(customerPaymentClaims.status, ['pending', 'verified']),
        ),
      );
    return new Set(rows.map((r) => r.invoiceId));
  }

  /** Map invoice -> active pending claim id, for UI badge. */
  async getPendingClaimByInvoice(
    customerId: string,
  ): Promise<Map<string, { claimId: string; claimDate: string }>> {
    const rows = await this.db
      .select({
        invoiceId: customerPaymentClaimInvoices.invoiceId,
        claimId: customerPaymentClaims.id,
        claimDate: customerPaymentClaims.claimDate,
      })
      .from(customerPaymentClaimInvoices)
      .innerJoin(
        customerPaymentClaims,
        eq(customerPaymentClaims.id, customerPaymentClaimInvoices.claimId),
      )
      .where(
        and(
          eq(customerPaymentClaims.tenantId, this.tenantId),
          eq(customerPaymentClaims.customerId, customerId),
          eq(customerPaymentClaims.status, 'pending'),
        ),
      );
    const map = new Map<string, { claimId: string; claimDate: string }>();
    for (const r of rows) map.set(r.invoiceId, { claimId: r.claimId, claimDate: r.claimDate });
    return map;
  }

  async listAll(filters: {
    status?: 'pending' | 'verified' | 'rejected' | 'cancelled';
    customerId?: string;
    invoiceId?: string;
  }): Promise<AdminClaimSummary[]> {
    const conds = [eq(customerPaymentClaims.tenantId, this.tenantId)];
    if (filters.status) conds.push(eq(customerPaymentClaims.status, filters.status));
    if (filters.customerId) conds.push(eq(customerPaymentClaims.customerId, filters.customerId));
    if (filters.invoiceId) {
      conds.push(
        sql`EXISTS (SELECT 1 FROM customer_payment_claim_invoices ci WHERE ci.claim_id = ${customerPaymentClaims.id} AND ci.invoice_id = ${filters.invoiceId})`,
      );
    }

    const rows = await this.db
      .select({
        claim: customerPaymentClaims,
        customerName: customers.name,
        customerNickname: customers.nickname,
        allocationAmount: customerPaymentClaimInvoices.amount,
        invoiceId: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
        invoiceDueDate: salesInvoices.dueDate,
        invoiceTotalAmount: salesInvoices.totalAmount,
        invoiceBalanceDue: salesInvoices.balanceDue,
        invoiceStatus: salesInvoices.status,
      })
      .from(customerPaymentClaims)
      .innerJoin(customers, eq(customers.id, customerPaymentClaims.customerId))
      .leftJoin(
        customerPaymentClaimInvoices,
        eq(customerPaymentClaimInvoices.claimId, customerPaymentClaims.id),
      )
      .leftJoin(salesInvoices, eq(customerPaymentClaimInvoices.invoiceId, salesInvoices.id))
      .where(and(...conds))
      .orderBy(desc(customerPaymentClaims.createdAt));

    const grouped = new Map<string, AdminClaimSummary>();
    for (const r of rows) {
      let entry = grouped.get(r.claim.id);
      if (!entry) {
        entry = {
          ...toSummary(r.claim),
          customerId: r.claim.customerId,
          customerName: r.customerNickname?.trim() || r.customerName,
        };
        grouped.set(r.claim.id, entry);
      }
      if (r.invoiceId && r.allocationAmount) {
        entry.invoices.push({
          invoiceId: r.invoiceId,
          invoiceNumber: r.invoiceNumber!,
          amount: Number(r.allocationAmount),
          invoiceDate: r.invoiceDate ?? '',
          dueDate: r.invoiceDueDate ?? '',
          totalAmount: Number(r.invoiceTotalAmount ?? 0),
          balanceDue: Number(r.invoiceBalanceDue ?? 0),
          status: r.invoiceStatus ?? '',
        });
      }
    }
    return Array.from(grouped.values());
  }

  async verify(
    claimId: string,
    input: { bankAccountId: string; receiptDate: string; referenceNumber?: string | null },
  ): Promise<{ receiptId: string }> {
    const [claim] = await this.db
      .select()
      .from(customerPaymentClaims)
      .where(
        and(eq(customerPaymentClaims.id, claimId), eq(customerPaymentClaims.tenantId, this.tenantId)),
      )
      .limit(1);
    if (!claim) throw new NotFoundError('Payment claim');
    if (claim.status !== 'pending') {
      throw new ConflictError('Only pending claims can be verified');
    }

    const allocRows = await this.db
      .select({ invoiceId: customerPaymentClaimInvoices.invoiceId, amount: customerPaymentClaimInvoices.amount })
      .from(customerPaymentClaimInvoices)
      .where(eq(customerPaymentClaimInvoices.claimId, claimId));

    const receiptService = new ReceiptService(this.db, this.tenantId);
    const receipt = await receiptService.create({
      customerId: claim.customerId,
      bankAccountId: input.bankAccountId,
      paymentMethod: 'bank_transfer',
      referenceNumber: input.referenceNumber ?? claim.referenceNumber,
      receiptDate: input.receiptDate,
      totalAmount: Number(claim.claimedAmount),
      allocations: allocRows.map((a) => ({ invoiceId: a.invoiceId, amount: Number(a.amount) })),
      notes: claim.notes
        ? `${claim.notes}\n[Verified from customer claim ${claim.id}]`
        : `Verified from customer claim ${claim.id}`,
    });

    await this.db
      .update(customerPaymentClaims)
      .set({
        status: 'verified',
        matchedReceiptId: receipt.id,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customerPaymentClaims.id, claimId));

    return { receiptId: receipt.id };
  }

  /**
   * Best-effort: if any pending claim for this customer is fully covered by
   * the just-created receipt (all claim invoices are in the receipt's
   * allocations, and the receipt's total ≥ claim's total), mark it verified
   * and link it to the receipt. Returns the resolved claim id or null.
   *
   * Picks the closest-amount match if multiple claims are eligible.
   */
  async tryAutoResolveClaim(
    customerId: string,
    receipt: { id: string; totalAmount: number; allocations: Array<{ invoiceId: string }> },
  ): Promise<string | null> {
    const receiptInvoiceIds = new Set(receipt.allocations.map((a) => a.invoiceId));
    if (receiptInvoiceIds.size === 0) return null;

    const pendingRows = await this.db
      .select({
        claimId: customerPaymentClaims.id,
        claimedAmount: customerPaymentClaims.claimedAmount,
        invoiceId: customerPaymentClaimInvoices.invoiceId,
      })
      .from(customerPaymentClaims)
      .innerJoin(
        customerPaymentClaimInvoices,
        eq(customerPaymentClaimInvoices.claimId, customerPaymentClaims.id),
      )
      .where(
        and(
          eq(customerPaymentClaims.tenantId, this.tenantId),
          eq(customerPaymentClaims.customerId, customerId),
          eq(customerPaymentClaims.status, 'pending'),
          inArray(customerPaymentClaimInvoices.invoiceId, [...receiptInvoiceIds]),
        ),
      );

    type ClaimGroup = { claimId: string; amount: number; invoiceIds: Set<string> };
    const claims = new Map<string, ClaimGroup>();
    for (const r of pendingRows) {
      let entry = claims.get(r.claimId);
      if (!entry) {
        entry = { claimId: r.claimId, amount: Number(r.claimedAmount), invoiceIds: new Set() };
        claims.set(r.claimId, entry);
      }
      entry.invoiceIds.add(r.invoiceId);
    }

    // We only loaded allocations that intersected. A claim is fully covered
    // when every one of its allocations is in the receipt — confirm with a
    // second targeted lookup, since the join above filtered to intersecting
    // rows only.
    const candidateIds = [...claims.keys()];
    if (candidateIds.length === 0) return null;
    const allClaimAllocs = await this.db
      .select({
        claimId: customerPaymentClaimInvoices.claimId,
        invoiceId: customerPaymentClaimInvoices.invoiceId,
      })
      .from(customerPaymentClaimInvoices)
      .where(inArray(customerPaymentClaimInvoices.claimId, candidateIds));

    const allocsByClaim = new Map<string, Set<string>>();
    for (const a of allClaimAllocs) {
      if (!allocsByClaim.has(a.claimId)) allocsByClaim.set(a.claimId, new Set());
      allocsByClaim.get(a.claimId)!.add(a.invoiceId);
    }

    const eligible: ClaimGroup[] = [];
    for (const [claimId, allInvIds] of allocsByClaim) {
      const claim = claims.get(claimId)!;
      const covered = [...allInvIds].every((id) => receiptInvoiceIds.has(id));
      if (covered && claim.amount <= receipt.totalAmount + 0.01) {
        eligible.push({ ...claim, invoiceIds: allInvIds });
      }
    }
    if (eligible.length === 0) return null;

    // Pick the claim whose amount is closest to the receipt total (most likely
    // intentional match), preferring exact matches.
    eligible.sort(
      (a, b) => Math.abs(a.amount - receipt.totalAmount) - Math.abs(b.amount - receipt.totalAmount),
    );
    const winner = eligible[0]!;

    await this.db
      .update(customerPaymentClaims)
      .set({
        status: 'verified',
        matchedReceiptId: receipt.id,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customerPaymentClaims.id, winner.claimId));

    return winner.claimId;
  }

  async reject(claimId: string, reason?: string | null): Promise<void> {
    const [claim] = await this.db
      .select({ status: customerPaymentClaims.status, notes: customerPaymentClaims.notes })
      .from(customerPaymentClaims)
      .where(
        and(eq(customerPaymentClaims.id, claimId), eq(customerPaymentClaims.tenantId, this.tenantId)),
      )
      .limit(1);
    if (!claim) throw new NotFoundError('Payment claim');
    if (claim.status !== 'pending') {
      throw new ConflictError('Only pending claims can be rejected');
    }
    const appendedNotes = reason
      ? `${claim.notes ? claim.notes + '\n' : ''}[Rejected: ${reason}]`
      : claim.notes;
    await this.db
      .update(customerPaymentClaims)
      .set({ status: 'rejected', notes: appendedNotes, updatedAt: new Date() })
      .where(eq(customerPaymentClaims.id, claimId));
  }

  private async getById(customerId: string, claimId: string): Promise<ClaimSummary> {
    const rows = await this.db
      .select({
        claim: customerPaymentClaims,
        allocationAmount: customerPaymentClaimInvoices.amount,
        invoiceId: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
      })
      .from(customerPaymentClaims)
      .leftJoin(
        customerPaymentClaimInvoices,
        eq(customerPaymentClaimInvoices.claimId, customerPaymentClaims.id),
      )
      .leftJoin(salesInvoices, eq(customerPaymentClaimInvoices.invoiceId, salesInvoices.id))
      .where(
        and(
          eq(customerPaymentClaims.id, claimId),
          eq(customerPaymentClaims.tenantId, this.tenantId),
          eq(customerPaymentClaims.customerId, customerId),
        ),
      );
    if (rows.length === 0) throw new NotFoundError('Payment claim');
    const summary = toSummary(rows[0]!.claim);
    for (const r of rows) {
      if (r.invoiceId && r.allocationAmount) {
        summary.invoices.push({
          invoiceId: r.invoiceId,
          invoiceNumber: r.invoiceNumber!,
          amount: Number(r.allocationAmount),
        });
      }
    }
    return summary;
  }
}

function toSummary(c: typeof customerPaymentClaims.$inferSelect): ClaimSummary {
  return {
    id: c.id,
    claimedAmount: Number(c.claimedAmount),
    claimDate: c.claimDate,
    paymentMethod: c.paymentMethod,
    referenceNumber: c.referenceNumber,
    notes: c.notes,
    status: c.status,
    verifiedAt: c.verifiedAt ? c.verifiedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    invoices: [],
  };
}

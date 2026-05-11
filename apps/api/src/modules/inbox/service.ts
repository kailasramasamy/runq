import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  salesInvoices,
  customers,
  purchaseInvoices,
  vendors,
  expenseClaims,
  poUploads,
  poDrafts,
} from '@runq/db';
import type { Db } from '@runq/db';

export type InboxGroupKey =
  | 'invoices_to_send'
  | 'bills_to_approve'
  | 'bills_pending_match'
  | 'po_drafts_to_review'
  | 'expenses_to_approve'
  | 'expenses_to_reimburse';

/**
 * Coarse status used by the UI to pick a status-dot color and decide
 * whether to apply the warm "needs review" row tint. Derived per-group
 * from the underlying entity state.
 */
export type InboxItemStatus = 'draft' | 'ready' | 'needs_review' | 'approved';

export interface InboxItem {
  id: string;
  /** Where to navigate when the user picks the row. */
  href: string;
  title: string;
  subtitle: string;
  amount: number | null;
  /** ISO date string (created/issued/etc) — used for relative-time display. */
  date: string;
  status: InboxItemStatus;
}

export interface InboxGroup {
  key: InboxGroupKey;
  title: string;
  /** One-line caption shown beneath the group title to make the goal obvious. */
  caption: string;
  /** Cap surfaced to the client; `count` is the true total. */
  count: number;
  items: InboxItem[];
}

export interface InboxPayload {
  totalCount: number;
  groups: InboxGroup[];
}

const PER_GROUP_CAP = 25;

/**
 * Aggregates everything that needs the user's attention into a single
 * inbox payload. All sub-queries fan out in parallel and are scoped to
 * the tenant; row-level security takes care of multi-tenant isolation
 * the same way it does for direct module reads.
 */
export class InboxService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** Cheap count-only query used by the sidebar badge. */
  async count(): Promise<number> {
    const [
      draftInvoices,
      pendingBills,
      pendingMatch,
      readyDrafts,
      submittedExpenses,
      approvedExpenses,
    ] = await Promise.all([
      this.countWhere(salesInvoices, eq(salesInvoices.status, 'draft')),
      this.countWhere(purchaseInvoices, eq(purchaseInvoices.status, 'matched')),
      this.countWhere(purchaseInvoices, eq(purchaseInvoices.status, 'pending_match')),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(poDrafts)
        .where(
          and(
            eq(poDrafts.tenantId, this.tenantId),
            sql`${poDrafts.reviewStatus} in ('ready', 'needs_review')`,
          ),
        )
        .then((rows) => rows[0]?.count ?? 0),
      this.countWhere(expenseClaims, eq(expenseClaims.status, 'submitted')),
      this.countWhere(expenseClaims, eq(expenseClaims.status, 'approved')),
    ]);
    return draftInvoices + pendingBills + pendingMatch + readyDrafts +
      submittedExpenses + approvedExpenses;
  }

  /** Full payload with grouped, capped item lists. */
  async list(): Promise<InboxPayload> {
    const [drafts, billsToApprove, billsToMatch, poToReview, expensesToApprove, expensesToReimburse] =
      await Promise.all([
        this.invoicesToSend(),
        this.billsToApprove(),
        this.billsPendingMatch(),
        this.poDraftsToReview(),
        this.expensesToApprove(),
        this.expensesToReimburse(),
      ]);

    const groups: InboxGroup[] = [
      {
        key: 'invoices_to_send',
        title: 'Invoices to send',
        caption: 'Drafts waiting to go out to your customers.',
        count: drafts.count,
        items: drafts.items,
      },
      {
        key: 'bills_to_approve',
        title: 'Bills to approve',
        caption: 'Matched against POs — give the green light to pay.',
        count: billsToApprove.count,
        items: billsToApprove.items,
      },
      {
        key: 'bills_pending_match',
        title: 'Bills pending match',
        caption: '3-way match needs your attention before approval.',
        count: billsToMatch.count,
        items: billsToMatch.items,
      },
      {
        key: 'po_drafts_to_review',
        title: 'PO drafts to review',
        caption: 'Customer POs parsed by AI — confirm and convert to invoices.',
        count: poToReview.count,
        items: poToReview.items,
      },
      {
        key: 'expenses_to_approve',
        title: 'Expenses to approve',
        caption: 'Submitted reimbursement claims awaiting your decision.',
        count: expensesToApprove.count,
        items: expensesToApprove.items,
      },
      {
        key: 'expenses_to_reimburse',
        title: 'Expenses to reimburse',
        caption: 'Approved claims — transfer the money and mark them paid.',
        count: expensesToReimburse.count,
        items: expensesToReimburse.items,
      },
    ];

    const totalCount = groups.reduce((s, g) => s + g.count, 0);
    return { totalCount, groups };
  }

  // ─── Per-group queries ──────────────────────────────────────────────────

  private async invoicesToSend() {
    const rows = await this.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        totalAmount: salesInvoices.totalAmount,
        invoiceDate: salesInvoices.invoiceDate,
        customerName: customers.name,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(and(eq(salesInvoices.tenantId, this.tenantId), eq(salesInvoices.status, 'draft')))
      .orderBy(desc(salesInvoices.invoiceDate))
      .limit(PER_GROUP_CAP + 1);

    const items: InboxItem[] = rows.slice(0, PER_GROUP_CAP).map((r) => ({
      id: r.id,
      href: `/ar/invoices/${r.id}`,
      title: r.customerName,
      subtitle: r.invoiceNumber,
      amount: Number(r.totalAmount),
      date: r.invoiceDate,
      status: 'draft',
    }));
    return { items, count: rows.length };
  }

  private async billsToApprove() {
    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        totalAmount: purchaseInvoices.totalAmount,
        invoiceDate: purchaseInvoices.invoiceDate,
        vendorName: vendors.name,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
      .where(and(eq(purchaseInvoices.tenantId, this.tenantId), eq(purchaseInvoices.status, 'matched')))
      .orderBy(desc(purchaseInvoices.invoiceDate))
      .limit(PER_GROUP_CAP + 1);

    const items: InboxItem[] = rows.slice(0, PER_GROUP_CAP).map((r) => ({
      id: r.id,
      href: `/ap/bills/${r.id}`,
      title: r.vendorName,
      subtitle: r.invoiceNumber,
      amount: Number(r.totalAmount),
      date: r.invoiceDate,
      status: 'ready',
    }));
    return { items, count: rows.length };
  }

  private async billsPendingMatch() {
    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        totalAmount: purchaseInvoices.totalAmount,
        invoiceDate: purchaseInvoices.invoiceDate,
        vendorName: vendors.name,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
      .where(and(eq(purchaseInvoices.tenantId, this.tenantId), eq(purchaseInvoices.status, 'pending_match')))
      .orderBy(desc(purchaseInvoices.invoiceDate))
      .limit(PER_GROUP_CAP + 1);

    const items: InboxItem[] = rows.slice(0, PER_GROUP_CAP).map((r) => ({
      id: r.id,
      href: `/ap/bills/${r.id}`,
      title: r.vendorName,
      subtitle: r.invoiceNumber,
      amount: Number(r.totalAmount),
      date: r.invoiceDate,
      status: 'needs_review',
    }));
    return { items, count: rows.length };
  }

  private async poDraftsToReview() {
    const rows = await this.db
      .select({
        uploadId: poUploads.id,
        fileName: poUploads.fileName,
        createdAt: poUploads.createdAt,
        customerName: customers.name,
        buyerNameRaw: poDrafts.buyerNameRaw,
        grandTotal: poDrafts.grandTotal,
        reviewStatus: poDrafts.reviewStatus,
      })
      .from(poUploads)
      .innerJoin(poDrafts, eq(poDrafts.poUploadId, poUploads.id))
      .leftJoin(customers, eq(customers.id, poDrafts.customerId))
      .where(
        and(
          eq(poUploads.tenantId, this.tenantId),
          sql`${poDrafts.reviewStatus} in ('ready', 'needs_review')`,
        ),
      )
      .orderBy(desc(poUploads.createdAt))
      .limit(PER_GROUP_CAP + 1);

    const items: InboxItem[] = rows.slice(0, PER_GROUP_CAP).map((r) => ({
      id: r.uploadId,
      href: `/ar/po-inbox/${r.uploadId}`,
      title: r.customerName ?? r.buyerNameRaw ?? r.fileName ?? 'PO upload',
      subtitle: r.reviewStatus === 'ready' ? 'Ready to convert' : 'Needs review',
      amount: r.grandTotal != null ? Number(r.grandTotal) : null,
      date: r.createdAt.toISOString(),
      status: r.reviewStatus === 'ready' ? 'ready' : 'needs_review',
    }));
    return { items, count: rows.length };
  }

  private async expensesToApprove() {
    const rows = await this.db
      .select({
        id: expenseClaims.id,
        claimNumber: expenseClaims.claimNumber,
        totalAmount: expenseClaims.totalAmount,
        claimDate: expenseClaims.claimDate,
        description: expenseClaims.description,
      })
      .from(expenseClaims)
      .where(and(eq(expenseClaims.tenantId, this.tenantId), eq(expenseClaims.status, 'submitted')))
      .orderBy(desc(expenseClaims.claimDate))
      .limit(PER_GROUP_CAP + 1);

    const items: InboxItem[] = rows.slice(0, PER_GROUP_CAP).map((r) => ({
      id: r.id,
      href: `/expenses/claims`,
      title: r.description?.trim() ? r.description : r.claimNumber,
      subtitle: r.claimNumber,
      amount: Number(r.totalAmount),
      date: r.claimDate,
      status: 'ready',
    }));
    return { items, count: rows.length };
  }

  private async expensesToReimburse() {
    const rows = await this.db
      .select({
        id: expenseClaims.id,
        claimNumber: expenseClaims.claimNumber,
        totalAmount: expenseClaims.totalAmount,
        claimDate: expenseClaims.claimDate,
        description: expenseClaims.description,
      })
      .from(expenseClaims)
      .where(
        and(
          eq(expenseClaims.tenantId, this.tenantId),
          eq(expenseClaims.status, 'approved'),
          isNull(expenseClaims.reimbursedAt),
        ),
      )
      .orderBy(desc(expenseClaims.claimDate))
      .limit(PER_GROUP_CAP + 1);

    const items: InboxItem[] = rows.slice(0, PER_GROUP_CAP).map((r) => ({
      id: r.id,
      href: `/expenses/claims`,
      title: r.description?.trim() ? r.description : r.claimNumber,
      subtitle: r.claimNumber,
      amount: Number(r.totalAmount),
      date: r.claimDate,
      status: 'approved',
    }));
    return { items, count: rows.length };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async countWhere(table: typeof salesInvoices | typeof purchaseInvoices | typeof expenseClaims, cond: ReturnType<typeof eq>): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(and(eq(table.tenantId, this.tenantId), cond));
    return row?.count ?? 0;
  }
}

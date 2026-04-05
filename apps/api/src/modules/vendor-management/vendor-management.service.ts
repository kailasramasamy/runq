import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import {
  vendorContracts,
  vendorRatings,
  purchaseRequisitions,
  purchaseRequisitionItems,
  paymentSchedules,
  paymentScheduleItems,
  purchaseInvoices,
  purchaseOrders,
  purchaseOrderItems,
  vendors,
  users,
} from '@runq/db';
import { WorkflowService } from '../workflows/workflow.service';
import type { Db } from '@runq/db';
import type {
  VendorContract,
  VendorRating,
  PurchaseRequisition,
  PaymentSchedule,
} from '@runq/types';
import type {
  CreateVendorContractInput,
  CreateVendorRatingInput,
  CreateRequisitionInput,
  CreatePaymentScheduleInput,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber, decimalSum } from '../../utils/decimal';

export class VendorManagementService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // --- Contracts ---

  async createContract(data: CreateVendorContractInput): Promise<VendorContract> {
    const [row] = await this.db
      .insert(vendorContracts)
      .values({
        tenantId: this.tenantId,
        vendorId: data.vendorId,
        contractNumber: data.contractNumber,
        title: data.title,
        startDate: data.startDate,
        endDate: data.endDate,
        value: data.value?.toString() ?? null,
        terms: data.terms ?? null,
        renewalDate: data.renewalDate ?? null,
      })
      .returning();

    return this.getContract(row!.id);
  }

  async listContracts(vendorId?: string, status?: string): Promise<VendorContract[]> {
    const conditions = [eq(vendorContracts.tenantId, this.tenantId)];
    if (vendorId) conditions.push(eq(vendorContracts.vendorId, vendorId));
    if (status) conditions.push(eq(vendorContracts.status, status as 'draft' | 'active' | 'expired' | 'cancelled'));

    const rows = await this.db
      .select({ contract: vendorContracts, vendorName: vendors.name })
      .from(vendorContracts)
      .innerJoin(vendors, eq(vendorContracts.vendorId, vendors.id))
      .where(and(...conditions))
      .orderBy(desc(vendorContracts.createdAt));

    return rows.map((r) => ({ ...this.toContract(r.contract), vendorName: r.vendorName }));
  }

  async getContract(id: string): Promise<VendorContract> {
    const [row] = await this.db
      .select({ contract: vendorContracts, vendorName: vendors.name })
      .from(vendorContracts)
      .innerJoin(vendors, eq(vendorContracts.vendorId, vendors.id))
      .where(and(eq(vendorContracts.id, id), eq(vendorContracts.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Vendor contract');
    return { ...this.toContract(row.contract), vendorName: row.vendorName };
  }

  async updateContract(
    id: string,
    data: Partial<{
      title: string;
      value: number | null;
      terms: string | null;
      startDate: string;
      endDate: string;
      renewalDate: string | null;
      status: string;
    }>,
  ): Promise<VendorContract> {
    await this.getContract(id);
    const [row] = await this.db
      .update(vendorContracts)
      .set({
        ...(data.title !== undefined && { title: data.title }),
        ...(data.value !== undefined && { value: data.value?.toString() ?? null }),
        ...(data.terms !== undefined && { terms: data.terms }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.endDate !== undefined && { endDate: data.endDate }),
        ...(data.renewalDate !== undefined && { renewalDate: data.renewalDate }),
        ...(data.status !== undefined && { status: data.status as 'draft' | 'active' | 'expired' | 'cancelled' }),
        updatedAt: new Date(),
      })
      .where(and(eq(vendorContracts.id, id), eq(vendorContracts.tenantId, this.tenantId)))
      .returning();

    return this.getContract(row!.id);
  }

  async updateContractStatus(id: string, status: 'draft' | 'active' | 'expired' | 'cancelled'): Promise<VendorContract> {
    await this.getContract(id);
    const [row] = await this.db
      .update(vendorContracts)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(vendorContracts.id, id), eq(vendorContracts.tenantId, this.tenantId)))
      .returning();

    return this.getContract(row!.id);
  }

  // --- Ratings ---

  async createRating(data: CreateVendorRatingInput, ratedBy: string): Promise<VendorRating> {
    const overallScore = Math.round(
      (data.deliveryScore + data.qualityScore + data.pricingScore) / 3,
    );

    const [row] = await this.db
      .insert(vendorRatings)
      .values({
        tenantId: this.tenantId,
        vendorId: data.vendorId,
        period: data.period,
        deliveryScore: data.deliveryScore,
        qualityScore: data.qualityScore,
        pricingScore: data.pricingScore,
        overallScore,
        notes: data.notes ?? null,
        ratedBy,
      })
      .returning();

    return this.toRating(row!);
  }

  async listRatings(vendorId?: string): Promise<VendorRating[]> {
    const conditions = [eq(vendorRatings.tenantId, this.tenantId)];
    if (vendorId) conditions.push(eq(vendorRatings.vendorId, vendorId));

    const rows = await this.db
      .select()
      .from(vendorRatings)
      .where(and(...conditions))
      .orderBy(desc(vendorRatings.createdAt));

    return rows.map((r) => this.toRating(r));
  }

  async getVendorScorecard(vendorId: string): Promise<{
    vendorId: string;
    avgDelivery: number;
    avgQuality: number;
    avgPricing: number;
    avgOverall: number;
    totalRatings: number;
  }> {
    const [result] = await this.db
      .select({
        avgDelivery: sql<number>`round(avg(${vendorRatings.deliveryScore}), 1)::float`,
        avgQuality: sql<number>`round(avg(${vendorRatings.qualityScore}), 1)::float`,
        avgPricing: sql<number>`round(avg(${vendorRatings.pricingScore}), 1)::float`,
        avgOverall: sql<number>`round(avg(${vendorRatings.overallScore}), 1)::float`,
        totalRatings: sql<number>`count(*)::int`,
      })
      .from(vendorRatings)
      .where(and(eq(vendorRatings.tenantId, this.tenantId), eq(vendorRatings.vendorId, vendorId)));

    return {
      vendorId,
      avgDelivery: result?.avgDelivery ?? 0,
      avgQuality: result?.avgQuality ?? 0,
      avgPricing: result?.avgPricing ?? 0,
      avgOverall: result?.avgOverall ?? 0,
      totalRatings: result?.totalRatings ?? 0,
    };
  }

  // --- Requisitions ---

  async createRequisition(data: CreateRequisitionInput, requestedBy: string): Promise<PurchaseRequisition> {
    return this.db.transaction(async (tx) => {
      const reqNumber = await this.generateRequisitionNumber(tx);
      const items = data.items.map((i) => ({
        ...i,
        estimatedUnitPrice: i.estimatedUnitPrice ?? 0,
        estimatedAmount: i.quantity * (i.estimatedUnitPrice ?? 0),
      }));
      const totalAmount = decimalSum(items.map((i) => i.estimatedAmount.toString()));

      const [pr] = await tx
        .insert(purchaseRequisitions)
        .values({
          tenantId: this.tenantId,
          requisitionNumber: reqNumber,
          requestedBy,
          vendorId: data.vendorId ?? null,
          description: data.description,
          totalAmount,
          status: 'draft',
        })
        .returning();

      const itemRows = await tx
        .insert(purchaseRequisitionItems)
        .values(
          items.map((i) => ({
            tenantId: this.tenantId,
            requisitionId: pr!.id,
            itemName: i.itemName,
            quantity: i.quantity.toString(),
            estimatedUnitPrice: i.estimatedUnitPrice.toString(),
            estimatedAmount: i.estimatedAmount.toString(),
          })),
        )
        .returning();

      return this.toRequisition(pr!, itemRows);
    });
  }

  async listRequisitions(status?: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'converted'): Promise<PurchaseRequisition[]> {
    const conditions = [eq(purchaseRequisitions.tenantId, this.tenantId)];
    if (status) conditions.push(eq(purchaseRequisitions.status, status));

    const rows = await this.db
      .select({ pr: purchaseRequisitions, vendorName: vendors.name, requestedByName: users.name })
      .from(purchaseRequisitions)
      .leftJoin(vendors, eq(purchaseRequisitions.vendorId, vendors.id))
      .innerJoin(users, eq(purchaseRequisitions.requestedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(purchaseRequisitions.createdAt));

    return Promise.all(rows.map(async (r) => {
      const items = await this.db.select().from(purchaseRequisitionItems)
        .where(eq(purchaseRequisitionItems.requisitionId, r.pr.id));
      return { ...this.toRequisition(r.pr, items), vendorName: r.vendorName ?? undefined, requestedByName: r.requestedByName };
    }));
  }

  async updateRequisition(
    id: string,
    data: { vendorId?: string | null; description?: string; items?: { itemName: string; quantity: number; estimatedUnitPrice?: number }[] },
  ): Promise<PurchaseRequisition> {
    const pr = await this.fetchRequisition(id);
    if (pr.status !== 'draft' && pr.status !== 'pending_approval') {
      throw new ConflictError(`Cannot edit requisition with status "${pr.status}"`);
    }

    return this.db.transaction(async (tx) => {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.vendorId !== undefined) updates.vendorId = data.vendorId || null;
      if (data.description !== undefined) updates.description = data.description;

      if (data.items) {
        await tx.delete(purchaseRequisitionItems)
          .where(eq(purchaseRequisitionItems.requisitionId, id));

        const items = data.items.map((i) => ({
          ...i,
          estimatedUnitPrice: i.estimatedUnitPrice ?? 0,
          estimatedAmount: i.quantity * (i.estimatedUnitPrice ?? 0),
        }));
        updates.totalAmount = decimalSum(items.map((i) => i.estimatedAmount.toString()));

        await tx.insert(purchaseRequisitionItems).values(
          items.map((i) => ({
            tenantId: this.tenantId,
            requisitionId: id,
            itemName: i.itemName,
            quantity: i.quantity.toString(),
            estimatedUnitPrice: i.estimatedUnitPrice.toString(),
            estimatedAmount: i.estimatedAmount.toString(),
          })),
        );
      }

      const [updated] = await tx
        .update(purchaseRequisitions)
        .set(updates)
        .where(eq(purchaseRequisitions.id, id))
        .returning();

      return this.attachRequisitionItems(updated!);
    });
  }

  async approveRequisition(id: string, userId: string): Promise<PurchaseRequisition> {
    const pr = await this.fetchRequisition(id);
    if (pr.status !== 'draft' && pr.status !== 'pending_approval') {
      throw new ConflictError(`Cannot approve requisition with status "${pr.status}"`);
    }

    // All items must have pricing filled in before approval
    const items = await this.db.select().from(purchaseRequisitionItems)
      .where(eq(purchaseRequisitionItems.requisitionId, id));
    const unpriced = items.filter((i) => !i.estimatedUnitPrice || Number(i.estimatedUnitPrice) === 0);
    if (unpriced.length > 0) {
      throw new ConflictError(`${unpriced.length} item(s) missing unit price. Fill in pricing before approving.`);
    }

    // Check workflow approval if configured
    const wfSvc = new WorkflowService(this.db, this.tenantId);
    const approved = await wfSvc.isApproved('purchase_requisition', id);
    if (!approved) {
      throw new ConflictError('Requisition requires workflow approval before it can be approved');
    }

    const [updated] = await this.db
      .update(purchaseRequisitions)
      .set({ status: 'approved', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseRequisitions.id, id))
      .returning();

    return this.attachRequisitionItems(updated!);
  }

  async convertRequisitionToPO(id: string): Promise<PurchaseRequisition> {
    const pr = await this.fetchRequisition(id);
    if (pr.status !== 'approved') {
      throw new ConflictError(`Cannot convert requisition with status "${pr.status}"`);
    }
    if (!pr.vendorId) {
      throw new ConflictError('Requisition must have a vendor assigned before converting to PO');
    }

    const items = await this.db.select()
      .from(purchaseRequisitionItems)
      .where(eq(purchaseRequisitionItems.requisitionId, id));

    return this.db.transaction(async (tx) => {
      // Generate PO number
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.tenantId, this.tenantId));
      const poNumber = `PO-${String((countRow?.count ?? 0) + 1).padStart(4, '0')}`;

      // Create PO
      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          tenantId: this.tenantId,
          poNumber,
          vendorId: pr.vendorId!,
          orderDate: new Date().toISOString().split('T')[0],
          totalAmount: pr.totalAmount,
          status: 'confirmed',
          notes: `Converted from ${pr.requisitionNumber}`,
        })
        .returning();

      // Create PO items from PR items
      if (items.length > 0) {
        await tx.insert(purchaseOrderItems).values(
          items.map((item) => ({
            tenantId: this.tenantId,
            poId: po!.id,
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.estimatedUnitPrice,
            amount: item.estimatedAmount,
          })),
        );
      }

      // Update PR with PO link and status
      const [updated] = await tx
        .update(purchaseRequisitions)
        .set({ status: 'converted', poId: po!.id, updatedAt: new Date() })
        .where(eq(purchaseRequisitions.id, id))
        .returning();

      return this.attachRequisitionItems(updated!);
    });
  }

  // --- Payment Schedules ---

  async createPaymentSchedule(data: CreatePaymentScheduleInput, createdBy: string): Promise<PaymentSchedule> {
    return this.db.transaction(async (tx) => {
      const totalAmount = decimalSum(data.items.map((i) => i.amount.toString()));

      const [schedule] = await tx
        .insert(paymentSchedules)
        .values({
          tenantId: this.tenantId,
          name: data.name,
          scheduledDate: data.scheduledDate,
          totalAmount,
          createdBy,
        })
        .returning();

      const itemRows = await tx
        .insert(paymentScheduleItems)
        .values(
          data.items.map((i) => ({
            tenantId: this.tenantId,
            scheduleId: schedule!.id,
            invoiceId: i.invoiceId,
            vendorId: i.vendorId,
            amount: i.amount.toString(),
          })),
        )
        .returning();

      return this.toSchedule(schedule!, itemRows);
    });
  }

  async listPaymentSchedules(status?: 'draft' | 'approved' | 'processing' | 'completed' | 'cancelled'): Promise<PaymentSchedule[]> {
    const conditions = [eq(paymentSchedules.tenantId, this.tenantId)];
    if (status) conditions.push(eq(paymentSchedules.status, status));

    const rows = await this.db
      .select()
      .from(paymentSchedules)
      .where(and(...conditions))
      .orderBy(desc(paymentSchedules.createdAt));

    return Promise.all(rows.map((r) => this.attachScheduleItems(r)));
  }

  async approvePaymentSchedule(id: string, userId: string): Promise<PaymentSchedule> {
    const [existing] = await this.db
      .select()
      .from(paymentSchedules)
      .where(and(eq(paymentSchedules.id, id), eq(paymentSchedules.tenantId, this.tenantId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Payment schedule');
    if (existing.status !== 'draft') {
      throw new ConflictError(`Cannot approve schedule with status "${existing.status}"`);
    }

    const [updated] = await this.db
      .update(paymentSchedules)
      .set({ status: 'approved', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentSchedules.id, id))
      .returning();

    return this.attachScheduleItems(updated!);
  }

  // --- Early Payment Discounts ---

  async getEarlyPaymentDiscounts() {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const todayMs = new Date(today).getTime();

    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        vendorId: purchaseInvoices.vendorId,
        vendorName: vendors.name,
        dueDate: purchaseInvoices.dueDate,
        totalAmount: purchaseInvoices.totalAmount,
        balanceDue: purchaseInvoices.balanceDue,
        status: purchaseInvoices.status,
        discountPercent: vendors.earlyPaymentDiscountPercent,
        discountDays: vendors.earlyPaymentDiscountDays,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(purchaseInvoices.vendorId, vendors.id))
      .where(
        and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          lte(purchaseInvoices.dueDate, thirtyDaysOut),
          sql`${purchaseInvoices.status} NOT IN ('paid', 'cancelled', 'draft')`,
        ),
      )
      .orderBy(purchaseInvoices.dueDate);

    return rows.map((r) => {
      const dueDateMs = new Date(r.dueDate).getTime();
      const daysRemaining = Math.ceil((dueDateMs - todayMs) / 86400000);
      const balance = toNumber(r.balanceDue);
      const discountPercent = r.discountPercent ? Number(r.discountPercent) : null;
      const discountDays = r.discountDays ?? null;

      // Calculate discount window from invoice date
      let discountDaysRemaining: number | null = null;
      let savingsAmount: number | null = null;
      let discountAvailable = false;
      if (discountPercent && discountDays && r.invoiceDate) {
        const invoiceDateMs = new Date(r.invoiceDate).getTime();
        const discountDeadlineMs = invoiceDateMs + discountDays * 86400000;
        discountDaysRemaining = Math.ceil((discountDeadlineMs - todayMs) / 86400000);
        if (discountDaysRemaining > 0) {
          discountAvailable = true;
          savingsAmount = Math.round(balance * discountPercent) / 100;
        }
      }

      return {
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        dueDate: r.dueDate,
        totalAmount: toNumber(r.totalAmount),
        balanceDue: balance,
        status: r.status,
        daysRemaining,
        discountPercent,
        discountDays,
        discountDaysRemaining,
        discountAvailable,
        savingsAmount,
      };
    });
  }

  // --- Private helpers ---

  private async generateRequisitionNumber(tx: any): Promise<string> {
    const [result] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseRequisitions)
      .where(eq(purchaseRequisitions.tenantId, this.tenantId));

    const next = (result?.count ?? 0) + 1;
    return `PR-${next.toString().padStart(4, '0')}`;
  }

  private async fetchRequisition(id: string) {
    const [row] = await this.db
      .select()
      .from(purchaseRequisitions)
      .where(and(eq(purchaseRequisitions.id, id), eq(purchaseRequisitions.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Purchase requisition');
    return row;
  }

  private async attachRequisitionItems(pr: typeof purchaseRequisitions.$inferSelect): Promise<PurchaseRequisition> {
    const items = await this.db
      .select()
      .from(purchaseRequisitionItems)
      .where(eq(purchaseRequisitionItems.requisitionId, pr.id));

    return this.toRequisition(pr, items);
  }

  async getPaymentSchedule(id: string): Promise<PaymentSchedule> {
    const [row] = await this.db
      .select()
      .from(paymentSchedules)
      .where(and(eq(paymentSchedules.id, id), eq(paymentSchedules.tenantId, this.tenantId)))
      .limit(1);

    if (!row) throw new NotFoundError('Payment schedule');
    return this.attachScheduleItems(row);
  }

  private async attachScheduleItems(s: typeof paymentSchedules.$inferSelect): Promise<PaymentSchedule> {
    const items = await this.db
      .select({
        item: paymentScheduleItems,
        vendorName: vendors.name,
        invoiceNumber: purchaseInvoices.invoiceNumber,
      })
      .from(paymentScheduleItems)
      .innerJoin(vendors, eq(paymentScheduleItems.vendorId, vendors.id))
      .innerJoin(purchaseInvoices, eq(paymentScheduleItems.invoiceId, purchaseInvoices.id))
      .where(eq(paymentScheduleItems.scheduleId, s.id));

    return this.toScheduleWithDetails(s, items);
  }

  private toContract(r: typeof vendorContracts.$inferSelect): VendorContract {
    return {
      id: r.id,
      vendorId: r.vendorId,
      contractNumber: r.contractNumber,
      title: r.title,
      startDate: r.startDate,
      endDate: r.endDate,
      value: r.value ? toNumber(r.value) : null,
      terms: r.terms,
      status: r.status,
      renewalDate: r.renewalDate,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toRating(r: typeof vendorRatings.$inferSelect): VendorRating {
    return {
      id: r.id,
      vendorId: r.vendorId,
      period: r.period,
      deliveryScore: r.deliveryScore,
      qualityScore: r.qualityScore,
      pricingScore: r.pricingScore,
      overallScore: r.overallScore,
      notes: r.notes,
      ratedBy: r.ratedBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toRequisition(
    pr: typeof purchaseRequisitions.$inferSelect,
    items: (typeof purchaseRequisitionItems.$inferSelect)[],
  ): PurchaseRequisition {
    return {
      id: pr.id,
      tenantId: pr.tenantId,
      requisitionNumber: pr.requisitionNumber,
      requestedBy: pr.requestedBy,
      vendorId: pr.vendorId,
      description: pr.description,
      totalAmount: toNumber(pr.totalAmount),
      status: pr.status,
      approvedBy: pr.approvedBy,
      approvedAt: pr.approvedAt?.toISOString() ?? null,
      poId: pr.poId,
      items: items.map((i) => ({
        id: i.id,
        itemName: i.itemName,
        quantity: toNumber(i.quantity),
        estimatedUnitPrice: toNumber(i.estimatedUnitPrice),
        estimatedAmount: toNumber(i.estimatedAmount),
        notes: i.notes ?? null,
      })),
      createdAt: pr.createdAt.toISOString(),
    };
  }

  private toSchedule(
    s: typeof paymentSchedules.$inferSelect,
    items: (typeof paymentScheduleItems.$inferSelect)[],
  ): PaymentSchedule {
    return {
      id: s.id,
      name: s.name,
      scheduledDate: s.scheduledDate,
      status: s.status,
      totalAmount: toNumber(s.totalAmount),
      items: items.map((i) => ({
        id: i.id,
        invoiceId: i.invoiceId,
        vendorId: i.vendorId,
        amount: toNumber(i.amount),
      })),
      createdBy: s.createdBy,
      approvedBy: s.approvedBy,
      createdAt: s.createdAt.toISOString(),
    };
  }

  private toScheduleWithDetails(
    s: typeof paymentSchedules.$inferSelect,
    items: { item: typeof paymentScheduleItems.$inferSelect; vendorName: string; invoiceNumber: string }[],
  ): PaymentSchedule {
    return {
      id: s.id,
      name: s.name,
      scheduledDate: s.scheduledDate,
      status: s.status,
      totalAmount: toNumber(s.totalAmount),
      items: items.map((r) => ({
        id: r.item.id,
        invoiceId: r.item.invoiceId,
        invoiceNumber: r.invoiceNumber,
        vendorId: r.item.vendorId,
        vendorName: r.vendorName,
        amount: toNumber(r.item.amount),
      })),
      createdBy: s.createdBy,
      approvedBy: s.approvedBy,
      createdAt: s.createdAt.toISOString(),
    };
  }
}

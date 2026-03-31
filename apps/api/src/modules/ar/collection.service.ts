import { eq, and, sql } from 'drizzle-orm';
import { collectionAssignments, salesInvoices, customers, users } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError } from '../../utils/errors';

export interface CreateAssignmentInput {
  invoiceId: string;
  assignedTo: string;
  notes?: string | null;
  followUpDate?: string | null;
}

export interface UpdateAssignmentInput {
  status?: 'open' | 'contacted' | 'promised' | 'resolved' | 'escalated';
  notes?: string | null;
  followUpDate?: string | null;
  assignedTo?: string;
}

export interface CollectionAssignment {
  id: string;
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  assignedTo: string;
  assigneeName: string;
  assignedAt: string;
  balanceDue: number;
  status: string;
  notes: string | null;
  followUpDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export class CollectionService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(assigneeId?: string): Promise<CollectionAssignment[]> {
    const conditions = [eq(collectionAssignments.tenantId, this.tenantId)];
    if (assigneeId) {
      conditions.push(eq(collectionAssignments.assignedTo, assigneeId));
    }

    const rows = await this.db
      .select({
        id: collectionAssignments.id,
        tenantId: collectionAssignments.tenantId,
        invoiceId: collectionAssignments.invoiceId,
        invoiceNumber: salesInvoices.invoiceNumber,
        customerName: customers.name,
        balanceDue: salesInvoices.balanceDue,
        assignedTo: collectionAssignments.assignedTo,
        assigneeName: users.name,
        assignedAt: collectionAssignments.assignedAt,
        status: collectionAssignments.status,
        notes: collectionAssignments.notes,
        followUpDate: collectionAssignments.followUpDate,
        createdAt: collectionAssignments.createdAt,
        updatedAt: collectionAssignments.updatedAt,
      })
      .from(collectionAssignments)
      .innerJoin(salesInvoices, eq(collectionAssignments.invoiceId, salesInvoices.id))
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .innerJoin(users, eq(collectionAssignments.assignedTo, users.id))
      .where(and(...conditions))
      .orderBy(collectionAssignments.createdAt);

    return rows.map(this.toAssignment);
  }

  async create(input: CreateAssignmentInput): Promise<CollectionAssignment> {
    const [row] = await this.db
      .insert(collectionAssignments)
      .values({
        tenantId: this.tenantId,
        invoiceId: input.invoiceId,
        assignedTo: input.assignedTo,
        notes: input.notes ?? null,
        followUpDate: input.followUpDate ?? null,
      })
      .returning();

    return this.getById(row!.id);
  }

  async update(id: string, input: UpdateAssignmentInput): Promise<CollectionAssignment> {
    const [row] = await this.db
      .update(collectionAssignments)
      .set({
        ...(input.status !== undefined && { status: input.status }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.followUpDate !== undefined && { followUpDate: input.followUpDate }),
        ...(input.assignedTo !== undefined && { assignedTo: input.assignedTo }),
        updatedAt: new Date(),
      })
      .where(
        and(eq(collectionAssignments.id, id), eq(collectionAssignments.tenantId, this.tenantId)),
      )
      .returning();

    if (!row) throw new NotFoundError('Collection assignment');
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const [row] = await this.db
      .delete(collectionAssignments)
      .where(
        and(eq(collectionAssignments.id, id), eq(collectionAssignments.tenantId, this.tenantId)),
      )
      .returning();

    if (!row) throw new NotFoundError('Collection assignment');
  }

  private async getById(id: string): Promise<CollectionAssignment> {
    const rows = await this.db
      .select({
        id: collectionAssignments.id,
        tenantId: collectionAssignments.tenantId,
        invoiceId: collectionAssignments.invoiceId,
        invoiceNumber: salesInvoices.invoiceNumber,
        customerName: customers.name,
        balanceDue: salesInvoices.balanceDue,
        assignedTo: collectionAssignments.assignedTo,
        assigneeName: users.name,
        assignedAt: collectionAssignments.assignedAt,
        status: collectionAssignments.status,
        notes: collectionAssignments.notes,
        followUpDate: collectionAssignments.followUpDate,
        createdAt: collectionAssignments.createdAt,
        updatedAt: collectionAssignments.updatedAt,
      })
      .from(collectionAssignments)
      .innerJoin(salesInvoices, eq(collectionAssignments.invoiceId, salesInvoices.id))
      .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
      .innerJoin(users, eq(collectionAssignments.assignedTo, users.id))
      .where(
        and(eq(collectionAssignments.id, id), eq(collectionAssignments.tenantId, this.tenantId)),
      )
      .limit(1);

    if (rows.length === 0) throw new NotFoundError('Collection assignment');
    return this.toAssignment(rows[0]!);
  }

  private toAssignment(row: {
    id: string;
    tenantId: string;
    invoiceId: string;
    invoiceNumber: string;
    customerName: string;
    balanceDue: string;
    assignedTo: string;
    assigneeName: string;
    assignedAt: Date;
    status: string;
    notes: string | null;
    followUpDate: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CollectionAssignment {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      customerName: row.customerName,
      assignedTo: row.assignedTo,
      assigneeName: row.assigneeName,
      assignedAt: row.assignedAt.toISOString(),
      balanceDue: Number(row.balanceDue),
      status: row.status,
      notes: row.notes,
      followUpDate: row.followUpDate,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

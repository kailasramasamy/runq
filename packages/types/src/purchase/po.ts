/**
 * PP Phase 1 — Purchase Order domain types.
 * Spec: docs/purchase-procurement-plan.md §4.
 */

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled';

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  poNumber: string;
  vendorId: string;

  poDate: string;
  expectedDate: string | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
  notes: string | null;

  status: PurchaseOrderStatus;
  sourcePrId: string | null;

  subtotal: number;
  taxTotal: number;
  total: number;

  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  closedAt: string | null;
  closedReason: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLine {
  id: string;
  tenantId: string;
  poId: string;
  lineNo: number;

  description: string;
  catalogItemId: string | null;
  uom: string | null;
  hsnSacCode: string | null;

  qtyOrdered: number;
  unitRate: number;
  amount: number;
  taxRate: number | null;
  taxAmount: number | null;

  /** Denormalised counters; driven by Phase 2 (GRN) and AP bill match. */
  qtyReceived: number;
  qtyBilled: number;

  notes: string | null;
  createdAt: string;
}

export interface PurchaseOrderWithLines extends PurchaseOrder {
  lines: PurchaseOrderLine[];
  vendorName: string;
}

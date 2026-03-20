export type PurchaseInvoiceStatus = 'draft' | 'pending_match' | 'matched' | 'approved' | 'partially_paid' | 'paid' | 'cancelled';
export type MatchStatus = 'unmatched' | 'matched' | 'mismatch';

export interface PurchaseInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  vendorId: string;
  poId: string | null;
  grnId: string | null;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: PurchaseInvoiceStatus;
  matchStatus: MatchStatus;
  matchNotes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  wmsInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseInvoiceItem {
  id: string;
  tenantId: string;
  invoiceId: string;
  poItemId: string | null;
  itemName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface PurchaseInvoiceWithDetails extends PurchaseInvoice {
  items: PurchaseInvoiceItem[];
  vendorName: string;
}

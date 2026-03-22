export type SalesInvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export interface SalesInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountReceived: number;
  balanceDue: number;
  status: SalesInvoiceStatus;
  discountPercent: number | null;
  discountDays: number | null;
  notes: string | null;
  fileUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesInvoiceItem {
  id: string;
  tenantId: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface SalesInvoiceWithDetails extends SalesInvoice {
  items: SalesInvoiceItem[];
  customerName: string;
}

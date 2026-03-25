import type { TaxCategory } from '../common/gst';

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
  // GST fields
  placeOfSupply: string | null;
  placeOfSupplyCode: string | null;
  isInterState: boolean | null;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  reverseCharge: boolean;
  irnNumber: string | null;
  irnDate: string | null;
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
  // GST fields
  hsnSacCode: string | null;
  taxCategory: TaxCategory | null;
  taxRate: number | null;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  cessRate: number;
  cessAmount: number;
}

export interface SalesInvoiceWithDetails extends SalesInvoice {
  items: SalesInvoiceItem[];
  customerName: string;
}

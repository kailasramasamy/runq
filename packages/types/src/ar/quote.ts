export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface SalesQuote {
  id: string;
  tenantId: string;
  customerId: string;
  quoteNumber: string;
  quoteDate: string;
  expiryDate: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: QuoteStatus;
  notes: string | null;
  terms: string | null;
  convertedToInvoiceId: string | null;
  convertedToOrderId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesQuoteItem {
  id: string;
  tenantId: string;
  quoteId: string;
  itemId: string | null;
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number | null;
  taxAmount: number;
}

export interface SalesQuoteWithDetails extends SalesQuote {
  items: SalesQuoteItem[];
  customerName: string;
}

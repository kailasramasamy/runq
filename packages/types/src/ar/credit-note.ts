export type CreditNoteStatus = 'draft' | 'issued' | 'adjusted' | 'cancelled';

export interface CreditNoteItem {
  id: string;
  creditNoteId: string;
  itemId: string | null;
  description: string;
  uom: string | null;
  packSizeValue: number;
  packSizeUqc: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  hsnSacCode: string | null;
  taxCategory: 'taxable' | 'exempt' | 'nil_rated' | 'zero_rated' | 'reverse_charge' | null;
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

export interface CreditNote {
  id: string;
  tenantId: string;
  creditNoteNumber: string;
  customerId: string;
  invoiceId: string | null;
  issueDate: string;
  amount: number;
  reason: string;
  status: CreditNoteStatus;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  placeOfSupply: string | null;
  placeOfSupplyCode: string | null;
  isInterState: boolean | null;
  reverseCharge: boolean;
  amendsInvoiceNumber: string | null;
  amendsInvoiceDate: string | null;
  createdAt: string;
  updatedAt: string;
  items?: CreditNoteItem[];
}

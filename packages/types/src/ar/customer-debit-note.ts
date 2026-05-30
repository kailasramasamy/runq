import type { CreditNoteItem } from './credit-note';

// Reuses debit_note_status enum from vendor-side debit notes.
export type CustomerDebitNoteStatus = 'draft' | 'issued' | 'adjusted' | 'cancelled';

// Identical column shape to CreditNoteItem; reuse the type.
export type CustomerDebitNoteItem = Omit<CreditNoteItem, 'creditNoteId'> & {
  customerDebitNoteId: string;
};

export interface CustomerDebitNote {
  id: string;
  tenantId: string;
  debitNoteNumber: string;
  customerId: string;
  invoiceId: string | null;
  issueDate: string;
  amount: number;
  reason: string;
  status: CustomerDebitNoteStatus;
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
  items?: CustomerDebitNoteItem[];
}

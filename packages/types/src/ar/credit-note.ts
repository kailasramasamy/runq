export type CreditNoteStatus = 'draft' | 'issued' | 'adjusted' | 'cancelled';

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
  createdAt: string;
  updatedAt: string;
}

export type DebitNoteStatus = 'draft' | 'issued' | 'adjusted' | 'cancelled';

export interface DebitNote {
  id: string;
  tenantId: string;
  debitNoteNumber: string;
  vendorId: string;
  invoiceId: string | null;
  issueDate: string;
  amount: number;
  reason: string;
  status: DebitNoteStatus;
  createdAt: string;
  updatedAt: string;
}

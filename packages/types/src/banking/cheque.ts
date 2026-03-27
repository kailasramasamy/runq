export type ChequeType = 'received' | 'issued';
export type ChequePartyType = 'vendor' | 'customer';
export type ChequeStatus = 'pending' | 'deposited' | 'cleared' | 'bounced' | 'cancelled';

export interface Cheque {
  id: string;
  tenantId: string;
  chequeNumber: string;
  bankAccountId: string;
  type: ChequeType;
  partyType: ChequePartyType;
  partyId: string;
  partyName?: string;
  amount: number;
  chequeDate: string;
  depositDate: string | null;
  status: ChequeStatus;
  linkedInvoiceId: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

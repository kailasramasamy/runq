export type RecurrenceFrequency = 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type RecurringStatus = 'active' | 'paused' | 'completed';

export interface RecurringInvoiceTemplate {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  frequency: RecurrenceFrequency;
  intervalDays: number | null;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  status: RecurringStatus;
  items: RecurringLineItem[];
  notes: string | null;
  autoSend: boolean;
  lastGeneratedAt: string | null;
  totalGenerated: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  hsnSacCode?: string | null;
  taxRate?: number | null;
  taxCategory?: string | null;
}

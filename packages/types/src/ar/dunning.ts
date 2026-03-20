export type DunningChannel = 'email' | 'sms' | 'whatsapp';

export interface DunningRule {
  id: string;
  tenantId: string;
  name: string;
  daysAfterDue: number;
  channel: DunningChannel;
  subjectTemplate: string | null;
  bodyTemplate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DunningLogEntry {
  id: string;
  tenantId: string;
  invoiceId: string;
  ruleId: string;
  sentAt: string;
  channel: DunningChannel;
  status: 'sent' | 'delivered' | 'failed';
  createdAt: string;
}

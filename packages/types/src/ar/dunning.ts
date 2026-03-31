export type DunningChannel = 'email' | 'sms' | 'whatsapp';
export type DunningAction = 'send_reminder' | 'stop_supply' | 'escalate_to_manager';

export interface DunningRule {
  id: string;
  tenantId: string;
  name: string;
  daysAfterDue: number;
  channel: DunningChannel;
  action: DunningAction;
  escalationLevel: number;
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

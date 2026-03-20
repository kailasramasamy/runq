export type WMSEventType =
  | 'vendor.created'
  | 'vendor.updated'
  | 'po.created'
  | 'po.updated'
  | 'grn.created'
  | 'grn.updated'
  | 'invoice.created'
  | 'invoice.updated';

export type WebhookEventStatus = 'received' | 'processing' | 'processed' | 'failed';

export interface WMSWebhookEvent {
  eventType: WMSEventType;
  eventId: string;
  timestamp: string;
  tenantId: string;
  payload: Record<string, unknown>;
}

export interface WebhookEvent {
  id: string;
  tenantId: string;
  eventType: WMSEventType;
  source: string;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  errorMessage: string | null;
  retries: number;
  maxRetries: number;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

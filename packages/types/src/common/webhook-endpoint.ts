export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  description: string | null;
  lastDeliveredAt: string | null;
  failureCount: number;
  createdAt: string;
}

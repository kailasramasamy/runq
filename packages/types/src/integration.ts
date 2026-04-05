export interface Integration {
  id: string;
  provider: string;
  isActive: boolean;
  config: Record<string, unknown>;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface IntegrationLog {
  id: string;
  integrationId: string;
  action: string;
  status: 'success' | 'error';
  message: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

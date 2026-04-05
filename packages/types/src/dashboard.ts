export interface DashboardWidget {
  id: string;
  widgetType: string;
  position: number;
  config: Record<string, unknown>;
  isVisible: boolean;
}

export interface ScheduledReport {
  id: string;
  name: string;
  reportType: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  config: Record<string, unknown>;
  isActive: boolean;
  lastSentAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | null;
  lastError: string | null;
  createdAt: string;
}

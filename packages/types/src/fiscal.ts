export interface FiscalPeriod {
  id: string;
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed' | 'locked';
  closedBy: string | null;
  closedAt: string | null;
}

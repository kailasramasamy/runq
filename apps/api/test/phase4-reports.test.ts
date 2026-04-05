import { describe, it, expect } from 'vitest';
import { get } from './helpers';

describe('Phase 4: Financial Reports', () => {
  const fy = { dateFrom: '2025-04-01', dateTo: '2026-03-31' };

  describe('GET /reports/profit-and-loss', () => {
    it('returns P&L for period', async () => {
      const { status, body } = await get(
        `/reports/profit-and-loss?dateFrom=${fy.dateFrom}&dateTo=${fy.dateTo}`,
      );
      expect(status).toBe(200);
      expect(body.data).toHaveProperty('period');
      expect(body.data).toHaveProperty('revenue');
      expect(body.data).toHaveProperty('expenses');
      expect(body.data).toHaveProperty('totalRevenue');
      expect(body.data).toHaveProperty('totalExpenses');
      expect(body.data).toHaveProperty('netProfit');
      expect(typeof body.data.netProfit).toBe('number');
    });
  });

  describe('GET /reports/balance-sheet', () => {
    it('returns balance sheet as of today', async () => {
      const { status, body } = await get('/reports/balance-sheet');
      expect(status).toBe(200);
      expect(body.data).toHaveProperty('asOfDate');
      expect(body.data).toHaveProperty('assets');
      expect(body.data).toHaveProperty('liabilities');
      expect(body.data).toHaveProperty('equity');
      expect(body.data).toHaveProperty('totalAssets');
    });

    it('accepts asOfDate parameter', async () => {
      const { status, body } = await get(
        '/reports/balance-sheet?asOfDate=2026-03-31',
      );
      expect(status).toBe(200);
      expect(body.data.asOfDate).toBe('2026-03-31');
    });
  });

  describe('GET /reports/cash-flow', () => {
    it('returns cash flow statement', async () => {
      const { status, body } = await get(
        `/reports/cash-flow?dateFrom=${fy.dateFrom}&dateTo=${fy.dateTo}`,
      );
      expect(status).toBe(200);
      expect(body.data).toHaveProperty('operating');
      expect(body.data).toHaveProperty('investing');
      expect(body.data).toHaveProperty('financing');
      expect(body.data).toHaveProperty('netChange');
      expect(body.data).toHaveProperty('openingBalance');
      expect(body.data).toHaveProperty('closingBalance');
    });
  });

  describe('GET /reports/expense-analytics', () => {
    it('returns expense breakdown', async () => {
      const { status, body } = await get(
        `/reports/expense-analytics?dateFrom=${fy.dateFrom}&dateTo=${fy.dateTo}`,
      );
      expect(status).toBe(200);
      expect(body.data).toHaveProperty('byCategory');
      expect(body.data).toHaveProperty('byVendor');
      expect(body.data).toHaveProperty('byMonth');
      expect(body.data).toHaveProperty('total');
    });
  });

  describe('GET /reports/revenue-analytics', () => {
    it('returns revenue breakdown', async () => {
      const { status, body } = await get(
        `/reports/revenue-analytics?dateFrom=${fy.dateFrom}&dateTo=${fy.dateTo}`,
      );
      expect(status).toBe(200);
      expect(body.data).toHaveProperty('byCustomer');
      expect(body.data).toHaveProperty('byMonth');
      expect(body.data).toHaveProperty('total');
    });
  });

  describe('GET /reports/comparison', () => {
    it('returns MoM comparison', async () => {
      const { status, body } = await get(
        '/reports/comparison?type=mom&dateFrom=2026-01-01&dateTo=2026-03-31',
      );
      expect(status).toBe(200);
      expect(body.data).toHaveProperty('periods');
      expect(body.data).toHaveProperty('rows');
      expect(body.data.rows.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('GET /reports/cash-flow-forecast', () => {
    it('returns 90-day forecast by default', async () => {
      const { status, body } = await get('/reports/cash-flow-forecast');
      expect(status).toBe(200);
      expect(body.data).toHaveProperty('projections');
      expect(body.data).toHaveProperty('currentBalance');
      expect(body.data).toHaveProperty('projectedBalance30d');
      expect(body.data).toHaveProperty('projectedBalance60d');
      expect(body.data).toHaveProperty('projectedBalance90d');
    });

    it('accepts custom days parameter', async () => {
      const { status, body } = await get(
        '/reports/cash-flow-forecast?days=30',
      );
      expect(status).toBe(200);
      expect(body.data.projections.length).toBeGreaterThan(0);
    });
  });
});

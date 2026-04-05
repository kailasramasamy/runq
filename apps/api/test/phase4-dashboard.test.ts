import { describe, it, expect } from 'vitest';
import { get, post, put, del, testSuffix } from './helpers';

describe('Phase 4: Dashboard Widgets', () => {
  it('returns default widgets on first access', async () => {
    const { status, body } = await get('/dashboard/widgets');
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0]).toHaveProperty('widgetType');
    expect(body.data[0]).toHaveProperty('position');
    expect(body.data[0]).toHaveProperty('isVisible');
  });

  it('saves custom widget layout', async () => {
    const { status, body } = await put('/dashboard/widgets', {
      widgets: [
        { widgetType: 'stats_overview', position: 0, isVisible: true },
        { widgetType: 'cash_position', position: 1, isVisible: true },
        { widgetType: 'ai_insights', position: 2, isVisible: false },
      ],
    });
    expect(status).toBe(200);
    expect(body.data.length).toBe(3);
  });
});

describe('Phase 4: Scheduled Reports', () => {
  let reportId: string;
  const reportName = `Daily Cash Position${testSuffix}`;

  it('creates a scheduled report', async () => {
    const { status, body } = await post('/dashboard/scheduled-reports', {
      name: reportName,
      reportType: 'cash_position',
      frequency: 'daily',
      recipients: ['admin@demo.com'],
    });
    expect(status).toBe(201);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toBe(reportName);
    expect(body.data.isActive).toBe(true);
    reportId = body.data.id;
  });

  it('lists scheduled reports', async () => {
    const { status, body } = await get('/dashboard/scheduled-reports');
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles active status', async () => {
    if (!reportId) return;
    const { status, body } = await put(
      `/dashboard/scheduled-reports/${reportId}/toggle`,
      {},
    );
    expect(status).toBe(200);
    expect(body.data.isActive).toBe(false);
  });

  it('deletes a scheduled report', async () => {
    if (!reportId) return;
    const { status } = await del(
      `/dashboard/scheduled-reports/${reportId}`,
    );
    expect(status).toBe(200);
  });
});

import { describe, it, expect } from 'vitest';
import { get, post, put, testSuffix } from './helpers';

describe('Phase 4: Fiscal Periods', () => {
  let periodId: string;

  // Use a random offset so dates never collide across runs
  const dayOffset = Math.floor(Math.random() * 3000) + 1000;
  const start = new Date(2030, 0, 1);
  start.setDate(start.getDate() + dayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 89);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const periodName = `Test Period${testSuffix}`;

  it('creates a fiscal period', async () => {
    const { status, body } = await post('/gl/fiscal-periods', {
      name: periodName,
      startDate,
      endDate,
    });
    expect(status).toBe(201);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toBe(periodName);
    expect(body.data.status).toBe('open');
    periodId = body.data.id;
  });

  it('lists fiscal periods', async () => {
    const { status, body } = await get('/gl/fiscal-periods');
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('closes a fiscal period', async () => {
    if (!periodId) return;
    const { status, body } = await put(
      `/gl/fiscal-periods/${periodId}/close`,
      { status: 'closed' },
    );
    expect(status).toBe(200);
    expect(body.data.status).toBe('closed');
  });

  it('locks a closed fiscal period', async () => {
    if (!periodId) return;
    const { status, body } = await put(
      `/gl/fiscal-periods/${periodId}/close`,
      { status: 'locked' },
    );
    expect(status).toBe(200);
    expect(body.data.status).toBe('locked');
  });

  it('rejects closing a locked period', async () => {
    if (!periodId) return;
    const { status } = await put(
      `/gl/fiscal-periods/${periodId}/close`,
      { status: 'closed' },
    );
    expect(status).toBe(409);
  });
});

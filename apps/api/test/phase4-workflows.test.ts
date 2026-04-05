import { describe, it, expect } from 'vitest';
import { get, post, put, getAuthUserId, testSuffix } from './helpers';

describe('Phase 4: Approval Workflows', () => {
  let workflowId: string;
  const workflowName = `Payment Approval${testSuffix}`;

  it('creates an approval workflow', async () => {
    const { status, body } = await post('/workflows', {
      name: workflowName,
      entityType: 'payment',
      rules: [
        {
          stepOrder: 1,
          approverRole: 'accountant',
          minAmount: 0,
          maxAmount: 50000,
        },
        {
          stepOrder: 2,
          approverRole: 'owner',
          minAmount: 50000,
          maxAmount: null,
        },
      ],
    });
    expect(status).toBe(201);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toBe(workflowName);
    workflowId = body.data.id;
  });

  it('lists approval workflows', async () => {
    const { status, body } = await get('/workflows');
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 4: Comments', () => {
  it('creates a comment on an entity', async () => {
    const userId = await getAuthUserId();
    const { status, body } = await post('/workflows/comments', {
      entityType: 'payment',
      entityId: userId,
      content: `Review this payment${testSuffix}`,
    });
    expect([200, 201]).toContain(status);
    expect(body.data).toHaveProperty('id');
    expect(body.data.content).toBe(`Review this payment${testSuffix}`);
  });

  it('lists comments for entity', async () => {
    const userId = await getAuthUserId();
    const { status, body } = await get(
      `/workflows/comments?entityType=payment&entityId=${userId}`,
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('Phase 4: Tasks', () => {
  let taskId: string;

  it('creates a task', async () => {
    const userId = await getAuthUserId();
    const { status, body } = await post('/workflows/tasks', {
      entityType: 'payment',
      entityId: userId,
      title: `Follow up on payment${testSuffix}`,
      assignedTo: userId,
      dueDate: '2026-04-15',
    });
    expect([200, 201]).toContain(status);
    if (body.data?.id) {
      taskId = body.data.id;
      expect(body.data.title).toBe(`Follow up on payment${testSuffix}`);
      expect(body.data.status).toBe('open');
    }
  });

  it('lists tasks', async () => {
    const { status, body } = await get('/workflows/tasks');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('updates task status', async () => {
    if (!taskId) return;
    const { status, body } = await put(
      `/workflows/tasks/${taskId}/status`,
      { status: 'in_progress' },
    );
    expect(status).toBe(200);
    expect(body.data.status).toBe('in_progress');
  });
});

describe('Phase 4: Activity Timeline', () => {
  it('gets activity for entity', async () => {
    const userId = await getAuthUserId();
    const { status, body } = await get(
      `/workflows/activity?entityType=payment&entityId=${userId}`,
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

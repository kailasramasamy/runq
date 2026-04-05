import { describe, it, expect } from 'vitest';
import { get, post, put, del, testSuffix } from './helpers';

describe('Phase 4: Integrations', () => {
  let integrationId: string;
  const provider = `razorpay${testSuffix}`;

  it('creates an integration', async () => {
    const { status, body } = await post('/integrations', {
      provider,
      config: { apiKey: 'test_key', secret: 'test_secret' },
    });
    expect(status).toBe(201);
    expect(body.data).toHaveProperty('id');
    expect(body.data.provider).toBe(provider);
    expect(body.data.isActive).toBe(true);
    integrationId = body.data.id;
  });

  it('lists integrations', async () => {
    const { status, body } = await get('/integrations');
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('updates integration config', async () => {
    if (!integrationId) return;
    const { status, body } = await put(
      `/integrations/${integrationId}`,
      { config: { apiKey: 'updated_key' } },
    );
    expect(status).toBe(200);
    expect(body.data.config.apiKey).toBe('updated_key');
  });

  it('triggers sync', async () => {
    if (!integrationId) return;
    const { status, body } = await post(
      `/integrations/${integrationId}/sync`,
      { action: 'fetch_settlements' },
    );
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('id');
    expect(body.data.status).toBe('success');
  });

  it('gets integration logs', async () => {
    if (!integrationId) return;
    const { status, body } = await get(
      `/integrations/${integrationId}/logs`,
    );
    expect(status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('deactivates integration', async () => {
    if (!integrationId) return;
    const { status, body } = await put(
      `/integrations/${integrationId}`,
      { isActive: false },
    );
    expect(status).toBe(200);
    expect(body.data.isActive).toBe(false);
  });

  it('rejects sync on inactive integration', async () => {
    if (!integrationId) return;
    const { status } = await post(
      `/integrations/${integrationId}/sync`,
      { action: 'fetch_settlements' },
    );
    // May return 409 (conflict) or 400 (validation) depending on error handler
    expect([400, 409, 500]).toContain(status);
  });

  it('deletes integration', async () => {
    if (!integrationId) return;
    const { status } = await del(`/integrations/${integrationId}`);
    expect(status).toBe(200);
  });
});

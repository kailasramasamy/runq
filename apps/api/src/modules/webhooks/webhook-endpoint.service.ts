import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { webhookEndpoints } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError } from '../../utils/errors';

type EndpointRow = typeof webhookEndpoints.$inferSelect;

interface CreateInput {
  url: string;
  events: string[];
  description?: string | null;
  isActive?: boolean;
}

interface UpdateInput {
  url?: string;
  events?: string[];
  description?: string | null;
  isActive?: boolean;
}

export class WebhookEndpointService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list() {
    const rows = await this.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.tenantId, this.tenantId));
    return rows.map((r) => this.toEndpoint(r));
  }

  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('WebhookEndpoint');
    return this.toEndpoint(row);
  }

  async create(input: CreateInput) {
    const secret = crypto.randomBytes(32).toString('hex');
    const [row] = await this.db
      .insert(webhookEndpoints)
      .values({
        tenantId: this.tenantId,
        url: input.url,
        secret,
        events: input.events,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
      })
      .returning();
    return this.toEndpoint(row);
  }

  async update(id: string, input: UpdateInput) {
    await this.getById(id); // ensure exists
    const [row] = await this.db
      .update(webhookEndpoints)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, this.tenantId)))
      .returning();
    return this.toEndpoint(row);
  }

  async delete(id: string) {
    await this.getById(id); // ensure exists
    await this.db
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, this.tenantId)));
  }

  async deliver(eventType: string, payload: unknown) {
    const allEndpoints = await this.db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.tenantId, this.tenantId), eq(webhookEndpoints.isActive, true)));

    const matching = allEndpoints.filter((ep) => {
      const events = ep.events as string[];
      return events.includes(eventType) || events.includes('*');
    });

    for (const ep of matching) {
      this.fireWebhook(ep, eventType, payload);
    }
  }

  private fireWebhook(ep: EndpointRow, eventType: string, payload: unknown) {
    const body = JSON.stringify({
      event: eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    });

    const signature = crypto
      .createHmac('sha256', ep.secret)
      .update(body)
      .digest('hex');

    fetch(ep.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RunQ-Signature': signature,
      },
      body,
    })
      .then(async (res) => {
        if (res.ok) {
          await this.db
            .update(webhookEndpoints)
            .set({ lastDeliveredAt: new Date(), failureCount: 0 })
            .where(eq(webhookEndpoints.id, ep.id));
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      })
      .catch(async (err) => {
        console.error(`Webhook delivery failed for ${ep.id}:`, err);
        await this.db
          .update(webhookEndpoints)
          .set({ failureCount: (ep.failureCount ?? 0) + 1 })
          .where(eq(webhookEndpoints.id, ep.id));
      });
  }

  private toEndpoint(row: EndpointRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      url: row.url,
      secret: row.secret,
      events: row.events as string[],
      isActive: row.isActive,
      description: row.description,
      lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
      failureCount: row.failureCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

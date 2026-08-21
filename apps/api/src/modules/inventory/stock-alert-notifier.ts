/**
 * Turns pending stock-alert transitions into one in-app + push digest.
 *
 * Deliberately a digest, not a per-item send: a 50-line GRN or dispatch
 * can flip dozens of items in one transaction, and fifty pushes in a
 * second trains people to mute the app. One notice per tenant per drain,
 * naming the worst few items, is the useful shape.
 */

import { and, eq } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { tenants, userTenants, users } from '@runq/db';
import { computeEffectiveModules } from '../../plugins/tenant-context';
import { NotificationsService } from '../dashboard/notifications.service';

/** Source tag — `inv_` is the prefix the mobile inbox scopes Inventory on. */
const SOURCE = 'inv_stock';

/** Items named inline before the notice falls back to "and N more". */
const NAMED_LIMIT = 3;

export interface PendingAlert {
  itemName: string;
  warehouseName: string;
  status: 'low' | 'out';
}

export class StockAlertNotifier {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * Recipients: active members who can actually open the Inventory module.
   *
   * Access is resolved through the same `computeEffectiveModules` the request
   * guard uses — tenant ceiling × role default × per-user grant. Re-deriving
   * it in SQL here would drift the moment the grant rules change, and would
   * push notices to people whose app 403s the link.
   */
  private async recipients(): Promise<string[]> {
    const rows = await this.db
      .select({
        userId: userTenants.userId,
        role: userTenants.role,
        userModules: userTenants.modules,
        enabledModules: tenants.enabledModules,
      })
      .from(userTenants)
      .innerJoin(tenants, eq(tenants.id, userTenants.tenantId))
      .innerJoin(users, and(eq(users.id, userTenants.userId), eq(users.isActive, true)))
      .where(eq(userTenants.tenantId, this.tenantId));

    return rows
      .filter((r) => computeEffectiveModules({
        tenantId: this.tenantId,
        role: r.role,
        userModules: r.userModules,
        enabledModules: r.enabledModules ?? [],
      }).includes('inventory'))
      .map((r) => r.userId);
  }

  /** Send one digest covering every alert in this drain. No-op when empty. */
  async sendDigest(alerts: PendingAlert[]): Promise<number> {
    if (alerts.length === 0) return 0;
    const userIds = await this.recipients();
    if (userIds.length === 0) return 0;

    const out = alerts.filter((a) => a.status === 'out');
    const low = alerts.filter((a) => a.status === 'low');
    const title = digestTitle(out.length, low.length);
    const body = digestBody(out, low);

    for (const userId of userIds) {
      await new NotificationsService(this.db, this.tenantId, userId).create({
        type: 'warn',
        source: SOURCE,
        title,
        body,
        targetUrl: '/inventory/alerts',
      });
    }
    return userIds.length;
  }
}

function digestTitle(outCount: number, lowCount: number): string {
  if (outCount > 0 && lowCount > 0) {
    return `${outCount} out of stock, ${lowCount} running low`;
  }
  if (outCount > 0) {
    return outCount === 1 ? '1 item out of stock' : `${outCount} items out of stock`;
  }
  return lowCount === 1 ? '1 item is running low' : `${lowCount} items are running low`;
}

function digestBody(out: PendingAlert[], low: PendingAlert[]): string {
  const parts: string[] = [];
  if (out.length) parts.push(`Out of stock: ${nameList(out)}`);
  if (low.length) parts.push(`Low: ${nameList(low)}`);
  return parts.join('. ');
}

/** "A, B, C and 4 more" — warehouse-qualified so the name is actionable. */
function nameList(alerts: PendingAlert[]): string {
  const named = alerts
    .slice(0, NAMED_LIMIT)
    .map((a) => `${a.itemName} (${a.warehouseName})`);
  const rest = alerts.length - named.length;
  return rest > 0 ? `${named.join(', ')} and ${rest} more` : named.join(', ');
}

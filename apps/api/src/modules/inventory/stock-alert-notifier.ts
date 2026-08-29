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

/** One line an invoice billed that the warehouse could not cover. */
export interface PendingShortfall {
  itemName: string;
  qty: number;
  /** Pack size — one product name covers several SKUs. */
  uom: string | null;
  customerName: string | null;
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
        // Single-bucket digests open pre-filtered, so the reader isn't
        // re-applying the filter the notice already expressed.
        targetUrl: out.length === 0
          ? '/inventory/alerts?status=low'
          : low.length === 0
            ? '/inventory/alerts?status=out'
            : '/inventory/alerts',
      });
    }
    return userIds.length;
  }

  /**
   * Goods that were billed and couldn't be sent — a different notice from a
   * low-stock warning, and a louder one. Low stock is a purchasing problem
   * for next week; this is a customer who has been invoiced for something
   * still sitting unshipped, and it links to the shortages queue where it can
   * be covered or substituted.
   */
  async sendShortfallDigest(rows: PendingShortfall[]): Promise<number> {
    if (rows.length === 0) return 0;
    const userIds = await this.recipients();
    if (userIds.length === 0) return 0;

    const title = rows.length === 1
      ? `Short on ${rows[0]!.itemName}${rows[0]!.uom ? ` ${rows[0]!.uom}` : ''}`
        + ' — billed but not sent'
      : `${rows.length} lines billed but not sent`;

    for (const userId of userIds) {
      await new NotificationsService(this.db, this.tenantId, userId).create({
        type: 'warn',
        source: SOURCE,
        title,
        body: `${shortfallList(rows)}. Cover from stock or send a substitute.`,
        // A route both clients own outright. The web app used to get
        // `/inventory/delivery?tab=shortages`, which mobile's notification
        // resolver could only reduce to the delivery list — dropping the
        // reader on the wrong screen for the one notice that needs action.
        targetUrl: '/inventory/shortages',
      });
    }
    return userIds.length;
  }
}

/** "A, B, C and 4 more" for goods owed, qty-qualified rather than warehouse. */
function shortfallList(rows: PendingShortfall[]): string {
  const named = rows.slice(0, NAMED_LIMIT).map((r) => {
    const pack = r.uom ? ` ${r.uom}` : '';
    const to = r.customerName ? ` for ${r.customerName}` : '';
    return `${r.itemName}${pack} ×${r.qty}${to}`;
  });
  const rest = rows.length - named.length;
  return rest > 0 ? `${named.join(', ')} and ${rest} more` : named.join(', ');
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

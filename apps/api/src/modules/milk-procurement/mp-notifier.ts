/**
 * MpNotifier — turns a milk-procurement consignment event into an in-app +
 * mobile-push notification for the operators of a node.
 *
 * Consignments reference `mp_nodes`; notifications target `users`. Operators sit
 * in `mp_node_operators`, whose `user_id` is only populated once that operator
 * has logged into the Dhenu app at least once — so this resolves by user_id
 * first and falls back to matching `users.phone` on the last 10 digits. That
 * fallback is not optional: skipping it silently strands every operator who was
 * created in the web admin but hasn't opened the app yet (the same trap HR hit,
 * see HrNotifier.usersForEmployees).
 *
 * Every send goes through NotificationsService.create, which writes the inbox
 * row and fires FCM push fire-and-forget. Callers fire-and-forget this in turn:
 * a notification must never fail a dispatch or a receipt.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Db, MpConsignmentRow } from '@runq/db';
import { mpNodes, mpNodeOperators, users } from '@runq/db';
import { NotificationsService } from '../dashboard/notifications.service';
import { dateShift, trimNum, milkTypeLabel } from './mp-notify-format';

/** Notification `source` tag — drives the icon/colour in the Dhenu inbox. */
export type MpNotificationSource = 'mp_dispatch' | 'mp_receipt' | 'mp_transit';

/** Deep-link targets the Dhenu router understands (see openNotificationTarget). */
const RECEIVE_URL = '/receive';
const DISPATCH_URL = '/dispatch';

export class MpNotifier {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * A load left an upstream centre — tell the destination's operators so it
   * doesn't sit in transit unnoticed.
   */
  async dispatched(c: MpConsignmentRow): Promise<void> {
    const from = await this.nodeName(c.fromNodeId);
    await this.send(c.toNodeId, {
      source: 'mp_dispatch',
      title: `${trimNum(c.dispatchQty)} L on the way from ${from}`,
      body: `${milkTypeLabel(c.milkType)} · ${dateShift(c.collectionDate, c.shift)} · ${c.consignmentNo}`,
      targetUrl: RECEIVE_URL,
    });
  }

  /**
   * The destination took the load in — tell the sender, and name the variance so
   * a short delivery surfaces on the phone rather than in a month-end report.
   */
  async received(c: MpConsignmentRow): Promise<void> {
    const to = await this.nodeName(c.toNodeId);
    const variance = Number(c.variancePct ?? 0);
    const short = variance <= -2;
    const varianceText = Number.isFinite(variance) && variance !== 0
      ? ` · ${variance > 0 ? '+' : ''}${variance.toFixed(1)}% variance`
      : '';
    await this.send(c.fromNodeId, {
      type: short ? 'warn' : 'ok',
      source: 'mp_receipt',
      title: `${to} received ${trimNum(c.receiptQty)} L`,
      body: `${milkTypeLabel(c.milkType)} · ${dateShift(c.collectionDate, c.shift)}${varianceText}`,
      targetUrl: DISPATCH_URL,
    });
  }

  /**
   * Daily digest of loads still in transit at a node — ONE notification per node
   * however many are stale. Ninety-one consignments sat unreceived for six weeks
   * because nothing ever asked again; ninety-one separate pushes would have been
   * ignored just as thoroughly.
   */
  async staleInTransit(nodeId: string, count: number, litres: number, oldest: string): Promise<void> {
    const name = await this.nodeName(nodeId);
    await this.send(nodeId, {
      type: 'warn',
      source: 'mp_transit',
      title: `${count} load${count === 1 ? '' : 's'} still not received`,
      body: `${litres.toFixed(1)} L waiting at ${name} · oldest ${dateShift(oldest, null)}`,
      targetUrl: RECEIVE_URL,
    });
  }

  /** Fan a notice out to every active operator of a node. */
  private async send(
    nodeId: string,
    notice: { type?: 'info' | 'ok' | 'warn'; source: MpNotificationSource; title: string; body: string; targetUrl: string },
  ): Promise<void> {
    const userIds = await this.operatorUserIds(nodeId);
    for (const userId of userIds) {
      await new NotificationsService(this.db, this.tenantId, userId).create(notice);
    }
  }

  /**
   * Active operators of a node, as user ids. Matches on `mp_node_operators.user_id`
   * when the operator has logged in, else on the last 10 digits of the phone —
   * Dhenu's OTP login strips the `91` country code while the web admin stores
   * `+91`, so a plain equality misses.
   */
  private async operatorUserIds(nodeId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: users.id })
      .from(mpNodeOperators)
      .innerJoin(
        users,
        and(
          eq(users.tenantId, mpNodeOperators.tenantId),
          eq(users.isActive, true),
          sql`(
            ${users.id} = ${mpNodeOperators.userId}
            OR (coalesce(${users.phone}, '') <> ''
              AND right(regexp_replace(coalesce(${mpNodeOperators.phone}, ''), '\\D', '', 'g'), 10)
                = right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10))
          )`,
        ),
      )
      .where(and(
        eq(mpNodeOperators.tenantId, this.tenantId),
        eq(mpNodeOperators.nodeId, nodeId),
        eq(mpNodeOperators.isActive, true),
      ));
    return [...new Set(rows.map((r) => r.userId))];
  }

  private async nodeName(nodeId: string): Promise<string> {
    const [n] = await this.db.select({ name: mpNodes.name }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, nodeId))).limit(1);
    return n?.name ?? 'centre';
  }
}

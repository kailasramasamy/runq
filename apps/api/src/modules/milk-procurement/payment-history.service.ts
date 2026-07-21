import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import type { MpPaymentHistoryFilter } from '@runq/validators';
import type { MpPrincipal } from './access-scope';

export type MpPaymentKind = 'vmcc_bill' | 'farmer' | 'operator';

export interface MpPaymentHistoryRow {
  id: string;
  kind: MpPaymentKind;
  date: string;
  payee: string;
  payeeCode: string | null;
  context: string | null; // CC (bill) / VMCC (farmer) / node (operator)
  cycleNo: string | null;
  amount: string;
  paymentMode: string | null;
  reference: string | null;
  recordedBy: string | null; // admin user name; null for operator payouts (not tracked)
}

/**
 * Unified, read-only payment history for the billing page. Unions the three
 * places an MP payment lands — paid VMCC bills, settled farmer lines, and
 * operator payouts — into one time-ordered, filterable, paginated feed. Each
 * source aliases into a common shape; operator payouts have no `paidBy`, so
 * their `recordedBy` is null.
 */
export class MpPaymentHistoryService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** The UNION ALL of all three payment sources, tenant-scoped. */
  private unionSource(): SQL {
    const t = this.tenantId;
    return sql`
      select 'bill:' || b.id as id, 'vmcc_bill' as kind,
             coalesce(b.payment_date, b.paid_at::date)::text as date,
             vn.name as payee, vn.code as payee_code, cn.name as context,
             cy.cycle_no as cycle_no, b.total_amount as amount,
             b.payment_mode as payment_mode, b.txn_reference as reference,
             u.name as recorded_by, b.vmcc_node_id as scope_node_id
      from mp_vmcc_bills b
      join mp_nodes vn on vn.id = b.vmcc_node_id
      left join mp_nodes cn on cn.id = b.cc_node_id
      left join mp_payout_cycles cy on cy.id = b.payout_cycle_id
      left join users u on u.id = b.paid_by
      where b.tenant_id = ${t} and b.status = 'paid'
      union all
      select 'farmer:' || l.id, 'farmer',
             coalesce(l.payment_date, l.paid_at::date)::text,
             f.name, f.code, vn.name,
             cy.cycle_no, l.net_amount,
             l.payment_mode, l.payment_reference,
             u.name, l.settled_via_node_id
      from mp_payout_lines l
      join mp_farmers f on f.id = l.farmer_id
      left join mp_nodes vn on vn.id = l.settled_via_node_id
      left join mp_payout_cycles cy on cy.id = l.payout_cycle_id
      left join users u on u.id = l.paid_by
      where l.tenant_id = ${t} and l.paid_at is not null
      union all
      select 'operator:' || o.id, 'operator',
             o.paid_on::text, coalesce(op.name, nn.name), nn.code, nn.name,
             null, o.total, o.payment_mode, o.reference, null, o.node_id
      from mp_operator_payouts o
      left join mp_nodes nn on nn.id = o.node_id
      left join mp_node_operators op on op.id = o.operator_id
      where o.tenant_id = ${t}`;
  }

  /** Build the outer WHERE clause from filters + operator node-scope. */
  private buildWhere(filters: MpPaymentHistoryFilter, principal?: MpPrincipal): SQL {
    const conds: SQL[] = [];
    if (filters.type) conds.push(sql`kind = ${filters.type}`);
    if (filters.paymentMode) conds.push(sql`payment_mode = ${filters.paymentMode}`);
    if (filters.dateFrom) conds.push(sql`date >= ${filters.dateFrom}`);
    if (filters.dateTo) conds.push(sql`date <= ${filters.dateTo}`);
    if (filters.search) {
      const q = `%${filters.search}%`;
      conds.push(sql`(payee ilike ${q} or coalesce(payee_code, '') ilike ${q}
        or coalesce(reference, '') ilike ${q} or coalesce(cycle_no, '') ilike ${q}
        or coalesce(recorded_by, '') ilike ${q})`);
    }
    if (principal?.kind === 'operator') {
      const ids = [...principal.nodeIds];
      conds.push(ids.length
        ? sql`scope_node_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
        : sql`false`);
    }
    return conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``;
  }

  async list(
    filters: MpPaymentHistoryFilter, pagination: { page: number; limit: number }, principal?: MpPrincipal,
  ): Promise<{ data: MpPaymentHistoryRow[]; meta: PaginationMeta }> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);
    const src = this.unionSource();
    const where = this.buildWhere(filters, principal);
    const [rowsRes, countRes] = await Promise.all([
      this.db.execute(sql`with ph as (${src}) select * from ph ${where}
        order by date desc, id limit ${limit} offset ${offset}`),
      this.db.execute(sql`with ph as (${src}) select count(*)::int as count from ph ${where}`),
    ]);
    const rows = (rowsRes.rows ?? rowsRes) as Array<Record<string, unknown>>;
    const total = Number((countRes.rows ?? countRes)[0]?.count ?? 0);
    const data: MpPaymentHistoryRow[] = rows.map((r) => ({
      id: String(r.id), kind: r.kind as MpPaymentKind,
      date: String(r.date), payee: String(r.payee ?? ''),
      payeeCode: (r.payee_code as string) ?? null, context: (r.context as string) ?? null,
      cycleNo: (r.cycle_no as string) ?? null, amount: String(r.amount ?? '0'),
      paymentMode: (r.payment_mode as string) ?? null, reference: (r.reference as string) ?? null,
      recordedBy: (r.recorded_by as string) ?? null,
    }));
    return { data, meta: { page, limit, total, totalPages: calcTotalPages(total, limit) } };
  }
}

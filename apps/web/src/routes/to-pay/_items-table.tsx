import { useNavigate } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { formatINR } from '@/lib/utils';
import {
  Table, TableHeader, Th, TableBody, TableRow, TableCell, Badge, formatDate,
} from '@/components/ar/primitives';
import type { ToPayCategorySummary, ToPayItem } from '@/hooks/queries/use-to-pay';
import { bucketOf, daysFrom, type Bucket } from './_shared';

const BUCKETS: Array<{ key: Bucket; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'week', label: 'Due this week' },
  { key: 'later', label: 'Later' },
];

const COLS = 6;

function DueCell({ asOf, item }: { asOf: string; item: ToPayItem }) {
  const days = daysFrom(asOf, item.dueDate);
  const late = days < 0 && item.balance > 0;
  return (
    <div>
      <div style={{ color: late ? 'var(--neg)' : 'var(--text-1)' }}>{formatDate(item.dueDate)}</div>
      {late && <div className="text-[11.5px]" style={{ color: 'var(--neg)' }}>{-days}d overdue</div>}
    </div>
  );
}

function StatusBadge({ asOf, item }: { asOf: string; item: ToPayItem }) {
  if (item.status === 'paid') return <Badge variant="success">Paid</Badge>;
  if (daysFrom(asOf, item.dueDate) < 0) return <Badge variant="danger">Overdue</Badge>;
  if (item.status === 'partial') return <Badge variant="warning">Part paid</Badge>;
  return <Badge variant="default">Due</Badge>;
}

function SectionHeader({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <tr>
      <td colSpan={COLS} className="px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide"
        style={{ background: 'var(--surface-2)', color: danger ? 'var(--neg)' : 'var(--text-3)' }}>
        {label}
      </td>
    </tr>
  );
}

/** A milk cycle / rent half within a category, with what's been paid of it. */
function SubPeriodHeader({ items }: { items: ToPayItem[] }) {
  const paid = items.reduce((s, i) => s + i.paid, 0);
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <tr>
      <td colSpan={COLS} className="px-6 py-1.5 text-[12px] font-medium"
        style={{ color: 'var(--text-2)', borderTop: '1px solid var(--border-soft)' }}>
        {items[0].subPeriod}
        <span className="num ml-2 font-normal" style={{ color: 'var(--text-3)' }}>
          {paid >= total ? `${formatINR(total)} · paid` : `${formatINR(paid)} of ${formatINR(total)} paid`}
        </span>
      </td>
    </tr>
  );
}

/** Rows for one group: in month view, part-of-month items sit under a header
 *  per period (date order) and whole-month items follow. */
function groupRows(rows: ToPayItem[], monthView: boolean, render: (i: ToPayItem) => React.ReactNode) {
  const parts = new Map<string, ToPayItem[]>();
  if (monthView) {
    for (const i of rows) if (i.subPeriod) parts.set(i.subPeriodStart ?? i.subPeriod, [...(parts.get(i.subPeriodStart ?? i.subPeriod) ?? []), i]);
  }
  if (!parts.size) return rows.map(render);
  return [
    ...[...parts.keys()].sort().flatMap((k) => [<SubPeriodHeader key={`sp-${k}`} items={parts.get(k)!} />, ...parts.get(k)!.map(render)]),
    ...rows.filter((i) => !i.subPeriod).map(render),
  ];
}

function ItemRow({ item, asOf, categoryLabel }: { item: ToPayItem; asOf: string; categoryLabel: string }) {
  const navigate = useNavigate();
  return (
    <TableRow onClick={() => navigate({ to: item.webLink as '/' })}>
      <TableCell><DueCell asOf={asOf} item={item} /></TableCell>
      <TableCell><Badge variant="default">{categoryLabel}</Badge></TableCell>
      <TableCell>
        <div className="font-medium" style={{ color: 'var(--text-1)' }}>{item.title}</div>
        <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>{item.subtitle}</div>
      </TableCell>
      <TableCell><StatusBadge asOf={asOf} item={item} /></TableCell>
      <TableCell align="right" className="num">
        {/* A part-paid bill leads with what is still owed; the bill total is context. */}
        <div>{formatINR(item.status === 'partial' ? item.balance : item.amount)}</div>
        {item.status === 'partial' && (
          <div className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>
            of {formatINR(item.amount)} · {formatINR(item.paid)} paid
          </div>
        )}
      </TableCell>
      <TableCell align="right"><ChevronRight size={14} style={{ color: 'var(--text-3)' }} /></TableCell>
    </TableRow>
  );
}

export function ItemsTable({ asOf, items, categories, groupBy }: {
  asOf: string;
  items: ToPayItem[];
  categories: ToPayCategorySummary[];
  groupBy: 'due' | 'category';
}) {
  const labelOf = (key: string) => categories.find((c) => c.key === key)?.label ?? key;
  const groups = groupBy === 'due'
    ? BUCKETS.map((b) => ({ key: b.key, label: b.label, rows: items.filter((i) => bucketOf(asOf, i.dueDate) === b.key) }))
    : categories.map((c) => ({ key: c.key, label: c.label, rows: items.filter((i) => i.category === c.key) }));

  return (
    <Table>
      <TableHeader>
        <tr>
          <Th>Due</Th><Th>Category</Th><Th>Item</Th><Th>Status</Th>
          <Th align="right">Amount</Th><Th>{''}</Th>
        </tr>
      </TableHeader>
      <TableBody>
        {groups.filter((g) => g.rows.length > 0).map((g) => [
          <SectionHeader key={`h-${g.key}`} label={g.label} danger={g.key === 'overdue'} />,
          ...groupRows(g.rows, groupBy === 'category',
            (i) => <ItemRow key={`${i.category}-${i.id}`} item={i} asOf={asOf} categoryLabel={labelOf(i.category)} />),
        ])}
      </TableBody>
    </Table>
  );
}

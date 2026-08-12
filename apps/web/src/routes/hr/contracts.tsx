import { useState } from 'react';
import { FileSignature, Plus } from 'lucide-react';
import {
  PageHeader, Button, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { StatTile, EmptyState, ListToolbar } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import {
  useContracts, CONTRACT_TYPE_LABEL, type LabourContract,
} from '@/hooks/queries/use-hr-contracts';
import { ContractFormModal } from './_contract-form-modal';
import { ContractDetailModal } from './_contract-detail-modal';

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: '', label: 'All' },
];

export function contractStatusVariant(status: string) {
  if (status === 'completed' || status === 'paid') return 'success' as const;
  if (status === 'active' || status === 'approved') return 'warning' as const;
  if (status === 'cancelled') return 'default' as const;
  return 'info' as const;
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "1 Aug 2026 → ongoing" for open-ended work. */
export function contractTerm(c: { startDate: string; endDate: string | null }) {
  return `${fmtDate(c.startDate)} → ${c.endDate ? fmtDate(c.endDate) : 'ongoing'}`;
}

export function ContractsPage() {
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LabourContract | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useContracts(status || undefined);
  const rows = data?.data ?? [];

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.leadPersonName.toLowerCase().includes(q) ||
          r.contractNumber.toLowerCase().includes(q),
      )
    : rows;

  const activeCount = rows.filter((r) => r.status === 'active').length;
  const earned = rows.reduce((s, r) => s + r.earnedToDate, 0);
  const outstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Contracts' }]}
        title="Labour contracts"
        description="Daily-wage workers, task crews and per-member crews. Days count automatically from the start date; mark leave, pay advances, settle when the job is done."
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={13} /> New contract
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Active contracts" value={String(activeCount)} />
        <StatTile label="Earned to date" value={formatINR(earned)} />
        <StatTile label="Outstanding" value={formatINR(outstanding)} />
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search job, lead person or contract no."
        count={filtered.length}
        noun="contract"
      >
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.value || 'all'}
              type="button"
              onClick={() => setStatus(s.value)}
              className={
                'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                (status === s.value
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/40'
                  : 'text-muted-foreground hover:bg-muted')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </ListToolbar>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileSignature size={18} />}
          title={status ? `No ${status} contracts` : 'No contracts yet'}
          description="Engage a worker or a crew, track the days worked, pay advances along the way and settle when the job is done."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Job</Th>
              <Th>Type</Th>
              <Th>Term</Th>
              <Th align="right">Earned</Th>
              <Th align="right">Advances</Th>
              <Th align="right">Outstanding</Th>
              <Th>Status</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetailId(c.id)}>
                <TableCell>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.leadPersonName} · {c.contractNumber}
                    {c.memberCount > 1 ? ` · ${c.memberCount} crew` : ''}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {CONTRACT_TYPE_LABEL[c.contractType]}
                </TableCell>
                <TableCell className="text-sm">{contractTerm(c)}</TableCell>
                <TableCell align="right">{formatINR(c.earnedToDate)}</TableCell>
                <TableCell align="right" className="text-muted-foreground">
                  {c.advancesPaid > 0 ? `− ${formatINR(c.advancesPaid)}` : '—'}
                </TableCell>
                <TableCell align="right" className="font-semibold">
                  {formatINR(c.outstanding)}
                </TableCell>
                <TableCell>
                  <Badge variant={contractStatusVariant(c.status)}>{c.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ContractFormModal
        open={formOpen}
        existing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />

      <ContractDetailModal
        contractId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(c) => { setDetailId(null); setEditing(c); setFormOpen(true); }}
      />
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Factory, Search } from 'lucide-react';
import { useWorkOrders } from '@/hooks/queries/use-work-orders';
import { useBoms } from '@/hooks/queries/use-boms';
import {
  PageHeader, Button, Input, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, EmptyState,
} from '@/components/ui';

const ACCENT = '#E11D48';

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: '',           label: 'All' },
  { key: 'draft',      label: 'Draft' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',  label: 'Completed' },
  { key: 'closed',     label: 'Closed' },
  { key: 'cancelled',  label: 'Cancelled' },
];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', in_progress: 'In Progress', completed: 'Completed',
  closed: 'Closed', cancelled: 'Cancelled',
};

const STATUS_BG: Record<string, string> = {
  draft: 'var(--surface-2)',
  in_progress: 'rgba(234, 88, 12, 0.10)',
  completed: 'rgba(22, 163, 74, 0.10)',
  closed: 'rgba(225, 29, 72, 0.10)',
  cancelled: 'rgba(220, 38, 38, 0.08)',
};

const STATUS_FG: Record<string, string> = {
  draft: 'var(--text-2)',
  in_progress: '#ea580c',
  completed: '#16a34a',
  closed: '#e11d48',
  cancelled: '#dc2626',
};

export function WorkOrderListPage() {
  const navigate = useNavigate();
  const [statusKey, setStatusKey] = useState('');
  const [search, setSearch] = useState('');
  const [bomId, setBomId] = useState('');
  const [scheduledFrom, setScheduledFrom] = useState('');
  const [scheduledTo, setScheduledTo] = useState('');
  // Defaults to hiding auto-repacks: dispatch posts one every time a delivery
  // line comes up short of a packed SKU, and on a repacking dairy they
  // outnumber the runs a person actually entered. Now a server-side filter, so
  // paging and totals describe the list being read.
  const [entryMode, setEntryMode] = useState<string>('planned,unplanned');
  const [page, setPage] = useState(1);

  const { data: bomsData } = useBoms({ limit: 200 });
  const bomOptions = [
    { value: '', label: 'All BOMs' },
    ...(bomsData?.data?.map((b) => ({
      value: b.id,
      label: `${b.bomCode} — ${b.name}`,
    })) ?? []),
  ];

  const { data, isLoading, isError } = useWorkOrders({
    status: statusKey || undefined,
    search: search || undefined,
    bomId: bomId || undefined,
    scheduledFrom: scheduledFrom || undefined,
    scheduledTo: scheduledTo || undefined,
    entryMode,
    page,
    limit: 25,
  });

  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Work Orders' },
        ]}
        title="Work Orders"
        description="Scheduled production runs — from draft to closed."
        actions={
          <Button onClick={() => navigate({ to: '/manufacturing/wos/new' })}>
            <Plus size={13} className="mr-1" />
            New WO
          </Button>
        }
      />

      {/* Status tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setStatusKey(tab.key); setPage(1); }}
            className="rounded-full border px-3 py-1 text-[12px] font-medium transition-colors"
            style={{
              background: statusKey === tab.key ? ACCENT : 'var(--surface)',
              borderColor: statusKey === tab.key ? ACCENT : 'var(--border)',
              color: statusKey === tab.key ? '#fff' : 'var(--text-2)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search by WO number…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          icon={<Search size={14} />}
        />
        <Combobox
          options={bomOptions}
          value={bomId}
          onChange={(v) => { setBomId(v); setPage(1); }}
          placeholder="Filter by BOM…"
        />
        <Input
          type="date"
          value={scheduledFrom}
          onChange={(e) => { setScheduledFrom(e.target.value); setPage(1); }}
          placeholder="From date"
        />
        <Input
          type="date"
          value={scheduledTo}
          onChange={(e) => { setScheduledTo(e.target.value); setPage(1); }}
          placeholder="To date"
        />
      </div>

      {/* Off-plan filter. Two different questions: "what did the floor make
          while I was away" (unplanned, a person to ask) and "what did
          dispatch make for itself" (auto-repack, nobody to ask). Repacks are
          out of the default view entirely — lumped in, they buried the handful
          of entries actually worth reviewing. */}
      <div className="mb-3 flex w-fit items-center gap-1.5 text-[12px]">
        {([
          { key: 'planned,unplanned', label: 'Runs' },
          { key: 'unplanned', label: 'Unplanned only' },
          { key: 'auto_repack', label: 'Auto-repack only' },
        ] as const).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => { setEntryMode(opt.key); setPage(1); }}
            className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
            style={
              entryMode === opt.key
                ? { background: 'rgba(225, 29, 72, 0.10)', color: '#E11D48' }
                : { color: 'var(--text-2)' }
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="px-2 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
      ) : isError ? (
        <p className="px-2 py-4 text-center text-[12px] text-red-500">Failed to load work orders.</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No work orders yet"
          description="Create a work order to schedule a production run."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <tr>
                <Th>WO #</Th>
                <Th>BOM</Th>
                <Th>Output</Th>
                <Th align="right">Planned qty</Th>
                <Th>Warehouse</Th>
                <Th>Scheduled</Th>
                <Th>Shift</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.map((wo) => (
                <TableRow
                  key={wo.id}
                  onClick={() =>
                    navigate({ to: '/manufacturing/wos/$woId', params: { woId: wo.id } })
                  }
                >
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="num text-[12.5px] font-medium" style={{ color: ACCENT }}>
                        {wo.woNumber}
                      </span>
                      {wo.entryMode === 'unplanned' && (
                        <span
                          className="inline-flex rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide"
                          style={{ background: 'rgba(217, 119, 6, 0.12)', color: '#d97706' }}
                        >
                          Unplanned
                        </span>
                      )}
                      {wo.entryMode === 'auto_repack' && (
                        <span
                          className="inline-flex rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide"
                          title="Posted by dispatch to cover a delivery line — no floor entry"
                          style={{ background: 'rgba(2, 132, 199, 0.12)', color: '#0284c7' }}
                        >
                          Repack
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[12px]">{wo.bomCode}</span>
                  </TableCell>
                  <TableCell>{wo.outputItemName}</TableCell>
                  <TableCell align="right" numeric>{wo.plannedQty}</TableCell>
                  <TableCell>{wo.warehouseName}</TableCell>
                  <TableCell numeric style={{ color: 'var(--text-2)' }}>{wo.scheduledFor}</TableCell>
                  <TableCell style={{ color: 'var(--text-2)' }}>{wo.shift ?? '—'}</TableCell>
                  <TableCell>
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: STATUS_BG[wo.status] ?? 'var(--surface-2)',
                        color: STATUS_FG[wo.status] ?? 'var(--text-2)',
                      }}
                    >
                      {STATUS_LABEL[wo.status] ?? wo.status}
                    </span>
                  </TableCell>
                  <TableCell numeric style={{ color: 'var(--text-2)' }}>
                    {new Date(wo.updatedAt).toLocaleDateString('en-IN')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data?.meta && data.meta.total > 25 && (
            <div className="mt-3 flex items-center justify-between text-[12px]" style={{ color: 'var(--text-2)' }}>
              <span>
                Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, data.meta.total)} of {data.meta.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * 25 >= data.meta.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

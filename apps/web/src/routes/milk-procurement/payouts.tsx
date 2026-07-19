import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import {
  Card, CardContent, CardHeader, Button, Badge, Modal, Input, Combobox, Pagination,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import {
  useNodes, useFarmers, usePayoutCycles, useCreatePayoutCycle,
  useFarmerLedger, useAddLedgerEntry, useGlSettings,
  useOperatorPayoutCompute, useOperatorPayouts, useMarkOperatorPayout, type MpOperatorPayoutLine,
} from '@/hooks/queries/use-milk-procurement';

/** Calendar-aligned cycle window containing `today` (15-day → [1-15],[16-end]). */
function currentCyclePeriod(cycleDays: number, today: string): { start: string; end: string } | null {
  if (cycleDays < 1) return null;
  const [y, m, d] = today.split('-').map(Number);
  if (!y || !m || !d) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const threshold = Math.min(30, daysInMonth);
  const starts: number[] = [];
  for (let s = 1; s <= threshold; s += cycleDays) starts.push(s);
  let idx = 0;
  for (let i = 0; i < starts.length; i += 1) if (d >= starts[i]!) idx = i;
  const start = starts[idx]!;
  const end = idx < starts.length - 1 ? starts[idx + 1]! - 1 : daysInMonth;
  const iso = (day: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The defined cycle windows from the tenant cadence, most-recent first — the
 *  next window plus the last `months` months' worth — so the New-cycle picker
 *  offers named cycles ("16–31 Jul 2026") instead of raw date entry. */
function listCyclePeriods(cycleDays: number, today: string, months = 6): { start: string; end: string; label: string }[] {
  if (cycleDays < 1) return [];
  const [ty, tm] = today.split('-').map(Number);
  if (!ty || !tm) return [];
  const out: { start: string; end: string; label: string }[] = [];
  for (let off = 1; off >= -months; off -= 1) {
    const dt = new Date(Date.UTC(ty, tm - 1 + off, 1));
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const threshold = Math.min(30, daysInMonth);
    const starts: number[] = [];
    for (let s = 1; s <= threshold; s += cycleDays) starts.push(s);
    const iso = (day: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    for (let i = 0; i < starts.length; i += 1) {
      const sd = starts[i]!;
      const ed = i < starts.length - 1 ? starts[i + 1]! - 1 : daysInMonth;
      out.push({ start: iso(sd), end: iso(ed), label: `${sd}–${ed} ${MONTH_ABBR[m - 1]} ${y}` });
    }
  }
  return out.sort((a, b) => (a.start < b.start ? 1 : -1));
}

const LEDGER_TYPES = [
  { value: 'advance_given', label: 'Advance given' },
  { value: 'feed_loan_given', label: 'Cattle-feed loan given' },
  { value: 'repayment', label: 'Repayment' },
];
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'danger'> = {
  open: 'default', locked: 'default', paid: 'success', reversed: 'danger',
};
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** The cycles list — the Billing hub's "Cycles" tab. Each row opens the merged
 *  cycle detail (VMCC bills + farmer payouts). */
export function CyclesList() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = usePayoutCycles({ limit: 100 });
  const cycles = data?.data ?? [];
  // Cycles are CC-scoped; the list itself has no node join, so resolve the CC
  // name client-side from the nodes already needed by the create modal.
  const { data: nodesData } = useNodes({ limit: 300 });
  const nodeNameById = new Map((nodesData?.data ?? []).map((n) => [n.id, n.name]));
  const scopeLabel = (scopeNodeId: string | null) =>
    scopeNodeId ? (nodeNameById.get(scopeNodeId) ?? scopeNodeId.slice(0, 8)) : 'Whole tenant';
  const goToCycle = (id: string) =>
    navigate({ to: '/milk-procurement/billing/cycles/$cycleId', params: { cycleId: id } });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />New cycle</Button>
      </div>

      <Card>
        <CardHeader>Cycles</CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <Th>Cycle</Th><Th>Centre</Th><Th>Period</Th><Th align="right">Net ₹</Th>
              <Th align="right">Paid</Th><Th align="right">Balance ₹</Th><Th>Status</Th>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={7} />
              ) : cycles.length === 0 ? (
                <TableEmpty colSpan={7} message="No cycles yet." />
              ) : (
                cycles.map((c) => {
                  // Payment status only applies once the cycle is locked; open cycles show —.
                  const settled = c.status === 'locked' || c.status === 'paid';
                  const balance = c.netTotal - c.paidTotal;
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => goToCycle(c.id)}>
                      <TableCell className="font-medium">{c.cycleNo}</TableCell>
                      <TableCell>
                        {c.scopeNodeId ? (
                          <span className="text-sm text-zinc-900 dark:text-zinc-100">{scopeLabel(c.scopeNodeId)}</span>
                        ) : (
                          <Badge>Whole tenant</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">{c.periodStart} → {c.periodEnd}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(c.netTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-zinc-500">{settled ? `${c.paidCount}/${c.lineCount}` : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{settled && balance > 0 ? inr(balance) : '—'}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showCreate && <CreateCycleModal onClose={() => setShowCreate(false)} onCreated={(id) => { goToCycle(id); setShowCreate(false); }} />}
    </div>
  );
}

export function LedgerCard() {
  const [farmerId, setFarmerId] = useState('');
  const { data: farmersData } = useFarmers({ limit: 500 });
  const farmers = farmersData?.data ?? [];
  const { data: ledgerData } = useFarmerLedger(farmerId || undefined);
  const add = useAddLedgerEntry();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ entryType: 'advance_given', amount: '' });
  const ledger = ledgerData?.data;

  const submit = () => {
    add.mutate(
      { farmerId, entryType: f.entryType as 'advance_given' | 'feed_loan_given' | 'repayment', amount: Number(f.amount), occurredOn: today },
      { onSuccess: () => { toast('Ledger entry added', 'success'); setF({ ...f, amount: '' }); }, onError: () => toast('Failed', 'error') },
    );
  };

  return (
    <Card>
      <CardHeader>Farmer ledger (advances & loans)</CardHeader>
      <CardContent className="space-y-3">
        <Combobox label="Farmer" value={farmerId} onChange={setFarmerId}
          options={farmers.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))} placeholder="Select farmer…" />
        {farmerId && (
          <>
            <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50">
              Outstanding balance: <span className="font-semibold">₹{ledger?.balance ?? 0}</span>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Combobox label="Type" value={f.entryType} onChange={(v) => setF({ ...f, entryType: v })} options={LEDGER_TYPES} /></div>
              <div className="w-28"><Input label="Amount" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
              <Button onClick={submit} loading={add.isPending} disabled={!f.amount}>Add</Button>
            </div>
            <Table>
              <TableHeader><TableRow><Th>Date</Th><Th>Type</Th><Th align="right">Amount</Th><Th align="right">Balance</Th></TableRow></TableHeader>
              <TableBody>
                {(ledger?.entries ?? []).length === 0 ? (
                  <TableEmpty colSpan={4} message="No entries." />
                ) : (
                  (ledger?.entries ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.occurredOn}</TableCell>
                      <TableCell className="text-xs">{e.entryType.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-right">{e.amount}</TableCell>
                      <TableCell className="text-right">{e.balanceAfter}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CreateCycleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreatePayoutCycle();
  const { toast } = useToast();
  const { data: nodesData } = useNodes({ limit: 300 });
  const nodes = nodesData?.data ?? [];
  const { data: settingsData } = useGlSettings();
  const today = new Date().toISOString().slice(0, 10);
  const s = settingsData?.data;
  const seed = s?.cycleDays ? currentCyclePeriod(s.cycleDays, today) : null;
  const periods = s?.cycleDays ? listCyclePeriods(s.cycleDays, today) : [];
  const ccs = nodes.filter((n) => n.nodeType === 'cc');
  const [f, setF] = useState({
    scopeNodeId: '', periodStart: seed?.start ?? today, periodEnd: seed?.end ?? today,
  });

  const submit = () => {
    if (!f.scopeNodeId) return;
    create.mutate(
      { scopeNodeId: f.scopeNodeId, periodStart: f.periodStart, periodEnd: f.periodEnd },
      {
        onSuccess: (res) => { toast(`Cycle ${res.data.cycleNo} generated`, 'success'); onCreated(res.data.id); },
        onError: () => toast('Failed — no recorded collections in this period/scope?', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="New payout cycle">
      <div className="space-y-3">
        {/* Cycles are CC-scoped — one cycle per (CC, period), so a centre must be picked. */}
        <Combobox label="Chilling centre" value={f.scopeNodeId} onChange={(v) => setF({ ...f, scopeNodeId: v })}
          options={ccs.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))}
          placeholder="Select centre…" />
        {periods.length ? (
          <Combobox label="Cycle" value={`${f.periodStart}|${f.periodEnd}`}
            onChange={(v) => { const [start, end] = v.split('|'); setF({ ...f, periodStart: start!, periodEnd: end! }); }}
            options={periods.map((p) => ({ value: `${p.start}|${p.end}`, label: p.label }))}
            placeholder="Select cycle…" />
        ) : (
          // Cadence not configured in settings — fall back to manual dates.
          <div className="grid grid-cols-2 gap-2">
            <Input label="Period start" type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
            <Input label="Period end" type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending} disabled={!f.scopeNodeId}>Generate</Button>
        </div>
      </div>
    </Modal>
  );
}

export function OperatorsPayoutTab() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const [q, setQ] = useState({ from: monthStart, to: today, nodeId: '' });
  const { data: nodesData } = useNodes({ limit: 300 });
  const nodes = nodesData?.data ?? [];
  const nodeTypeById = new Map(nodes.map((n) => [n.id, n.nodeType]));
  const { data, isLoading } = useOperatorPayoutCompute({ from: q.from, to: q.to, nodeId: q.nodeId || undefined });
  const lines = data?.data.lines ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>Due this period</CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-3">
            <Combobox label="Node" value={q.nodeId} onChange={(v) => setQ({ ...q, nodeId: v })}
              options={[{ value: '', label: 'All nodes' }, ...nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))]} placeholder="All nodes" />
            <Input label="From" type="date" value={q.from} max={q.to} onChange={(e) => setQ({ ...q, from: e.target.value })} />
            <Input label="To" type="date" value={q.to} max={today} onChange={(e) => setQ({ ...q, to: e.target.value })} />
          </div>
          <p className="px-4 pb-2 text-xs text-zinc-500">
            VMCC operators are settled on the Billing page as part of their VMCC bill — shown here for reference only.
            Only CC &amp; PP operators are marked paid here.
          </p>
          <Table>
            <TableHeader><TableRow>
              <Th>Node</Th><Th>Role</Th><Th>Comp</Th><Th align="right">Volume</Th>
              <Th align="right">Commission</Th><Th align="right">Salary</Th><Th align="right">Rent</Th><Th align="right">Total</Th><Th align="right">Action</Th>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={9} />
              ) : lines.length === 0 ? (
                <TableEmpty colSpan={9} message="No active operators in this period." />
              ) : (
                lines.map((l) => <OperatorPayoutRow key={l.operatorId} line={l} period={{ from: q.from, to: q.to }}
                  isVmcc={nodeTypeById.get(l.nodeId) === 'vmcc'} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperatorPayoutHistory nodes={nodes} />
    </div>
  );
}

function OperatorPayoutRow({ line, period, isVmcc }: {
  line: MpOperatorPayoutLine; period: { from: string; to: string }; isVmcc: boolean;
}) {
  const mark = useMarkOperatorPayout();
  const { toast } = useToast();
  const pay = () => mark.mutate(
    { operatorId: line.operatorId, periodStart: period.from, periodEnd: period.to },
    { onSuccess: () => toast('Marked paid', 'success'), onError: () => toast('Failed — already paid for this period?', 'error') },
  );
  return (
    <TableRow>
      <TableCell>{line.nodeName}</TableCell>
      <TableCell>{line.role}</TableCell>
      <TableCell className="text-xs">{line.compType.replace(/_/g, ' ')}</TableCell>
      <TableCell className="text-right tabular-nums">{line.nodeQty} L</TableCell>
      <TableCell className="text-right tabular-nums">{line.commission}</TableCell>
      <TableCell className="text-right tabular-nums">{line.salary}</TableCell>
      <TableCell className="text-right tabular-nums">{line.rent}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">₹{line.total}</TableCell>
      <TableCell className="text-right">
        {line.paidPayoutId
          ? <Badge variant="success">Paid {line.paidOn}</Badge>
          : isVmcc
            ? <span className="text-xs text-zinc-400">Via VMCC bill</span>
            : <Button size="sm" onClick={pay} loading={mark.isPending} disabled={line.total <= 0}>Mark paid</Button>}
      </TableCell>
    </TableRow>
  );
}

function OperatorPayoutHistory({ nodes }: { nodes: { id: string; name: string }[] }) {
  const [page, setPage] = useState(1);
  const { data } = useOperatorPayouts({ page, limit: 50 });
  const rows = data?.data ?? [];
  const meta = data?.meta;
  const nm = (id: string) => nodes.find((n) => n.id === id)?.name ?? id.slice(0, 8);
  return (
    <Card>
      <CardHeader>Payout history</CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><Th>Paid on</Th><Th>Node</Th><Th>Period</Th><Th align="right">Total</Th><Th>Reference</Th></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={5} message="No payouts recorded yet." />
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs tabular-nums">{p.paidOn}</TableCell>
                  <TableCell>{nm(p.nodeId)}</TableCell>
                  <TableCell className="text-xs text-zinc-500">{p.periodStart} → {p.periodEnd}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">₹{p.total}</TableCell>
                  <TableCell className="text-xs">{p.reference ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {meta && meta.totalPages > 1 && (
          <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
            <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={setPage} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { Plus, FileDown } from 'lucide-react';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, Modal, Input, Combobox, Pagination,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import { sharePdf } from '@/lib/share-pdf';
import { Tabs } from '@/components/ar/primitives';
import {
  useNodes, useFarmers, usePayoutCycles, usePayoutCycle, useCreatePayoutCycle, useCycleAction,
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

const LEDGER_TYPES = [
  { value: 'advance_given', label: 'Advance given' },
  { value: 'feed_loan_given', label: 'Cattle-feed loan given' },
  { value: 'repayment', label: 'Repayment' },
];
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'danger'> = {
  open: 'default', locked: 'default', paid: 'success', reversed: 'danger',
};

export function MpPayoutsPage() {
  const [tab, setTab] = useState<'farmers' | 'operators'>('farmers');
  return (
    <div>
      <PageHeader title="Payouts" description="Farmer payout cycles and operator payouts." fullWidth />
      <Tabs<'farmers' | 'operators'>
        active={tab}
        onChange={setTab}
        tabs={[{ id: 'farmers', label: 'Farmers' }, { id: 'operators', label: 'Operators' }]}
      />
      {tab === 'farmers' ? <FarmersPayoutTab /> : <OperatorsPayoutTab />}
    </div>
  );
}

function FarmersPayoutTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = usePayoutCycles({ limit: 100 });
  const cycles = data?.data ?? [];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />New cycle</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>Cycles</CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><Th>Cycle</Th><Th>Period</Th><Th align="right">Net ₹</Th><Th>Status</Th></TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={4} cols={4} />
                ) : cycles.length === 0 ? (
                  <TableEmpty colSpan={4} message="No cycles yet." />
                ) : (
                  cycles.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c.id)}>
                      <TableCell className="font-medium">{c.cycleNo}</TableCell>
                      <TableCell className="text-xs text-zinc-500">{c.periodStart} → {c.periodEnd}</TableCell>
                      <TableCell className="text-right">{c.totalNet}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {selected ? <CycleDetail cycleId={selected} /> : <LedgerCard />}
      </div>

      {showCreate && <CreateCycleModal onClose={() => setShowCreate(false)} onCreated={(id) => { setSelected(id); setShowCreate(false); }} />}
    </div>
  );
}

function CycleDetail({ cycleId }: { cycleId: string }) {
  const { data } = usePayoutCycle(cycleId);
  const lock = useCycleAction('lock');
  const pay = useCycleAction('pay');
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);
  const cycle = data?.data;
  if (!cycle) return <Card><CardContent className="py-10 text-center text-sm text-zinc-500">Loading cycle…</CardContent></Card>;

  const act = (m: typeof lock, label: string) =>
    m.mutate(cycleId, { onSuccess: () => toast(`Cycle ${label}`, 'success'), onError: () => toast(`Failed to ${label}`, 'error') });

  const downloadStatement = async (farmerId: string, ref: string) => {
    setDownloading(farmerId);
    try {
      await sharePdf({
        path: `/milk-procurement/farmers/${farmerId}/pour-statement`,
        params: { from: cycle.periodStart, to: cycle.periodEnd, label: `Cycle ${cycle.cycleNo}`, format: 'pdf' },
        filename: `pour-statement-${ref}-${cycle.periodStart}.pdf`,
        title: `Pour statement ${ref} — ${cycle.cycleNo}`,
      });
    } catch {
      toast('Failed to download statement', 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>{cycle.cycleNo} · <Badge variant={STATUS_VARIANT[cycle.status]}>{cycle.status}</Badge></span>
          <div className="flex gap-2">
            {cycle.status === 'open' && <Button size="sm" onClick={() => act(lock, 'locked')} loading={lock.isPending}>Lock</Button>}
            {cycle.status === 'locked' && <Button size="sm" onClick={() => act(pay, 'paid')} loading={pay.isPending}>Pay</Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-3 gap-2 px-4 py-3 text-sm">
          <div><div className="text-zinc-500">Gross</div><div className="font-semibold">₹{cycle.totalGross}</div></div>
          <div><div className="text-zinc-500">Deductions</div><div className="font-semibold">₹{cycle.totalDeductions}</div></div>
          <div><div className="text-zinc-500">Net</div><div className="font-semibold text-emerald-700">₹{cycle.totalNet}</div></div>
        </div>
        <Table>
          <TableHeader><TableRow><Th>Farmer line</Th><Th align="right">Gross</Th><Th align="right">Deduct</Th><Th align="right">Net</Th><Th>Paid</Th><Th /></TableRow></TableHeader>
          <TableBody>
            {cycle.lines.length === 0 ? (
              <TableEmpty colSpan={6} message="No lines." />
            ) : (
              cycle.lines.map((l) => {
                const ref = l.statementNo ?? l.farmerId.slice(0, 8);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{ref}</TableCell>
                    <TableCell className="text-right">{l.grossAmount}</TableCell>
                    <TableCell className="text-right">{l.deductionTotal}</TableCell>
                    <TableCell className="text-right font-medium">{l.netAmount}</TableCell>
                    <TableCell>{l.paymentId ? <Badge variant="success">✓</Badge> : '—'}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Download pour statement"
                        loading={downloading === l.farmerId}
                        disabled={downloading !== null}
                        onClick={() => downloadStatement(l.farmerId, ref)}
                      >
                        <FileDown className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LedgerCard() {
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
  const [f, setF] = useState({
    scopeNodeId: '', periodStart: seed?.start ?? today, periodEnd: seed?.end ?? today,
  });

  const submit = () => {
    create.mutate(
      { scopeNodeId: f.scopeNodeId || null, periodStart: f.periodStart, periodEnd: f.periodEnd },
      {
        onSuccess: (res) => { toast(`Cycle ${res.data.cycleNo} generated`, 'success'); onCreated(res.data.id); },
        onError: () => toast('Failed — no recorded collections in this period/scope?', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="New payout cycle">
      <div className="space-y-3">
        <Combobox label="Scope (VMCC) — optional" value={f.scopeNodeId} onChange={(v) => setF({ ...f, scopeNodeId: v })}
          options={[{ value: '', label: 'Whole tenant' }, ...nodes.filter((n) => n.nodeType === 'vmcc').map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))]}
          placeholder="Whole tenant" />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Period start" type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} />
          <Input label="Period end" type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Generate</Button>
        </div>
      </div>
    </Modal>
  );
}

function OperatorsPayoutTab() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const [q, setQ] = useState({ from: monthStart, to: today, nodeId: '' });
  const { data: nodesData } = useNodes({ limit: 300 });
  const nodes = nodesData?.data ?? [];
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
                lines.map((l) => <OperatorPayoutRow key={l.operatorId} line={l} period={{ from: q.from, to: q.to }} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <OperatorPayoutHistory nodes={nodes} />
    </div>
  );
}

function OperatorPayoutRow({ line, period }: { line: MpOperatorPayoutLine; period: { from: string; to: string } }) {
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

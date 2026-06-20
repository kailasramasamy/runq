import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Combobox, Input, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import {
  useNodes, useFarmers, usePours, useRecordPour, useRateCharts, milkTypeLabel,
  type MilkType, type MpRateChart, type MeasurementMode,
} from '@/hooks/queries/use-milk-procurement';
import { CollectionHistoryView } from './collection-history';

/** Mirror of the server's chart selection: milk type + active + effective on the
 * pour date, mode-matched (lactometer→clr, analyzer→matrix/flat), node-scoped
 * preferred over tenant-wide, latest effective wins. */
function pickActiveChart(
  charts: MpRateChart[], milkType: string, nodeId: string, onDate: string, mode: MeasurementMode,
): MpRateChart | null {
  const cands = charts
    .filter((c) => c.isActive && c.milkType === milkType && c.effectiveFrom <= onDate && (!c.effectiveTo || c.effectiveTo >= onDate)
      && (mode === 'lactometer' ? c.pricingMode === 'clr' : c.pricingMode !== 'clr'))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return cands.find((c) => c.scopeNodeId === nodeId) ?? cands.find((c) => c.scopeNodeId === null) ?? null;
}

const SHIFTS = [{ value: 'am', label: 'Morning (AM)' }, { value: 'pm', label: 'Evening (PM)' }];
const ALL_MILK_TYPES: MilkType[] = ['cow_a1', 'cow_a2', 'buffalo', 'mixed'];

export function MpCollectionPage({ tab }: { tab: 'record' | 'history' }) {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Collection" description="Record farmer pours and review collection history." fullWidth />
      <Tabs<'record' | 'history'>
        active={tab}
        onChange={(id) => navigate({ to: id === 'history' ? '/milk-procurement/collection/history' : '/milk-procurement/collection' })}
        tabs={[{ id: 'record', label: 'Record' }, { id: 'history', label: 'History' }]}
      />
      {tab === 'record' ? <RecordTab /> : <CollectionHistoryView />}
    </div>
  );
}

function RecordTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [nodeId, setNodeId] = useState('');
  const { data: vmccData } = useNodes({ nodeType: 'vmcc', limit: 200 });
  const vmccs = vmccData?.data ?? [];
  const active = vmccs.find((n) => n.id === nodeId);

  return (
    <div>
      <Card className="mb-4">
        <CardContent className="flex items-end gap-3 py-4">
          <div className="w-72">
            <Combobox label="VMCC (acting as)" value={nodeId} onChange={setNodeId}
              options={vmccs.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))} placeholder="Select a VMCC…" />
          </div>
          {active && <Badge variant="success">Recording at {active.name}</Badge>}
        </CardContent>
      </Card>

      {!nodeId ? (
        <Card><CardContent className="py-10 text-center text-sm text-zinc-500">Pick a VMCC to start recording collection.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <RecordPourCard
            key={nodeId}
            nodeId={nodeId} today={today}
            measurementMode={active?.measurementMode ?? 'analyzer'}
            allowedMilkTypes={active?.allowedMilkTypes ?? null}
            defaultMilkType={active?.defaultMilkType ?? null}
          />
          <TodayPoursCard nodeId={nodeId} today={today} />
        </div>
      )}
    </div>
  );
}

type RecordPourCardProps = {
  nodeId: string; today: string; measurementMode: MeasurementMode;
  allowedMilkTypes: MilkType[] | null; defaultMilkType: MilkType | null;
};

function RecordPourCard({ nodeId, today, measurementMode, allowedMilkTypes, defaultMilkType }: RecordPourCardProps) {
  const record = useRecordPour();
  const { toast } = useToast();
  const { data: farmersData } = useFarmers({ nodeId, limit: 500 });
  const farmers = farmersData?.data ?? [];
  const { data: chartsData } = useRateCharts({ limit: 200 });
  // Effective list: use node's allowed types when set, else all four.
  const effectiveTypes = allowedMilkTypes && allowedMilkTypes.length > 0 ? allowedMilkTypes : ALL_MILK_TYPES;
  const initialMilkType = defaultMilkType ?? effectiveTypes[0] ?? 'cow_a1';
  const isSingleType = effectiveTypes.length === 1;
  const [f, setF] = useState({ farmerId: '', collectionDate: today, shift: 'am', milkType: initialMilkType, qtyLitres: '', fat: '', snf: '', clr: '' });
  const isLactometer = measurementMode === 'lactometer';
  const activeChart = pickActiveChart(chartsData?.data ?? [], f.milkType, nodeId, f.collectionDate, measurementMode);

  const submit = () => {
    // lactometer VMCCs price on CLR alone; analyzer VMCCs on fat+SNF.
    const quality = isLactometer ? { clr: Number(f.clr) } : { fat: Number(f.fat), snf: Number(f.snf) };
    record.mutate(
      {
        nodeId, farmerId: f.farmerId, collectionDate: f.collectionDate,
        shift: f.shift as 'am' | 'pm', milkType: f.milkType as MilkType,
        qtyLitres: Number(f.qtyLitres), ...quality,
        captureSource: 'manual', asNewLot: false,
      },
      {
        onSuccess: (res) => {
          const p = res.data;
          const grade = p.qualityGrade ? ` · grade ${p.qualityGrade.toUpperCase()}` : '';
          toast(`Recorded ${p.qtyLitres}L${grade} · ₹${p.lineAmount}`, 'success');
          setF((prev) => ({ ...prev, farmerId: '', qtyLitres: '', fat: '', snf: '', clr: '' }));
        },
        onError: () => toast('Failed — is there an active rate chart for this milk type?', 'error'),
      },
    );
  };
  const valid = f.farmerId && f.qtyLitres && (isLactometer ? f.clr : f.fat && f.snf);

  return (
    <Card>
      <CardHeader>Record collection</CardHeader>
      <CardContent className="space-y-3">
        <Combobox label="Farmer" value={f.farmerId} onChange={(v) => setF({ ...f, farmerId: v })}
          options={farmers.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))} placeholder="Select farmer…" required />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Date" type="date" value={f.collectionDate} onChange={(e) => setF({ ...f, collectionDate: e.target.value })} />
          <Combobox label="Shift" value={f.shift} onChange={(v) => setF({ ...f, shift: v })} options={SHIFTS} />
        </div>
        {isLactometer ? (
          <div className="grid grid-cols-2 gap-2">
            <Input label="Qty (L)" type="number" value={f.qtyLitres} onChange={(e) => setF({ ...f, qtyLitres: e.target.value })} />
            <Input label="CLR" type="number" value={f.clr} onChange={(e) => setF({ ...f, clr: e.target.value })} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Input label="Qty (L)" type="number" value={f.qtyLitres} onChange={(e) => setF({ ...f, qtyLitres: e.target.value })} />
            <Input label="FAT %" type="number" value={f.fat} onChange={(e) => setF({ ...f, fat: e.target.value })} />
            <Input label="SNF %" type="number" value={f.snf} onChange={(e) => setF({ ...f, snf: e.target.value })} />
          </div>
        )}
        {isSingleType ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Milk: <span className="font-medium">{milkTypeLabel(f.milkType as MilkType)}</span>
          </p>
        ) : (
          <Combobox label="Milk" value={f.milkType} onChange={(v) => setF({ ...f, milkType: v as MilkType })}
            options={effectiveTypes.map((t) => ({ value: t, label: milkTypeLabel(t) }))} />
        )}
        {activeChart ? (
          <p className="rounded-md bg-emerald-50/60 px-2 py-1.5 text-xs text-zinc-600 dark:bg-emerald-900/10 dark:text-zinc-400">
            Rate chart:{' '}
            <Link to="/milk-procurement/rate-charts" search={{ view: activeChart.id }} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              {activeChart.name}
            </Link>{' '}
            · effective {activeChart.effectiveFrom}
          </p>
        ) : (
          <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600 dark:bg-red-900/10 dark:text-red-400">
            No active {milkTypeLabel(f.milkType as MilkType)} rate chart for {f.collectionDate} — recording will fail. Add one in Rate charts.
          </p>
        )}
        <Button className="w-full" onClick={submit} loading={record.isPending} disabled={!valid}>Record pour</Button>
      </CardContent>
    </Card>
  );
}

function TodayPoursCard({ nodeId, today }: { nodeId: string; today: string }) {
  const [date, setDate] = useState(today);
  const { data, isLoading } = usePours({ nodeId, collectionDate: date, status: 'recorded', limit: 200 });
  const pours = data?.data ?? [];
  const totalL = pours.reduce((s, p) => s + Number(p.qtyLitres), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span>{date === today ? 'Today' : 'Pours'} · {pours.length} · {totalL.toFixed(1)} L</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-zinc-200 bg-transparent px-2 py-1 text-xs tabular-nums dark:border-zinc-700"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow><Th>Receipt</Th><Th>Shift</Th><Th>Qty</Th><Th>FAT/SNF</Th><Th>Grade</Th><Th align="right">₹/L</Th><Th align="right">₹</Th></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={4} cols={7} />
            ) : pours.length === 0 ? (
              <TableEmpty colSpan={7} message="No pours yet today." />
            ) : (
              pours.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-zinc-500">{p.receiptNo}</TableCell>
                  <TableCell>{p.shift.toUpperCase()}</TableCell>
                  <TableCell>{p.qtyLitres}</TableCell>
                  <TableCell>{p.fat}/{p.snf}</TableCell>
                  <TableCell><Badge variant={p.qualityGrade === 'a' ? 'success' : 'default'}>{p.qualityGrade?.toUpperCase()}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{p.ratePerLitre}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.lineAmount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

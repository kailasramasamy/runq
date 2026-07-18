import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Download, Receipt } from 'lucide-react';
import { sharePdf } from '@/lib/share-pdf';
import {
  PageHeader, Card, CardContent, Button, Badge, Modal, Input, Combobox, EmptyState,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, useToast,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import {
  usePayoutCycle, useCycleAction, useSettleFarmer, useNodes, useGlSettings,
  type MpPayoutLine, type MpCycleDetail, type MpNode, type BillingPeriodSel, type PayoutMode,
} from '@/hooks/queries/use-milk-procurement';
import { VmccBillSection } from './billing';
import { SanityCheckPanel } from './_billing-sanity';

const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'danger'> = {
  open: 'default', locked: 'default', paid: 'success', reversed: 'danger',
};

/** The half-month BillingPeriodSel a cycle's start date falls in — VMCC billing is
 *  half-month based, so this drives the reused VmccBillSection. */
function periodOf(cycle: MpCycleDetail): BillingPeriodSel {
  const [y, m, d] = cycle.periodStart.split('-').map(Number);
  return { year: y!, month: m!, half: (d ?? 1) <= 15 ? 'first' : 'second' };
}

/** Active CCs that have at least one via_vmcc VMCC (so they have bills to show). */
function ccsWithViaVmccs(nodes: MpNode[], tenantDefault: PayoutMode): MpNode[] {
  return nodes.filter((n) => n.nodeType === 'cc').filter((cc) => {
    const ccMode = cc.payoutMode ?? tenantDefault;
    return nodes.some((v) => v.nodeType === 'vmcc' && v.parentNodeId === cc.id && v.isActive
      && (v.payoutMode ?? ccMode) === 'via_vmcc');
  });
}

/** One payout cycle, merged: VMCC bills (generate + pay) and farmer payouts (pay). */
export function MpCycleDetailPage() {
  const { cycleId } = useParams({ strict: false }) as { cycleId: string };
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = usePayoutCycle(cycleId);
  const lock = useCycleAction('lock');
  const [tab, setTab] = useState<'vmcc' | 'farmers'>('vmcc');
  const cycle = data?.data;
  if (isLoading || !cycle) return <PageHeader title="Loading…" fullWidth />;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2"
        onClick={() => navigate({ to: '/milk-procurement/billing' })}><ArrowLeft className="h-4 w-4" />Billing</Button>
      <PageHeader
        title={`Cycle ${cycle.cycleNo}`}
        titleBadge={<Badge variant={STATUS_VARIANT[cycle.status]}>{cycle.status}</Badge>}
        description={`${cycle.periodStart} → ${cycle.periodEnd}`}
        fullWidth
        actions={cycle.status === 'open' ? (
          <Button size="sm" loading={lock.isPending} onClick={() => lock.mutate(cycleId, {
            onSuccess: () => toast('Cycle locked', 'success'),
            onError: (e) => toast(e instanceof Error ? e.message : 'Failed to lock', 'error'),
          })}>Lock cycle</Button>
        ) : undefined}
      />
      <TotalsStrip cycle={cycle} />
      <Tabs active={tab} onChange={setTab}
        tabs={[{ id: 'vmcc', label: 'VMCC bills' }, { id: 'farmers', label: 'Farmers' }]} />
      {tab === 'vmcc' ? <VmccTab period={periodOf(cycle)} /> : <FarmersTab cycle={cycle} />}
    </div>
  );
}

function TotalsStrip({ cycle }: { cycle: MpCycleDetail }) {
  const tile = (label: string, value: string, accent = false) => (
    <Card><CardContent className="py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${accent ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>₹{value}</div>
    </CardContent></Card>
  );
  return (
    <div className="mb-4 grid grid-cols-3 gap-3">
      {tile('Gross', cycle.totalGross)}
      {tile('Deductions', cycle.totalDeductions)}
      {tile('Net', cycle.totalNet, true)}
    </div>
  );
}

function VmccTab({ period }: { period: BillingPeriodSel }) {
  const { data: nodesData } = useNodes({ limit: 500 });
  const { data: glData } = useGlSettings();
  const nodes = nodesData?.data ?? [];
  const tenantDefault: PayoutMode = glData?.data?.defaultPayoutMode ?? 'direct_to_farmer';
  const ccs = ccsWithViaVmccs(nodes, tenantDefault);
  if (!ccs.length) {
    return <EmptyState icon={Receipt} title="No via-VMCC VMCCs — nothing to bill for this cycle." />;
  }
  return (
    <div className="space-y-6">
      {ccs.map((cc) => (
        <div key={cc.id} className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {cc.name}<span className="ml-1 text-xs font-normal text-zinc-500">{cc.code}</span>
          </h3>
          <SanityCheckPanel ccNodeId={cc.id} period={period} />
          <VmccBillSection ccNodeId={cc.id} period={period} />
        </div>
      ))}
    </div>
  );
}

function FarmersTab({ cycle }: { cycle: MpCycleDetail }) {
  const { toast } = useToast();
  const pay = useCycleAction('pay');
  const [payTarget, setPayTarget] = useState<MpPayoutLine | null>(null);
  const unpaidDirect = cycle.lines.some((l) => !l.paidAt && !l.viaVmcc);
  const canPay = cycle.status === 'locked';

  return (
    <div className="space-y-4">
      {cycle.status === 'open' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          This cycle isn&apos;t locked yet — amounts are provisional and may change as pours are corrected.
          Lock it to finalize the payable, notify farmers, and enable payments.
        </div>
      )}
      {canPay && unpaidDirect && (
        <div className="flex justify-end">
          <Button size="sm" loading={pay.isPending} onClick={() => pay.mutate(cycle.id, {
            onSuccess: () => toast('Cycle paid', 'success'),
            onError: (e) => toast(e instanceof Error ? e.message : 'Failed to pay', 'error'),
          })}>Mark all paid</Button>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <Th>Farmer</Th><Th>VMCC</Th><Th align="right">Qty (L)</Th>
              <Th align="right">Gross</Th><Th align="right">Deduct</Th><Th align="right">Net</Th>
              <Th>Status</Th><Th align="right">Action</Th>
            </TableRow></TableHeader>
            <TableBody>
              {cycle.lines.length === 0 ? (
                <TableEmpty colSpan={8} message="No farmers in this cycle." />
              ) : (
                cycle.lines.map((l) => (
                  <FarmerLineRow key={l.id} line={l} cycle={cycle} canPay={canPay} onPay={setPayTarget} />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {payTarget && <PayFarmerModal line={payTarget} onClose={() => setPayTarget(null)} />}
    </div>
  );
}

function LineStatus({ line }: { line: MpPayoutLine }) {
  if (line.paidAt) return <Badge variant="success">Paid</Badge>;
  if (line.viaVmcc) return <span className="text-xs text-zinc-400">Via VMCC bill</span>;
  return <Badge variant="warning">Unpaid</Badge>;
}

function FarmerLineRow({ line, cycle, canPay, onPay }: {
  line: MpPayoutLine; cycle: MpCycleDetail; canPay: boolean; onPay: (l: MpPayoutLine) => void;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      await sharePdf({
        path: `/milk-procurement/farmers/${line.farmerId}/pour-statement`,
        params: { from: cycle.periodStart, to: cycle.periodEnd, label: `Cycle ${cycle.cycleNo}`, format: 'pdf' },
        filename: `pour-statement-${line.farmerCode}-${cycle.periodStart}.pdf`,
        title: `Pour statement ${line.farmerCode}`,
      });
    } catch {
      toast('Failed to download statement', 'error');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium text-zinc-900 dark:text-zinc-100">{line.farmerName}</div>
        <div className="text-xs text-zinc-500">{line.farmerCode}</div>
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-300">{line.vmccName ?? '—'}</TableCell>
      <TableCell className="text-right tabular-nums">{line.qtyLitres}</TableCell>
      <TableCell className="text-right tabular-nums">₹{line.grossAmount}</TableCell>
      <TableCell className="text-right tabular-nums">₹{line.deductionTotal}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">₹{line.netAmount}</TableCell>
      <TableCell><LineStatus line={line} /></TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {canPay && !line.paidAt && !line.viaVmcc && <Button size="sm" onClick={() => onPay(line)}>Pay</Button>}
          <Button size="sm" variant="ghost" title="Download statement" loading={downloading} onClick={download}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PayFarmerModal({ line, onClose }: { line: MpPayoutLine; onClose: () => void }) {
  const settle = useSettleFarmer();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ paymentMode: 'bank_transfer', paymentDate: today, txnReference: '' });
  const submit = () => settle.mutate(
    { lineId: line.id, data: { paymentMode: f.paymentMode, paymentDate: f.paymentDate, txnReference: f.txnReference || undefined } },
    {
      onSuccess: () => { toast(`Paid ${line.farmerName}`, 'success'); onClose(); },
      onError: (e) => toast(e instanceof Error ? e.message : 'Payment failed', 'error'),
    },
  );
  return (
    <Modal open onClose={onClose} title={`Pay ${line.farmerName} · ${line.farmerCode}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50">
          Net payable: <span className="font-semibold">₹{line.netAmount}</span>
        </div>
        <Combobox label="Mode" value={f.paymentMode} onChange={(v) => setF({ ...f, paymentMode: v })} options={PAYMENT_MODES} />
        <Input label="Date" type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} />
        <Input label="Reference (UTR)" value={f.txnReference} placeholder="Optional"
          onChange={(e) => setF({ ...f, txnReference: e.target.value })} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={settle.isPending}>Record payment</Button>
        </div>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { Coins, Lock, CheckCircle2, Receipt, RotateCcw } from 'lucide-react';
import {
  PageHeader, Card, CardContent, StatsCard, Combobox, Modal, Input, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, Button, EmptyState, Skeleton,
  useToast,
} from '@/components/ui';
import {
  usePayoutCycles, useNodes, useCycleBillingSummary, useBillableVmccs, useDirectDetail, useGlSettings,
  useGenerateVmccBills, usePayVmccBill, useReverseVmccBill,
  useSettleFarmer, useReverseFarmer, useSettleOperator, useReverseOperator, useRegenerateDirect,
  type MpPayoutCycle, type MpNode, type MpCycleBillingSummary, type MpBillableVmcc,
  type MpDirectPaymentRow, type MpDirectFarmerBill, type MpOperatorPayoutLine,
  type BillingHalf, type BillingPeriodSel, type PayoutMode,
} from '@/hooks/queries/use-milk-procurement';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => today().slice(0, 7) + '-01';

const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Months with the current month first, then descending (wrapping) — recent first. */
function monthOptions(): { value: string; label: string }[] {
  const cur = new Date().getMonth() + 1; // 1–12
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((cur - 1 - i + 12) % 12) + 1;
    return { value: String(m), label: MONTH_NAMES[m - 1]! };
  });
}
const HALVES = [
  { value: 'first', label: '1st – 15th' },
  { value: 'second', label: '16th – month end' },
];

/** Default to the current calendar half-month. */
function currentPeriod(): BillingPeriodSel {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, half: d.getDate() <= 15 ? 'first' : 'second' };
}
function yearOptions(): { value: string; label: string }[] {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2].map((v) => ({ value: String(v), label: String(v) }));
}

// ── Money strip ────────────────────────────────────────────────────────────────

function MoneyStrip({ cycles, isLoading }: { cycles: MpPayoutCycle[]; isLoading: boolean }) {
  const owed = cycles.filter((c) => c.status === 'open').reduce((s, c) => s + Number(c.totalNet), 0);
  const locked = cycles.filter((c) => c.status === 'locked').reduce((s, c) => s + Number(c.totalNet), 0);
  const paidMonth = cycles
    .filter((c) => c.status === 'paid' && c.periodEnd >= firstOfMonth())
    .reduce((s, c) => s + Number(c.totalNet), 0);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <StatsCard title="Owed (open)" value={owed} icon={Coins} />
      <StatsCard title="Locked" value={locked} icon={Lock} />
      <StatsCard title="Paid this month" value={paidMonth} icon={CheckCircle2} />
    </div>
  );
}

// ── VMCC billing ─────────────────────────────────────────────────────────────

function billBadge(row: MpBillableVmcc) {
  const status = row.bill?.status;
  if (status === 'paid') return <Badge variant="success">Paid</Badge>;
  if (status === 'reversed') return <Badge variant="danger">Reversed</Badge>;
  if (status === 'generated') return <Badge variant="warning">Generated</Badge>;
  return <span className="text-xs text-zinc-400">Not generated</span>;
}

function BillRow({ row, onPay, onReverse }: {
  row: MpBillableVmcc;
  onPay: (row: MpBillableVmcc) => void;
  onReverse: (row: MpBillableVmcc) => void;
}) {
  const bill = row.bill;
  return (
    <TableRow>
      <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">
        {row.vmccName}
        <span className="ml-1 text-xs text-zinc-500">{row.vmccCode}</span>
        {bill?.txnReference && <div className="text-xs text-zinc-400">Ref: {bill.txnReference}</div>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{inr(row.milkCost)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {inr(row.commission)}
        {(row.salary > 0 || row.rent > 0) && (
          <div className="text-xs text-zinc-400">
            {row.salary > 0 && `sal ${inr(row.salary)}`}{row.salary > 0 && row.rent > 0 && ' · '}
            {row.rent > 0 && `rent ${inr(row.rent)}`}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{inr(row.total)}</TableCell>
      <TableCell>{billBadge(row)}</TableCell>
      <TableCell className="text-right">
        {bill?.status === 'generated' && (
          <Button size="sm" onClick={() => onPay(row)}>Record payment</Button>
        )}
        {bill?.status === 'paid' && (
          <Button size="sm" variant="ghost" onClick={() => onReverse(row)}>
            <RotateCcw size={14} className="mr-1" /> Reverse
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

interface PaymentDetails { txnReference?: string; paymentMode: string; paymentDate: string }

/** Shared payment-confirmation modal: txn reference + mode + date over a summary. */
function PaymentModal({ title, summary, submitting, onClose, onConfirm }: {
  title: string; summary: React.ReactNode; submitting: boolean;
  onClose: () => void; onConfirm: (d: PaymentDetails) => void;
}) {
  const [txnReference, setTxn] = useState('');
  const [paymentMode, setMode] = useState('bank_transfer');
  const [paymentDate, setDate] = useState(today());
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-800">{summary}</div>
        <Combobox label="Payment mode" value={paymentMode} onChange={setMode} options={PAYMENT_MODES} />
        <Input label="Transaction reference (UTR / UPI ref)" value={txnReference}
          onChange={(e) => setTxn(e.target.value)} placeholder="Optional" />
        <DateInput label="Payment date" value={paymentDate} onChange={(e) => setDate(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm({ txnReference: txnReference || undefined, paymentMode, paymentDate })}
            disabled={submitting}>Confirm payment</Button>
        </div>
      </div>
    </Modal>
  );
}

function SummaryLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? 'mt-1 flex justify-between border-t border-zinc-200 pt-1 font-semibold dark:border-zinc-700' : 'flex justify-between'}>
      <span className={strong ? '' : 'text-zinc-500'}>{label}</span><span className="tabular-nums">{inr(value)}</span>
    </div>
  );
}

function PayBillModal({ row, onClose }: { row: MpBillableVmcc; onClose: () => void }) {
  const { toast } = useToast();
  const pay = usePayVmccBill();
  if (!row.bill) return null;
  const billId = row.bill.id;
  return (
    <PaymentModal
      title={`Record payment — ${row.vmccName}`} submitting={pay.isPending} onClose={onClose}
      summary={<>
        <SummaryLine label="Milk cost" value={row.milkCost} />
        <SummaryLine label="Commission" value={row.commission + row.salary + row.rent} />
        <SummaryLine label="Total" value={row.total} strong />
      </>}
      onConfirm={(d) => pay.mutate({ id: billId, data: d }, {
        onSuccess: () => { toast(`Paid ${row.vmccName}`, 'success'); onClose(); },
        onError: (e) => toast(e instanceof Error ? e.message : 'Payment failed', 'error'),
      })}
    />
  );
}

function VmccBillSection({ ccNodeId, period }: { ccNodeId: string; period: BillingPeriodSel }) {
  const { toast } = useToast();
  const { data, isLoading } = useBillableVmccs({ ...period, ccNodeId });
  const generate = useGenerateVmccBills();
  const reverse = useReverseVmccBill();
  const [payTarget, setPayTarget] = useState<MpBillableVmcc | null>(null);
  const rows = data?.data ?? [];
  // Anything not already paid can be created/refreshed/revived; paid bills are frozen.
  const actionable = rows.some((r) => (r.milkCost > 0 || r.total > 0) && r.bill?.status !== 'paid');
  const hasExisting = rows.some((r) => r.bill && r.bill.status !== 'paid');

  function generateAll() {
    generate.mutate({ ...period, ccNodeId }, {
      onSuccess: (res) => toast(`${hasExisting ? 'Regenerated' : 'Generated'} ${res.data.length} bill(s)`, 'success'),
      onError: (e) => toast(e instanceof Error ? e.message : 'Generation failed', 'error'),
    });
  }
  function onReverse(row: MpBillableVmcc) {
    if (!row.bill) return;
    reverse.mutate(row.bill.id, {
      onSuccess: () => toast(`Reversed ${row.vmccName}`, 'success'),
      onError: (e) => toast(e instanceof Error ? e.message : 'Reversal failed', 'error'),
    });
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">VMCC bills</h2>
            {hasExisting && (
              <p className="text-xs text-zinc-500">Corrected milk or commission data? Regenerate refreshes unpaid bills; paid bills stay frozen (reverse a paid bill to change it).</p>
            )}
          </div>
          {actionable && (
            <Button size="sm" onClick={generateAll} disabled={generate.isPending}>
              {hasExisting ? 'Regenerate bills' : 'Generate bills'}
            </Button>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No via-VMCC VMCCs under this centre for the cycle." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th>VMCC</Th><Th align="right">Milk cost</Th><Th align="right">Commission</Th>
                <Th align="right">Total</Th><Th>Status</Th><Th align="right">Action</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <BillRow key={r.vmccNodeId} row={r} onPay={setPayTarget} onReverse={onReverse} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {payTarget && <PayBillModal row={payTarget} onClose={() => setPayTarget(null)} />}
    </Card>
  );
}

// ── Direct-to-farmer payment tracking ───────────────────────────────────────────

function directBadge(r: MpDirectPaymentRow) {
  if (r.pendingAmount <= 0) return <Badge variant="success">Cleared</Badge>;
  if (r.paidCount > 0) return <Badge variant="warning">Partial</Badge>;
  return <Badge variant="danger">Unpaid</Badge>;
}

function SectionCard({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
            {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function VmccTotalsTable({ rows }: { rows: MpDirectPaymentRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>VMCC</Th><Th>Farmers</Th><Th align="right">Owed</Th>
          <Th align="right">Paid</Th><Th align="right">Pending</Th><Th>Status</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.vmccNodeId}>
            <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">
              {r.vmccName}<span className="ml-1 text-xs text-zinc-500">{r.vmccCode}</span>
            </TableCell>
            <TableCell className="text-xs text-zinc-500">{r.paidCount}/{r.farmerCount} farmers</TableCell>
            <TableCell className="text-right tabular-nums">{inr(r.netOwed)}</TableCell>
            <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{inr(r.paidAmount)}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">{r.pendingAmount > 0 ? inr(r.pendingAmount) : '—'}</TableCell>
            <TableCell>{directBadge(r)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ActionButton({ paid, busy, onSettle, onReverse }: {
  paid: boolean; busy: boolean; onSettle: () => void; onReverse: () => void;
}) {
  return paid
    ? <Button size="sm" variant="ghost" disabled={busy} onClick={onReverse}><RotateCcw size={14} className="mr-1" /> Reverse</Button>
    : <Button size="sm" disabled={busy} onClick={onSettle}>Pay</Button>;
}

function FarmerBillsTable({ rows, onSettle, onReverse, busyId }: {
  rows: MpDirectFarmerBill[]; onSettle: (f: MpDirectFarmerBill) => void;
  onReverse: (f: MpDirectFarmerBill) => void; busyId: string | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Farmer</Th><Th>VMCC</Th><Th align="right">Litres</Th>
          <Th align="right">Gross</Th><Th align="right">Deductions</Th><Th align="right">Net payable</Th>
          <Th>Status</Th><Th align="right">Action</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((f) => (
          <TableRow key={f.lineId}>
            <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">
              {f.farmerName}<span className="ml-1 text-xs text-zinc-500">{f.farmerCode}</span>
              {f.paymentReference && <div className="text-xs text-zinc-400">Ref: {f.paymentReference}</div>}
            </TableCell>
            <TableCell className="text-xs text-zinc-500">{f.vmccName}</TableCell>
            <TableCell className="text-right tabular-nums">{f.qtyLitres.toLocaleString('en-IN')}</TableCell>
            <TableCell className="text-right tabular-nums">{inr(f.grossAmount)}</TableCell>
            <TableCell className="text-right tabular-nums text-zinc-500">{f.deductionTotal > 0 ? '−' + inr(f.deductionTotal) : '—'}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">{inr(f.netAmount)}</TableCell>
            <TableCell>{f.paid ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Pending</Badge>}</TableCell>
            <TableCell className="text-right">
              <ActionButton paid={f.paid} busy={busyId === f.lineId} onSettle={() => onSettle(f)} onReverse={() => onReverse(f)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OperatorCompTable({ rows, onSettle, onReverse, busyId }: {
  rows: MpOperatorPayoutLine[]; onSettle: (o: MpOperatorPayoutLine) => void;
  onReverse: (o: MpOperatorPayoutLine) => void; busyId: string | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>Operator / VMCC</Th><Th>Type</Th><Th align="right">Commission</Th>
          <Th align="right">Salary</Th><Th align="right">Rent</Th><Th align="right">Total</Th>
          <Th>Status</Th><Th align="right">Action</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => (
          <TableRow key={o.operatorId}>
            <TableCell className="text-sm text-zinc-900 dark:text-zinc-100">
              {o.name ?? o.nodeName}<span className="ml-1 text-xs text-zinc-500">· {o.nodeName}</span>
            </TableCell>
            <TableCell className="text-xs text-zinc-500 capitalize">{o.compType.replace(/_/g, ' ')}</TableCell>
            <TableCell className="text-right tabular-nums">{o.commission > 0 ? inr(o.commission) : '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{o.salary > 0 ? inr(o.salary) : '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{o.rent > 0 ? inr(o.rent) : '—'}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">{inr(o.total)}</TableCell>
            <TableCell>{o.paidPayoutId ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Due</Badge>}</TableCell>
            <TableCell className="text-right">
              <ActionButton paid={!!o.paidPayoutId} busy={busyId === o.operatorId} onSettle={() => onSettle(o)} onReverse={() => onReverse(o)} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DirectPaymentSection({ ccNodeId, period }: { ccNodeId: string; period: BillingPeriodSel }) {
  const { toast } = useToast();
  const { data, isLoading } = useDirectDetail({ ...period, ccNodeId });
  const settleFarmer = useSettleFarmer();
  const reverseFarmer = useReverseFarmer();
  const settleOperator = useSettleOperator();
  const reverseOperator = useReverseOperator();
  const regenerate = useRegenerateDirect();
  const [farmerTarget, setFarmerTarget] = useState<MpDirectFarmerBill | null>(null);
  const [operatorTarget, setOperatorTarget] = useState<MpOperatorPayoutLine | null>(null);
  const detail = data?.data;

  function onReverseFarmer(f: MpDirectFarmerBill) {
    reverseFarmer.mutate(f.lineId, {
      onSuccess: () => toast(`${f.farmerName} payment reversed`, 'success'),
      onError: (e) => toast(e instanceof Error ? e.message : 'Reversal failed', 'error'),
    });
  }
  function onRegenerate() {
    regenerate.mutate({ ...period, ccNodeId }, {
      onSuccess: (res) => toast(
        res.data.rebuilt ? 'Regenerated from current data — paid farmers left unchanged'
          : 'Nothing to regenerate — all farmers already settled',
        'success',
      ),
      onError: (e) => toast(e instanceof Error ? e.message : 'Regenerate failed', 'error'),
    });
  }
  function onReverseOperator(o: MpOperatorPayoutLine) {
    if (!detail) return;
    reverseOperator.mutate(
      { operatorId: o.operatorId, periodStart: detail.periodStart, periodEnd: detail.periodEnd },
      {
        onSuccess: () => toast(`${o.name ?? o.nodeName} payout reversed`, 'success'),
        onError: (e) => toast(e instanceof Error ? e.message : 'Reversal failed', 'error'),
      },
    );
  }

  if (isLoading) {
    return <SectionCard title="Direct farmer payments"><div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div></SectionCard>;
  }
  if (!detail || detail.vmccs.length === 0) {
    return <SectionCard title="Direct farmer payments"><EmptyState icon={Receipt} title="No farmer collections under this centre for the period." /></SectionCard>;
  }
  const farmerBusy = settleFarmer.isPending ? settleFarmer.variables?.lineId ?? null : reverseFarmer.isPending ? reverseFarmer.variables ?? null : null;
  const opBusy = settleOperator.isPending ? settleOperator.variables?.operatorId ?? null : reverseOperator.isPending ? reverseOperator.variables?.operatorId ?? null : null;
  return (
    <div className="space-y-4">
      {/* Scoped to "these VMCCs", not "this centre": a centre can hold both
          modes, and the via-VMCC ones are billed in the section above. */}
      <SectionCard title="VMCC totals" subtitle="These VMCCs' farmers are paid directly — settle each farmer and operator below.">
        <VmccTotalsTable rows={detail.vmccs} />
      </SectionCard>
      <SectionCard title="Farmer bills" subtitle="Amount payable to each farmer this cycle — Pay records the payment (GL + txn) as you disburse."
        action={<Button size="sm" variant="ghost" onClick={onRegenerate} disabled={regenerate.isPending}>Regenerate</Button>}>
        <FarmerBillsTable rows={detail.farmers} onSettle={setFarmerTarget} onReverse={onReverseFarmer} busyId={farmerBusy} />
      </SectionCard>
      {detail.operators.length > 0 && (
        <SectionCard title="Operator commission & salary" subtitle="Paid to VMCC operators separately from farmer payments.">
          <OperatorCompTable rows={detail.operators} onSettle={setOperatorTarget} onReverse={onReverseOperator} busyId={opBusy} />
        </SectionCard>
      )}
      {farmerTarget && (
        <PaymentModal
          title={`Pay ${farmerTarget.farmerName}`} submitting={settleFarmer.isPending} onClose={() => setFarmerTarget(null)}
          summary={<>
            <SummaryLine label="Gross" value={farmerTarget.grossAmount} />
            {farmerTarget.deductionTotal > 0 && <SummaryLine label="Deductions" value={-farmerTarget.deductionTotal} />}
            <SummaryLine label="Net payable" value={farmerTarget.netAmount} strong />
          </>}
          onConfirm={(d) => settleFarmer.mutate({ lineId: farmerTarget.lineId, data: d }, {
            onSuccess: () => { toast(`Paid ${farmerTarget.farmerName}`, 'success'); setFarmerTarget(null); },
            onError: (e) => toast(e instanceof Error ? e.message : 'Payment failed', 'error'),
          })}
        />
      )}
      {operatorTarget && (
        <PaymentModal
          title={`Pay ${operatorTarget.name ?? operatorTarget.nodeName}`} submitting={settleOperator.isPending} onClose={() => setOperatorTarget(null)}
          summary={<>
            {operatorTarget.commission > 0 && <SummaryLine label="Commission" value={operatorTarget.commission} />}
            {operatorTarget.salary > 0 && <SummaryLine label="Salary" value={operatorTarget.salary} />}
            {operatorTarget.rent > 0 && <SummaryLine label="Rent" value={operatorTarget.rent} />}
            <SummaryLine label="Total" value={operatorTarget.total} strong />
          </>}
          onConfirm={(d) => settleOperator.mutate(
            { operatorId: operatorTarget.operatorId, data: { ...d, periodStart: detail.periodStart, periodEnd: detail.periodEnd } },
            {
              onSuccess: () => { toast(`Paid ${operatorTarget.name ?? operatorTarget.nodeName}`, 'success'); setOperatorTarget(null); },
              onError: (e) => toast(e instanceof Error ? e.message : 'Payment failed', 'error'),
            },
          )}
        />
      )}
    </div>
  );
}

// ── Cycle payment clearance (last 5 cycles) ─────────────────────────────────────

function clearanceBadge(r: MpCycleBillingSummary) {
  if (r.billCount === 0) return <Badge>Not billed</Badge>;
  if (r.pendingTotal <= 0) return <Badge variant="success">Cleared</Badge>;
  if (r.paidBillCount > 0) return <Badge variant="warning">Partial</Badge>;
  return <Badge variant="danger">Unpaid</Badge>;
}

function ClearanceRow({ r }: { r: MpCycleBillingSummary }) {
  return (
    <TableRow>
      <TableCell className="text-sm text-zinc-900 dark:text-zinc-100">
        {r.periodStart} → {r.periodEnd}
        <span className="ml-2 text-xs text-zinc-500">{r.cycleNo}</span>
      </TableCell>
      <TableCell className="text-xs text-zinc-500">{r.paidBillCount}/{r.billCount} bills</TableCell>
      <TableCell className="text-right tabular-nums">{inr(r.billedTotal)}</TableCell>
      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{inr(r.paidTotal)}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{r.pendingTotal > 0 ? inr(r.pendingTotal) : '—'}</TableCell>
      <TableCell>{clearanceBadge(r)}</TableCell>
    </TableRow>
  );
}

function CycleClearance() {
  const { data, isLoading } = useCycleBillingSummary(5);
  const rows = data?.data ?? [];
  return (
    <Card>
      <CardContent className="pt-4">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recent cycles — payment clearance</h2>
        <p className="mb-3 text-xs text-zinc-500">Where each of the last 5 cycles stands: billed vs paid to VMCCs.</p>
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full rounded" />)}</div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No cycles yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Cycle</Th><Th>Bills</Th><Th align="right">Billed</Th>
                <Th align="right">Paid</Th><Th align="right">Pending</Th><Th>Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => <ClearanceRow key={r.cycleId} r={r} />)}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

function BillingControls({ ccNodeId, ccs, period, onCc, onPeriod }: {
  ccNodeId: string; ccs: MpNode[]; period: BillingPeriodSel;
  onCc: (v: string) => void; onPeriod: (p: BillingPeriodSel) => void;
}) {
  const ccOptions = ccs.map((n) => ({ value: n.id, label: `${n.name} (${n.code})` }));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Combobox label="Chilling centre" options={ccOptions} value={ccNodeId} onChange={onCc}
        placeholder="Select a CC…" />
      <Combobox label="Year" options={yearOptions()} value={String(period.year)}
        onChange={(v) => onPeriod({ ...period, year: Number(v) })} />
      <Combobox label="Month" options={monthOptions()} value={String(period.month)}
        onChange={(v) => onPeriod({ ...period, month: Number(v) })} />
      <Combobox label="Cycle" options={HALVES} value={period.half}
        onChange={(v) => onPeriod({ ...period, half: v as BillingHalf })} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function MpBillingPage() {
  const { data: cyclesData, isLoading: cyclesLoading } = usePayoutCycles({ limit: 100 });
  const { data: nodesData } = useNodes({ limit: 500 });
  const { data: glData } = useGlSettings();
  const cycles = cyclesData?.data ?? [];
  const nodes = nodesData?.data ?? [];
  const ccs = nodes.filter((n) => n.nodeType === 'cc');
  const [ccNodeId, setCc] = useState('');
  const [period, setPeriod] = useState<BillingPeriodSel>(currentPeriod);
  // Payout mode is per VMCC (vmcc ?? its CC ?? tenant default), so one centre can
  // hold both kinds — and does. Branching the whole page on the CC's own mode hid
  // every via-VMCC bill under a CC that inherited direct_to_farmer, which is why
  // those bills were never generated. Decide per section instead, mirroring
  // vmccsByMode() on the server.
  const tenantDefault: PayoutMode = glData?.data?.defaultPayoutMode ?? 'direct_to_farmer';
  const ccMode: PayoutMode = ccs.find((c) => c.id === ccNodeId)?.payoutMode ?? tenantDefault;
  const vmccModes = nodes
    .filter((n) => n.nodeType === 'vmcc' && n.parentNodeId === ccNodeId && n.isActive)
    .map((v) => v.payoutMode ?? ccMode);
  const hasVia = vmccModes.includes('via_vmcc');
  const hasDirect = vmccModes.includes('direct_to_farmer');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Billing"
        description="Bill each VMCC that pays farmers on your behalf — milk cost plus commission — and record the settlement."
        fullWidth
      />
      <MoneyStrip cycles={cycles} isLoading={cyclesLoading} />
      <CycleClearance />
      <Card>
        <CardContent className="pt-4">
          <BillingControls ccNodeId={ccNodeId} ccs={ccs} period={period} onCc={setCc} onPeriod={setPeriod} />
        </CardContent>
      </Card>
      {!ccNodeId && <EmptyState icon={Receipt} title="Pick a chilling centre to bill its VMCCs." />}
      {ccNodeId && !hasVia && !hasDirect && (
        <EmptyState icon={Receipt} title="No active VMCCs under this centre." />
      )}
      {ccNodeId && hasVia && <VmccBillSection ccNodeId={ccNodeId} period={period} />}
      {ccNodeId && hasDirect && <DirectPaymentSection ccNodeId={ccNodeId} period={period} />}
    </div>
  );
}

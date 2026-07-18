import { useState } from 'react';
import { Coins, CheckCircle2, Receipt, RotateCcw, Eye, Download } from 'lucide-react';
import { sharePdf } from '@/lib/share-pdf';
import { Tabs } from '@/components/ar/primitives';
import { CyclesList, LedgerCard, OperatorsPayoutTab } from './payouts';
import {
  PageHeader, Card, CardContent, StatsCard, Combobox, Modal, Input, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, Button, EmptyState, Skeleton,
  useToast,
} from '@/components/ui';
import {
  useBillableVmccs, useGenerateVmccBills, usePayVmccBill, useReverseVmccBill,
  useVmccBillDetail, milkTypeLabel,
  type MpBillableVmcc, type BillingPeriodSel, type MilkType,
} from '@/hooks/queries/use-milk-procurement';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const today = () => new Date().toISOString().slice(0, 10);

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

/** 'YYYY-MM-DD' → 'D Mon' (e.g. '2026-07-18' → '18 Jul'), matching the PDF. */
function fmtDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]?.slice(0, 3) ?? m}`;
}

/**
 * Download-a-PDF button that shows its own progress. The fetch can take a
 * second (Puppeteer renders it), so without a spinner a second click fires a
 * second render; this disables + spins while in flight and toasts on failure
 * rather than swallowing it.
 */
function DownloadBillButton({ options, label = 'Download bill' }: {
  options: Parameters<typeof sharePdf>[0]; label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const run = async () => {
    setBusy(true);
    try {
      await sharePdf(options);
    } catch {
      toast('Could not generate the PDF', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" loading={busy} onClick={run}>
      {!busy && <Download size={14} className="mr-1" />}
      {busy ? 'Preparing…' : label}
    </Button>
  );
}

// ── VMCC billing ─────────────────────────────────────────────────────────────

/**
 * The whole CC's bill for the selected cycle, rolled up across its VMCCs —
 * the via_vmcc counterpart of the "VMCC totals" strip on the direct side. Gives
 * the one number the CC owes before drilling into any single VMCC.
 */
function CcTotals({ rows }: { rows: MpBillableVmcc[] }) {
  const litres = rows.reduce((s, r) => s + r.qtyLitres, 0);
  const milkCost = rows.reduce((s, r) => s + r.milkCost, 0);
  const commission = rows.reduce((s, r) => s + r.commission + r.salary + r.rent, 0);
  const net = rows.reduce((s, r) => s + r.total, 0);
  const paid = rows.filter((r) => r.bill?.status === 'paid').length;
  const generated = rows.filter((r) => r.bill?.status === 'generated').length;
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">CC totals</h2>
        <span className="text-xs text-zinc-500">
          {rows.length} VMCC{rows.length === 1 ? '' : 's'} · {paid} paid · {generated} generated
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Total milk" value={litres} icon={Receipt} size="compact"
          formatValue={(v) => `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`} />
        <StatsCard title="Milk cost" value={milkCost} icon={Coins} size="compact" />
        <StatsCard title="Commission" value={commission} icon={Coins} size="compact" />
        <StatsCard title="Net payable" value={net} icon={CheckCircle2} size="compact" />
      </div>
    </div>
  );
}

function billBadge(row: MpBillableVmcc) {
  const status = row.bill?.status;
  if (status === 'paid') return <Badge variant="success">Paid</Badge>;
  if (status === 'reversed') return <Badge variant="danger">Reversed</Badge>;
  if (status === 'generated') return <Badge variant="warning">Generated</Badge>;
  return <span className="text-xs text-zinc-400">Not generated</span>;
}

/**
 * The day-by-day supply behind one VMCC's milk cost. A bulk VMCC has no farmer
 * lines, so the CC's receipts are the only record of what it delivered — this is
 * the whole audit trail for the money.
 */
function BillDetailModal({ row, period, onClose }: {
  row: MpBillableVmcc; period: BillingPeriodSel; onClose: () => void;
}) {
  const { data, isLoading } = useVmccBillDetail({ ...period, vmccNodeId: row.vmccNodeId });
  const d = data?.data;
  const num = (v: number | null, dp = 1) => (v == null ? '—' : v.toFixed(dp));
  const commission = row.commission + row.salary + row.rent;
  return (
    <Modal open onClose={onClose} title={`${row.vmccName} · ${row.vmccCode}`} size="lg">
      {isLoading || !d ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full rounded" />)}</div>
      ) : d.lines.length === 0 ? (
        <EmptyState icon={Receipt} title="No milk received from this VMCC in this cycle." />
      ) : (
        <>
          {/* Same breakup as the downloaded bill: milk cost + commission = net payable. */}
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatsCard title="Total milk" value={row.qtyLitres} icon={Receipt} size="compact"
              formatValue={(v) => `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`} />
            <StatsCard title="Milk cost" value={row.milkCost} icon={Coins} size="compact" />
            {commission > 0 && <StatsCard title="Commission" value={commission} icon={Coins} size="compact" />}
            <StatsCard title="Net payable" value={row.total} icon={CheckCircle2} size="compact" />
          </div>
          <p className="mb-2 text-xs text-zinc-500">
            {fmtDay(d.periodStart)} → {fmtDay(d.periodEnd)} · each row is one shift&apos;s receipt at the CC,
            priced on its quality.
          </p>
          {d.unpricedLines > 0 && (
            <p className="mb-2 text-xs text-amber-600 dark:text-amber-500">
              {d.unpricedLines} shift{d.unpricedLines > 1 ? 's' : ''} could not be priced — no rate chart matched
              that quality or date, so they add ₹0 to the milk cost.
            </p>
          )}
          <div className="max-h-[45vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Date</Th><Th>Shift</Th><Th>Type</Th><Th align="right">Qty (L)</Th>
                  <Th align="right">FAT</Th><Th align="right">SNF</Th><Th align="right">Water</Th>
                  <Th align="right">₹/L</Th><Th align="right">Amount</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.lines.map((l) => (
                  <TableRow key={`${l.date}|${l.shift}|${l.milkType}`}>
                    <TableCell>{fmtDay(l.date)}</TableCell>
                    <TableCell><Badge>{l.shift.toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-xs text-zinc-500">{milkTypeLabel(l.milkType as MilkType)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(l.qtyLitres)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(l.fat, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(l.snf, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(l.water, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.ratePerLitre == null
                        ? <span className="text-amber-600 dark:text-amber-500">not priced</span>
                        : num(l.ratePerLitre, 2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <DownloadBillButton options={{
              path: '/milk-procurement/billing/vmcc-detail',
              params: { year: String(period.year), month: String(period.month), half: period.half,
                vmccNodeId: row.vmccNodeId, format: 'pdf' },
              filename: `${row.vmccName}-${d.periodStart}.pdf`,
              title: `${row.vmccName} bill`,
            }} />
            <p className="text-right text-xs text-zinc-500">
              Rows total the milk cost{commission > 0 ? '; commission is added to reach the net payable above.' : '.'}
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}

function BillRow({ row, onPay, onReverse, onView }: {
  row: MpBillableVmcc;
  onPay: (row: MpBillableVmcc) => void;
  onReverse: (row: MpBillableVmcc) => void;
  onView: (row: MpBillableVmcc) => void;
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
        <div className="flex items-center justify-end gap-1">
          {/* Available whether or not a bill exists — the point is to check the
              milk before billing it, not only after. */}
          <Button size="sm" variant="ghost" onClick={() => onView(row)}>
            <Eye size={14} className="mr-1" /> View
          </Button>
          {bill?.status === 'generated' && (
            <Button size="sm" onClick={() => onPay(row)}>Record payment</Button>
          )}
          {bill?.status === 'paid' && (
            <Button size="sm" variant="ghost" onClick={() => onReverse(row)}>
              <RotateCcw size={14} className="mr-1" /> Reverse
            </Button>
          )}
        </div>
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

export function VmccBillSection({ ccNodeId, period }: { ccNodeId: string; period: BillingPeriodSel }) {
  const { toast } = useToast();
  const { data, isLoading } = useBillableVmccs({ ...period, ccNodeId });
  const generate = useGenerateVmccBills();
  const reverse = useReverseVmccBill();
  const [payTarget, setPayTarget] = useState<MpBillableVmcc | null>(null);
  const [viewTarget, setViewTarget] = useState<MpBillableVmcc | null>(null);
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
        {rows.length > 0 && <CcTotals rows={rows} />}
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
                <BillRow key={r.vmccNodeId} row={r} onPay={setPayTarget} onReverse={onReverse}
                  onView={setViewTarget} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {payTarget && <PayBillModal row={payTarget} onClose={() => setPayTarget(null)} />}
      {viewTarget && (
        <BillDetailModal row={viewTarget} period={period} onClose={() => setViewTarget(null)} />
      )}
    </Card>
  );
}


// ── Page ───────────────────────────────────────────────────────────────────────

export function MpBillingPage() {
  const [tab, setTab] = useState<'cycles' | 'ledger' | 'operators'>('cycles');
  return (
    <div>
      <PageHeader title="Billing" description="Milk-procurement bills and payouts, organised by cycle." fullWidth />
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'cycles', label: 'Cycles' }, { id: 'ledger', label: 'Ledger' }, { id: 'operators', label: 'Operators' },
      ]} />
      {tab === 'cycles' && <CyclesList />}
      {tab === 'ledger' && <LedgerCard />}
      {tab === 'operators' && <OperatorsPayoutTab />}
    </div>
  );
}

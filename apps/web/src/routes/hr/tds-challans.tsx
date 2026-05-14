import { useState } from 'react';
import { Receipt, Landmark, CheckCircle2 } from 'lucide-react';
import {
  PageHeader, Button, Input, Modal, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge,
} from '@/components/ui';
import { StatTile, EmptyState } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import {
  useTdsChallans, useRecordTdsDeposit, type TdsChallan,
} from '@/hooks/queries/use-hr-payroll';
import { useIsReadOnly } from '@/providers/auth-provider';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** TDS deposit is due the 7th of the month after the deduction month
 *  (March → 30 April). Shown so the user knows when each challan is late. */
function depositDueDate(periodYear: number, periodMonth: number): string {
  if (periodMonth === 3) return `30 Apr ${periodYear}`;
  const dueMonth = periodMonth === 12 ? 0 : periodMonth; // 0-indexed next month
  const dueYear = periodMonth === 12 ? periodYear + 1 : periodYear;
  return `7 ${MONTHS[dueMonth]} ${dueYear}`;
}

export function TdsChallansPage() {
  const readOnly = useIsReadOnly();
  const { data, isLoading } = useTdsChallans();
  const [deposit, setDeposit] = useState<TdsChallan | null>(null);

  const challans = data?.data ?? [];
  const pending = challans.filter((c) => c.status === 'pending');
  const pendingTotal = pending.reduce((s, c) => s + Number(c.tdsAmount), 0);
  const depositedTotal = challans
    .filter((c) => c.status === 'deposited')
    .reduce((s, c) => s + Number(c.totalAmount), 0);

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'TDS challans' }]}
        title="TDS Challans — Monthly Deposit"
        description="Each approved payroll run's TDS must be deposited via Challan ITNS-281 by the 7th of the next month (March by 30 April). Record the CIN here once paid — Form 24Q links to it."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Challans" value={challans.length} />
        <StatTile label="Pending deposit" value={pending.length} />
        <StatTile label="Pending amount" value={formatINR(pendingTotal)} accentColor="#dc2626" tone="neg" />
        <StatTile label="Deposited" value={formatINR(depositedTotal)} accentColor="#16a34a" />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Period</Th>
            <Th>Section</Th>
            <Th align="right">TDS</Th>
            <Th align="right">Interest / Fee</Th>
            <Th align="right">Total</Th>
            <Th>Status</Th>
            <Th>CIN / Due</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : challans.length === 0 ? (
            <tr><td colSpan={8}>
              <EmptyState
                icon={<Receipt size={18} />}
                title="No TDS challans yet"
                description="Approve a payroll run that has TDS — a pending challan appears here automatically."
              />
            </td></tr>
          ) : challans.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <span className="num font-medium" style={{ color: 'var(--text-1)' }}>
                  {MONTHS[c.periodMonth - 1]} {c.periodYear}
                </span>
              </TableCell>
              <TableCell className="num" style={{ color: 'var(--text-3)' }}>{c.section}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(Number(c.tdsAmount))}</TableCell>
              <TableCell align="right" className="num text-[11px]" style={{ color: 'var(--text-3)' }}>
                {formatINR(Number(c.interestAmount))} / {formatINR(Number(c.lateFeeAmount))}
              </TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(Number(c.totalAmount))}</TableCell>
              <TableCell>
                <Badge variant={c.status === 'deposited' ? 'success' : 'default'}>{c.status}</Badge>
              </TableCell>
              <TableCell className="num text-[11px]" style={{ color: 'var(--text-3)' }}>
                {c.status === 'deposited'
                  ? `${c.bsrCode}-${c.challanSerialNo}`
                  : `due ${depositDueDate(c.periodYear, c.periodMonth)}`}
              </TableCell>
              <TableCell align="right">
                {!readOnly && c.status === 'pending' && (
                  <Button size="sm" variant="outline" onClick={() => setDeposit(c)}>
                    <Landmark size={13} /> Record deposit
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {deposit && <RecordDepositModal challan={deposit} onClose={() => setDeposit(null)} />}
    </div>
  );
}

function RecordDepositModal({ challan, onClose }: { challan: TdsChallan; onClose: () => void }) {
  const { toast } = useToast();
  const record = useRecordTdsDeposit();
  const [bsrCode, setBsrCode] = useState('');
  const [challanSerialNo, setChallanSerialNo] = useState('');
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [interestAmount, setInterestAmount] = useState('');
  const [lateFeeAmount, setLateFeeAmount] = useState('');
  const [bankRef, setBankRef] = useState('');

  const interest = Number(interestAmount) || 0;
  const lateFee = Number(lateFeeAmount) || 0;
  const total = Number(challan.tdsAmount) + interest + lateFee;

  function submit() {
    record.mutate(
      {
        id: challan.id,
        bsrCode,
        challanSerialNo,
        depositDate,
        interestAmount: interest,
        lateFeeAmount: lateFee,
        bankRef: bankRef || null,
      },
      {
        onSuccess: () => { toast('Deposit recorded', 'success'); onClose(); },
        onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={`Record TDS Deposit — ${MONTHS[challan.periodMonth - 1]} ${challan.periodYear}`} size="lg">
      <div className="space-y-4">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          Enter the CIN from the ITNS-281 challan counterfoil. TDS for this period is{' '}
          <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(Number(challan.tdsAmount))}</span>.
          Add interest / late fee only if the deposit was delayed.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="BSR Code"
            value={bsrCode}
            onChange={(e) => setBsrCode(e.target.value.replace(/\D/g, ''))}
            placeholder="7-digit bank branch code"
            maxLength={7}
          />
          <Input
            label="Challan Serial No."
            value={challanSerialNo}
            onChange={(e) => setChallanSerialNo(e.target.value.replace(/\D/g, ''))}
            placeholder="From the challan counterfoil"
            maxLength={10}
          />
          <Input
            label="Deposit Date"
            type="date"
            value={depositDate}
            onChange={(e) => setDepositDate(e.target.value)}
          />
          <Input
            label="Bank Reference (optional)"
            value={bankRef}
            onChange={(e) => setBankRef(e.target.value)}
            placeholder="UTR / transaction ref"
            maxLength={50}
          />
          <Input
            label="Interest (₹)"
            value={interestAmount}
            onChange={(e) => setInterestAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0"
          />
          <Input
            label="Late Fee — 234E (₹)"
            value={lateFeeAmount}
            onChange={(e) => setLateFeeAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0"
          />
        </div>

        <div className="flex items-center justify-between rounded-md p-3" style={{ background: 'var(--accent-soft)' }}>
          <span className="font-medium" style={{ color: 'var(--accent-text)' }}>Total deposited</span>
          <span className="num text-[15px] font-semibold" style={{ color: 'var(--accent-text)' }}>{formatINR(total)}</span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            loading={record.isPending}
            disabled={!/^\d{7}$/.test(bsrCode) || !challanSerialNo || !depositDate}
          >
            <CheckCircle2 size={13} /> Record deposit
          </Button>
        </div>
      </div>
    </Modal>
  );
}

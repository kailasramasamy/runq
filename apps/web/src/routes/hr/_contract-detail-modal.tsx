import { useState } from 'react';
import { AlertTriangle, Download, Pencil, X } from 'lucide-react';
import {
  Modal, Button, Badge, Input, Combobox, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { sharePdf } from '@/lib/share-pdf';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import {
  useContract, useSettlementPreview, usePayAdvance, useCancelAdvance,
  useSettleContract, useMarkDays, CONTRACT_TYPE_LABEL,
  type ContractDetail, type ContractBalance, type LabourContract,
} from '@/hooks/queries/use-hr-contracts';
import { contractStatusVariant, contractTerm, fmtDate } from './contracts';
import { ContractCalendar, lastAccrualDay, type DayState } from './_contract-calendar';
import { PauseBlock } from './_contract-pause';
import { SettlementBlock } from './_settlement-block';
import { Advances } from './_contract-advances';

const today = () => new Date().toISOString().slice(0, 10);

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
];

export function ContractDetailModal({
  contractId,
  onClose,
  onEdit,
}: {
  contractId: string | null;
  onClose: () => void;
  onEdit: (c: LabourContract) => void;
}) {
  const { data, isLoading } = useContract(contractId);
  const c = data?.data;

  return (
    <Modal
      open={!!contractId}
      onClose={onClose}
      size="xl"
      title={c ? `${c.name} · ${c.contractNumber}` : 'Contract'}
    >
      {isLoading || !c ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-5">
          <Summary contract={c} onEdit={() => onEdit(c)} />
          <Balance contract={c} />
          {c.contractType !== 'task_lumpsum' && <PauseBlock contract={c} />}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {c.contractType !== 'task_lumpsum' && <CalendarBlock contract={c} />}
            <div className="space-y-5">
              {c.contractType !== 'task_lumpsum' && <Crew contract={c} />}
              <Advances contract={c} />
            </div>
          </div>
          {c.settlements.some((s) => s.status !== 'cancelled') ? (
            <SettlementBlock contract={c} />
          ) : c.status === 'active' ? (
            <SettleBlock contract={c} onDone={onClose} />
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function Summary({ contract, onEdit }: { contract: ContractDetail; onEdit: () => void }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            {CONTRACT_TYPE_LABEL[contract.contractType]}
          </div>
          <div className="font-medium">
            {contract.leadPersonName}
            {contract.leadPersonPhone ? ` · ${contract.leadPersonPhone}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={contractStatusVariant(contract.status)}>{contract.status}</Badge>
          <StatementButton contract={contract} />
          {contract.status === 'active' && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil size={12} /> Edit
            </Button>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Row label="Term">
          {contractTerm(contract)}
          <DaysWorked contract={contract} />
        </Row>
        <Row label={contract.contractType === 'task_lumpsum' ? 'Agreed amount' : 'Rate'}>
          {contract.contractType === 'task_lumpsum'
            ? formatINR(Number(contract.fixedAmount ?? 0))
            : `${formatINR(contract.members.reduce((s, m) => s + Number(m.dailyRate), 0))}/day`}
        </Row>
        {contract.notes?.trim() ? <Row label="Notes">{contract.notes}</Row> : null}
      </dl>
    </div>
  );
}

/**
 * The whole contract as a PDF — days worked and what came off them, pauses,
 * leave, advances, settlement and payments. Rendered server-side so the crew
 * lead is handed the same document the office is looking at.
 */
function StatementButton({ contract }: { contract: ContractDetail }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await sharePdf({
            path: `/hr/contracts/${contract.id}/statement`,
            params: {},
            filename: `${contract.contractNumber}-statement.pdf`,
            title: `${contract.name} — statement`,
          });
        } catch (e: any) {
          toast(e?.message ?? 'Could not build the statement', 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download size={12} /> {busy ? 'Preparing…' : 'Statement'}
    </Button>
  );
}

/**
 * Days actually worked, sitting under the term because that is the line it
 * qualifies: the term says how long the job has run, this says how much of
 * it was worked. What was taken out to get there lives on the balance
 * below, where the money it drives is.
 *
 * Nothing to show on a task lump sum — it is priced for the job, not the
 * days.
 */
function DaysWorked({ contract }: { contract: ContractDetail }) {
  if (contract.contractType === 'task_lumpsum') return null;
  const crew = contract.members.length > 1;
  return (
    <div className="text-xs font-normal text-muted-foreground">
      {formatDays(contract.balance.daysWorked)} {crew ? 'crew-days' : 'days'} worked
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** The running position — the number people actually ask about. */
function Balance({ contract }: { contract: ContractDetail }) {
  const b = contract.balance;
  // A lump sum is priced for the job, so days are not what it is made of.
  const showDays = contract.contractType !== 'task_lumpsum';
  const crew = contract.members.length > 1;
  return (
    <div className="rounded-lg border border-border bg-primary/5 p-4">
      <div
        className={
          'grid divide-x divide-border text-center ' +
          (showDays ? 'grid-cols-4' : 'grid-cols-3')
        }
      >
        {showDays && (
          <Cell
            label={crew ? 'Crew-days' : 'Days worked'}
            value={formatDays(b.daysWorked)}
          />
        )}
        <Cell label="Earned" value={formatINR(b.earned)} />
        <Cell label="Advances" value={b.advancesPaid > 0 ? `− ${formatINR(b.advancesPaid)}` : '—'} />
        <Cell label="Outstanding" value={formatINR(b.netPayable)} strong />
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {b.isOpenEnded
          ? `Counting to ${fmtDate(b.throughDate)} · ongoing`
          : `Up to ${fmtDate(b.throughDate)}`}
        {showDays && excludedNote(b) ? ` · ${excludedNote(b)} excluded` : ''}
      </p>
    </div>
  );
}

/** "18" or "18.5" — never "18.0", which reads like a precision nobody has. */
export const formatDays = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

/**
 * Says why the day count is short of the calendar, which is the immediate
 * follow-up question whenever it is.
 */
function excludedNote(b: ContractBalance): string {
  const parts: string[] = [];
  if (b.leaveDays > 0) parts.push(`${b.leaveDays} leave`);
  if (b.halfDays > 0) parts.push(`${b.halfDays} half`);
  if (b.pausedDays > 0) parts.push(`${b.pausedDays} paused`);
  return parts.join(', ');
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="px-2">
      <div className={strong ? 'text-lg font-bold text-primary' : 'font-semibold'}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function CalendarBlock({ contract }: { contract: ContractDetail }) {
  const { toast } = useToast();
  const mark = useMarkDays();
  const [range, setRange] = useState<{
    from: string; to: string; memberIds: string[] | null; current: DayState;
  } | null>(null);

  async function apply(status: 'worked' | 'leave' | 'half_day') {
    if (!range) return;
    try {
      await mark.mutateAsync({
        contractId: contract.id,
        fromDate: range.from,
        toDate: range.to,
        status,
        memberIds: range.memberIds,
      });
      setRange(null);
    } catch (e: any) {
      toast(e?.message ?? 'Could not mark those days', 'error');
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">Working days</h3>
      <ContractCalendar
        contract={contract}
        onMark={(from, to, memberIds, current) => setRange({ from, to, memberIds, current })}
      />
      {range && (
        <div className="mt-3 rounded-md border border-dashed border-border p-3">
          <div className="mb-2 text-sm">
            <span className="font-medium">{fmtDate(range.from)}</span>
            <span className="text-muted-foreground">
              {' '}— currently {range.current === 'half_day' ? 'half day' : range.current}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={mark.isPending}
              onClick={() => apply('worked')}>Worked</Button>
            <Button size="sm" variant="outline" disabled={mark.isPending}
              onClick={() => apply('leave')}>Leave</Button>
            <Button size="sm" variant="outline" disabled={mark.isPending}
              onClick={() => apply('half_day')}>Half day</Button>
            <Button size="sm" variant="ghost" onClick={() => setRange(null)}>Cancel</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Applies to {range.memberIds && range.memberIds.length > 1
              ? `all ${range.memberIds.length} crew`
              : 'this person'}.
          </p>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Last counted day: {fmtDate(lastAccrualDay(contract))}
      </p>
    </div>
  );
}

function Crew({ contract }: { contract: ContractDetail }) {
  const isSolo = contract.contractType === 'solo_daily';
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">{isSolo ? 'Worker' : 'Crew'}</h3>
      <div className="divide-y divide-border">
        {contract.members.map((m) => (
          <div key={m.id} className="flex items-center justify-between py-2 text-sm">
            <div>
              <div className={m.leftOn ? 'text-muted-foreground' : 'font-medium'}>{m.name}</div>
              <div className="text-xs text-muted-foreground">
                {[m.role, m.leftOn ? `left ${fmtDate(m.leftOn)}` : null]
                  .filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div className="font-medium">{formatINR(Number(m.dailyRate))}/day</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettleBlock({ contract, onDone }: { contract: ContractDetail; onDone: () => void }) {
  const { toast } = useToast();
  const [throughDate, setThroughDate] = useState(contract.balance.throughDate);
  const { data, isLoading } = useSettlementPreview(contract.id, throughDate);
  const settle = useSettleContract();
  const [deductions, setDeductions] = useState('');
  const [notes, setNotes] = useState('');

  const p = data?.data;
  if (isLoading || !p) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Loading settlement…</div>;
  }

  const ded = Number(deductions) || 0;
  const net = p.netPayable - ded;
  const blocked = p.earned <= 0 || net < 0;

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-semibold">Settle contract</h3>

      {p.warnings.map((w) => (
        <Warning key={w} text={w} severe={w.includes('exceed earnings')} />
      ))}
      {net < 0 && p.netPayable >= 0 && (
        <Warning text="The deduction you entered pushes this below zero." severe />
      )}

      {p.lines.length > 1 && (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Who</Th>
              <Th align="right">Days</Th>
              <Th align="right">Earned</Th>
              <Th align="right">Advance</Th>
              <Th align="right">Net</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.lines.map((l, i) => (
              <TableRow key={l.memberId ?? `lead-${i}`}>
                <TableCell>
                  <div className="font-medium">{l.memberName}</div>
                  {l.memberRole && (
                    <div className="text-xs text-muted-foreground">{l.memberRole}</div>
                  )}
                </TableCell>
                <TableCell align="right">
                  {l.dailyRate ? `${l.daysWorked} × ${formatINR(l.dailyRate)}` : '—'}
                </TableCell>
                <TableCell align="right">{formatINR(l.earned)}</TableCell>
                <TableCell align="right" className="text-muted-foreground">
                  {l.advancesRecovered > 0 ? `− ${formatINR(l.advancesRecovered)}` : '—'}
                </TableCell>
                <TableCell align="right"
                  className={l.netPayable < 0 ? 'font-medium text-destructive' : 'font-medium'}>
                  {formatINR(l.netPayable)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          label={p.isOpenEnded ? 'Close the contract on' : 'Settle up to'}
          type="date"
          value={throughDate}
          onChange={(e) => setThroughDate(e.target.value)}
        />
        <Input label="Other deductions (₹)" type="number" min="0" value={deductions}
          onChange={(e) => setDeductions(e.target.value)} placeholder="Optional" />
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional" />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <div>
          <div className="text-xs text-muted-foreground">Net payable</div>
          <div className="text-lg font-semibold">{formatINR(net < 0 ? 0 : net)}</div>
        </div>
        <Button
          disabled={blocked || settle.isPending}
          onClick={async () => {
            try {
              await settle.mutateAsync({
                contractId: contract.id,
                throughDate,
                otherDeductions: ded,
                notes: notes.trim() || null,
              });
              toast('Contract settled', 'success');
              onDone();
            } catch (e: any) {
              toast(e?.message ?? 'Could not settle', 'error');
            }
          }}
        >
          {settle.isPending ? 'Settling…' : blocked ? 'Cannot settle' : `Settle ${formatINR(net)}`}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Settling books the wage to expenses, clears the advances and closes the
        contract. Record the payout here afterwards, in one go or in instalments.
      </p>
    </div>
  );
}

function Warning({ text, severe }: { text: string; severe?: boolean }) {
  return (
    <div
      className={
        'mb-2 flex items-start gap-2 rounded-md px-3 py-2 text-xs ' +
        (severe
          ? 'bg-destructive/10 text-destructive'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400')
      }
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

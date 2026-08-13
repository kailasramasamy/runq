import { useState, useEffect } from 'react';
import { Play, CheckCircle, Lock, Eye, Download, FileText, Building, Banknote, Landmark, HeartPulse, Coins, Wallet } from 'lucide-react';
import { api } from '@/lib/api-client';
import {
  PageHeader, Button, Card, CardHeader, CardContent, Badge, useToast, Modal, Input, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { StatTile, EmptyState, StatusPipeline, ListToolbar } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';

import { downloadCSV } from '@/lib/csv-export';
import {
  usePayrollRun, usePayslips, useProcessPayrollRun, useApprovePayrollRun, useClosePayrollRun,
  usePfChallan, useEsiChallan, usePtChallan,
  useEmployeePaymentsForRun, useRecordSalaryPayment,
  useStatutoryChallansForRun, useRecordStatutoryDeposit,
  type PayrollRunStatus, type Payslip,
} from '@/hooks/queries/use-hr-payroll';
import { CheckCircle2 } from 'lucide-react';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_VARIANT: Record<PayrollRunStatus, any> = {
  draft: 'default', processed: 'info', approved: 'success', closed: 'outline',
};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Props { runId: string }

export function PayrollRunDetailPage({ runId }: Props) {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data: runData, isLoading } = usePayrollRun(runId);
  const { data: psData } = usePayslips(runId);
  const process = useProcessPayrollRun();
  const approve = useApprovePayrollRun();
  const close = useClosePayrollRun();
  const [viewPayslip, setViewPayslip] = useState<Payslip | null>(null);
  const [showPfChallan, setShowPfChallan] = useState(false);
  const [showEsiChallan, setShowEsiChallan] = useState(false);
  const [showPtChallan, setShowPtChallan] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [search, setSearch] = useState('');
  const { data: paymentsData } = useEmployeePaymentsForRun(runId);

  if (isLoading) return <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>;
  const run = runData?.data;
  if (!run) return <div className="p-6 text-sm" style={{ color: 'var(--text-3)' }}>Run not found.</div>;

  const slips = psData?.data ?? [];
  const q = search.trim().toLowerCase();
  const filteredSlips = q
    ? slips.filter((s) =>
        s.employeeName.toLowerCase().includes(q) ||
        s.employeeCode.toLowerCase().includes(q))
    : slips;
  const period = `${MONTHS[run.month - 1]} ${run.year}`;
  const locked = run.status === 'approved' || run.status === 'closed';
  const paidPayment = paymentsData?.data.find((p) => p.status === 'paid');
  // Net pay can only be settled after approval — and only once per run.
  const canRecordPayment = !readOnly && locked && !paidPayment;

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[
          { label: 'HR', href: '/hr' },
          { label: 'Payroll runs', href: '/hr/payroll-runs' },
          { label: period },
        ]}
        title={`Payroll: ${period}`}
        description={run.notes ?? 'Pay run details'}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
            {!readOnly && (run.status === 'draft' || run.status === 'processed') && (
              <Button size="sm" onClick={() => process.mutate(runId, {
                onSuccess: () => toast('Run processed', 'success'),
                onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
              })} disabled={process.isPending}>
                <Play size={13} /> {process.isPending ? 'Processing…' : run.status === 'processed' ? 'Re-process' : 'Process'}
              </Button>
            )}
            {!readOnly && run.status === 'processed' && (
              <Button size="sm" variant="outline" onClick={() => approve.mutate(runId, {
                onSuccess: () => toast('Approved', 'success'),
                onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
              })}>
                <CheckCircle size={13} /> Approve
              </Button>
            )}
            {canRecordPayment && (
              <Button size="sm" onClick={() => setShowRecordPayment(true)}>
                <Wallet size={13} /> Record salary payment
              </Button>
            )}
            {paidPayment && (
              <Badge variant="success" title={`UTR ${paidPayment.reference ?? '—'}`}>
                Paid {paidPayment.paymentDate}
              </Badge>
            )}
            {!readOnly && run.status === 'approved' && (
              <Button size="sm" variant="outline" onClick={() => close.mutate(runId, {
                onSuccess: () => toast('Closed', 'success'),
                onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
              })}>
                <Lock size={13} /> Close
              </Button>
            )}
            {slips.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => downloadCSV(
                  `payslips_${run.year}_${run.month}.csv`,
                  ['Code', 'Name', 'Working', 'Paid', 'LOP', 'Gross', 'Deductions', 'Net'],
                  slips.map((s) => [s.employeeCode, s.employeeName, s.workingDays, s.paidDays, s.lopDays, s.gross, s.totalDeductions, s.netPay]),
                )}>
                  <Download size={13} /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowPfChallan(true)}>
                  <Landmark size={13} /> PF Challan
                </Button>
                <Button variant="outline" size="sm" onClick={() => api.download(
                  `/hr/payroll-runs/${runId}/exports/pf-ecr`,
                  `pf-ecr-${run.year}-${String(run.month).padStart(2, '0')}.txt`,
                )}>
                  <FileText size={13} /> PF ECR
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowEsiChallan(true)}>
                  <HeartPulse size={13} /> ESI Challan
                </Button>
                <Button variant="outline" size="sm" onClick={() => api.download(
                  `/hr/payroll-runs/${runId}/exports/esi`,
                  `esi-mc-${run.year}-${String(run.month).padStart(2, '0')}.csv`,
                )}>
                  <Building size={13} /> ESI
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowPtChallan(true)}>
                  <Coins size={13} /> PT Challan
                </Button>
                <Button variant="outline" size="sm" onClick={() => api.download(
                  `/hr/payroll-runs/${runId}/exports/neft`,
                  `neft-${run.year}-${String(run.month).padStart(2, '0')}.csv`,
                )}>
                  <Banknote size={13} /> NEFT
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Payroll lifecycle stepper */}
      <div
        className="mb-5 rounded-xl border px-6 py-4"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div
          className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-3)' }}
        >
          Payroll lifecycle
        </div>
        <StatusPipeline
          steps={[
            { key: 'draft', label: 'Draft' },
            { key: 'processed', label: 'Processed' },
            { key: 'approved', label: 'Approved' },
            { key: 'closed', label: 'Closed' },
          ]}
          current={run.status}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Employees" value={run.totalEmployees} sub={locked ? 'Locked' : 'Live'} />
        <StatTile label="Gross" value={formatINR(Number(run.totalGross))} />
        <StatTile label="Deductions" value={formatINR(Number(run.totalDeductions))} accentColor="#dc2626" tone="neg" />
        <StatTile label="Net pay" value={formatINR(Number(run.totalNet))} accentColor="#16a34a" />
      </div>

      {/* Processing skips anyone without a salary assignment, so a run can
          report a tidy total while covering a fraction of the workforce.
          Say so before it gets approved and posted to the GL. */}
      {(run.unpayableEmployees?.length ?? 0) > 0 && (
        <div
          className="mb-5 rounded-md px-3.5 py-3 text-[13px]"
          style={{ background: 'var(--warning-bg, #FEF3C7)', color: 'var(--warning-fg, #92400E)' }}
        >
          <div className="font-medium">
            {run.unpayableEmployees!.length} active employee
            {run.unpayableEmployees!.length === 1 ? '' : 's'} not included — no salary assigned
          </div>
          <div className="mt-1 text-[12px]">
            {run.unpayableEmployees!.map((e) =>
              `${e.employeeCode} ${e.firstName}${e.lastName ? ' ' + e.lastName : ''}`).join(', ')}
          </div>
          <div className="mt-1.5 text-[12px]">
            Assign a salary, then re-process this run to include them.
          </div>
        </div>
      )}

      {slips.length > 0 && (
        <ListToolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search by employee name or code…"
          count={filteredSlips.length}
          noun="payslip"
        />
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Employee</Th>
            <Th align="right">Working / Paid / LOP</Th>
            <Th align="right">Gross</Th>
            <Th align="right">PF / ESI</Th>
            <Th align="right">PT / TDS</Th>
            <Th align="right">Net pay</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {filteredSlips.length === 0 ? (
            <tr><td colSpan={7}>
              <EmptyState
                icon={<Play size={18} />}
                title={slips.length > 0 ? 'No payslips match' : 'No payslips yet'}
                description={slips.length > 0
                  ? 'Try a different search term.'
                  : run.status === 'draft' ? 'Click Process to generate payslips for all active employees.' : 'No data.'}
              />
            </td></tr>
          ) : filteredSlips.map((s) => (
            <TableRow key={s.id} onClick={() => setViewPayslip(s)}>
              <TableCell>
                <div className="min-w-0">
                  <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{s.employeeName}</div>
                  <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{s.employeeCode}</div>
                </div>
              </TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>
                {Number(s.workingDays)} / {Number(s.paidDays)} / {Number(s.lopDays)}
              </TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(Number(s.gross))}</TableCell>
              <TableCell align="right" className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{Number(s.pfEmployee)} / {Number(s.esiEmployee)}</TableCell>
              <TableCell align="right" className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{Number(s.pt)} / {Number(s.tds)}</TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(Number(s.netPay))}</TableCell>
              <TableCell align="right">
                <Eye size={14} style={{ color: 'var(--text-3)' }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {viewPayslip && (
        <PayslipModal payslip={viewPayslip} period={period} runId={runId} onClose={() => setViewPayslip(null)} />
      )}
      {showPfChallan && <PfChallanModal runId={runId} period={period} onClose={() => setShowPfChallan(false)} />}
      {showEsiChallan && <EsiChallanModal runId={runId} period={period} onClose={() => setShowEsiChallan(false)} />}
      {showPtChallan && <PtChallanModal runId={runId} period={period} onClose={() => setShowPtChallan(false)} />}
      {showRecordPayment && (
        <RecordSalaryPaymentModal
          runId={runId}
          period={period}
          netTotal={Number(run.totalNet)}
          onClose={() => setShowRecordPayment(false)}
        />
      )}
    </div>
  );
}

function RecordSalaryPaymentModal({
  runId, period, netTotal, onClose,
}: { runId: string; period: string; netTotal: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data: banksData } = useBankAccounts();
  const record = useRecordSalaryPayment();
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const bankOptions = (banksData?.data ?? []).map((b: { id: string; name: string; bankName: string }) => ({
    value: b.id,
    label: `${b.name} · ${b.bankName}`,
  }));

  function submit() {
    record.mutate(
      { payrollRunId: runId, paymentDate, bankAccountId, reference: reference || null, notes: notes || null },
      {
        onSuccess: () => { toast('Salary payment recorded', 'success'); onClose(); },
        onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={`Record salary payment — ${period}`} size="md">
      <div className="space-y-4">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          Settles <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(netTotal)}</span>{' '}
          of net pay against the bank: posts <span className="num">Dr 2110 Salary Payable / Cr bank</span> and makes the
          transaction reconcilable on the banking screen.
        </p>

        <Combobox
          label="Bank account"
          required
          options={bankOptions}
          value={bankAccountId}
          onChange={setBankAccountId}
          placeholder="Pick the bank the salaries went out of…"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Payment date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
          <Input
            label="Reference (UTR / batch)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="NEFT UTR or batch ID"
            maxLength={100}
          />
        </div>

        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
        />

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={record.isPending} disabled={!bankAccountId || !paymentDate} onClick={submit}>
            <CheckCircle size={13} /> Record payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// GST state codes → names, limited to states with a Professional Tax levy.
const PT_STATE_NAMES: Record<string, string> = {
  '27': 'Maharashtra',
  '29': 'Karnataka',
};

function PtChallanModal({ runId, period, onClose }: { runId: string; period: string; onClose: () => void }) {
  const { data, isLoading } = usePtChallan(runId);
  const { data: existingData } = useStatutoryChallansForRun(runId, 'pt');
  const [depositFor, setDepositFor] = useState<{ stateCode: string; amount: number; label: string } | null>(null);

  const d = data?.data;
  const challans = d?.challans ?? [];
  const grandTotal = challans.reduce((s, c) => s + c.totalPt, 0);
  // Lookup deposited PT challan for a given state — drives the badge/button.
  const depositedFor = (stateCode: string) =>
    existingData?.data.find((c) => c.stateCode === stateCode && c.status === 'deposited');

  return (
    <Modal open onClose={onClose} title={`PT Challan — ${period}`} size="lg">
      {isLoading ? (
        <p style={{ color: 'var(--text-3)' }}>Loading…</p>
      ) : !d ? null : (
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
            Professional Tax is a state levy — pay each state's total on its PT portal by the
            state due date.{' '}
            {d.ptRegistrationNumber
              ? `Enrolment ${d.ptRegistrationNumber}. `
              : 'Set your PT registration number in Company Settings. '}
          </p>
          {challans.length === 0 ? (
            <EmptyState
              icon={<Coins size={18} />}
              title="No Professional Tax this run"
              description="No employee crossed the PT threshold, or the establishment's state doesn't levy PT. Set the company state in Company Settings."
            />
          ) : (
            <>
              <Card>
                <CardContent>
                  <table className="w-full text-[13px]">
                    <tbody>
                      {challans.map((c) => {
                        const stateLabel = PT_STATE_NAMES[c.stateCode] ?? `State ${c.stateCode}`;
                        const deposited = depositedFor(c.stateCode);
                        return (
                          <tr key={c.stateCode} className="border-b last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
                            <td className="py-2">
                              <div style={{ color: 'var(--text-1)' }}>{stateLabel}</div>
                              <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{c.totalEmployees} employees</div>
                            </td>
                            <td className="num py-2 text-right" style={{ color: 'var(--text-1)' }}>{formatINR(c.totalPt)}</td>
                            <td className="py-2 pl-2 text-right">
                              {deposited ? (
                                <Badge variant="success" title={deposited.referenceNumber ?? undefined}>
                                  Deposited {deposited.depositDate}
                                </Badge>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => setDepositFor({
                                  stateCode: c.stateCode, amount: c.totalPt, label: `PT — ${stateLabel}`,
                                })}>
                                  Record deposit
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              <div className="flex items-center justify-between rounded-md p-3" style={{ background: 'var(--accent-soft)' }}>
                <span className="font-medium" style={{ color: 'var(--accent-text)' }}>Total Professional Tax</span>
                <span className="num text-[15px] font-semibold" style={{ color: 'var(--accent-text)' }}>{formatINR(grandTotal)}</span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={challans.length === 0} onClick={() => api.download(
              `/hr/payroll-runs/${runId}/exports/pt`,
              `pt-return-${d.run.year}-${String(d.run.month).padStart(2, '0')}.csv`,
            )}>
              <Download size={13} /> PT return CSV
            </Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
      {depositFor && (
        <RecordStatutoryDepositModal
          kind="pt"
          runId={runId}
          stateCode={depositFor.stateCode}
          amount={depositFor.amount}
          label={depositFor.label}
          period={period}
          onClose={() => setDepositFor(null)}
        />
      )}
    </Modal>
  );
}

function PfChallanModal({ runId, period, onClose }: { runId: string; period: string; onClose: () => void }) {
  const { data, isLoading } = usePfChallan(runId);
  const { data: existing } = useStatutoryChallansForRun(runId, 'pf');
  const [depositOpen, setDepositOpen] = useState(false);
  const c = data?.data;
  const deposited = existing?.data.find((x) => x.status === 'deposited');

  const row = (label: string, sub: string, amount: number, bold = false) => (
    <tr className="border-b last:border-0" style={{ borderColor: 'var(--border-soft)' }}>
      <td className="py-2">
        <div className={bold ? 'font-medium' : ''} style={{ color: 'var(--text-1)' }}>{label}</div>
        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{sub}</div>
      </td>
      <td className="num py-2 text-right" style={{ color: 'var(--text-1)', fontWeight: bold ? 600 : 400 }}>
        {formatINR(amount)}
      </td>
    </tr>
  );

  return (
    <Modal open onClose={onClose} title={`PF Challan — ${period}`} size="lg">
      {isLoading ? (
        <p style={{ color: 'var(--text-3)' }}>Loading…</p>
      ) : !c ? null : (
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
            Reconcile these account-head totals against the TRRN challan the EPFO portal
            generates after you upload the ECR file.{' '}
            {c.pfEstablishmentCode
              ? `Establishment ${c.pfEstablishmentCode}. `
              : 'Set your PF establishment code in Company Settings. '}
            {c.totalEmployees} contributing employees · PF wages {formatINR(c.totalPfWages)}.
          </p>
          <Card>
            <CardContent>
              <table className="w-full text-[13px]">
                <tbody>
                  {row('A/c 1 — EPF', 'Employee 12% + employer EPF share (3.67%)', c.account1Epf)}
                  {row('A/c 2 — Admin charges', '0.5% of PF wages, min ₹500', c.account2Admin)}
                  {row('A/c 10 — EPS (Pension)', 'Employer 8.33%, capped at ₹1,250/head', c.account10Eps)}
                  {row('A/c 21 — EDLI', 'Employer 0.5% group insurance', c.account21Edli)}
                  {row('A/c 22 — EDLI Admin', 'Nil since 2015', c.account22EdliAdmin)}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-md p-2.5" style={{ background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--text-3)' }}>Employee share (recovered)</div>
              <div className="num text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>{formatINR(c.employeeShare)}</div>
            </div>
            <div className="rounded-md p-2.5" style={{ background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--text-3)' }}>Employer share (cost)</div>
              <div className="num text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>{formatINR(c.employerShare)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md p-3" style={{ background: 'var(--accent-soft)' }}>
            <span className="font-medium" style={{ color: 'var(--accent-text)' }}>Total payable to EPFO</span>
            <span className="num text-[15px] font-semibold" style={{ color: 'var(--accent-text)' }}>{formatINR(c.grandTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            {deposited ? (
              <Badge variant="success" title={deposited.referenceNumber ?? undefined}>
                Deposited {deposited.depositDate}{deposited.referenceNumber ? ` · TRRN ${deposited.referenceNumber}` : ''}
              </Badge>
            ) : (
              <Button size="sm" onClick={() => setDepositOpen(true)}>
                <CheckCircle2 size={13} /> Record deposit
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
      {depositOpen && c && (
        <RecordStatutoryDepositModal
          kind="pf"
          runId={runId}
          amount={c.grandTotal}
          label="PF deposit"
          period={period}
          referenceLabel="TRRN"
          onClose={() => setDepositOpen(false)}
        />
      )}
    </Modal>
  );
}

function EsiChallanModal({ runId, period, onClose }: { runId: string; period: string; onClose: () => void }) {
  const { data, isLoading } = useEsiChallan(runId);
  const { data: existing } = useStatutoryChallansForRun(runId, 'esi');
  const [depositOpen, setDepositOpen] = useState(false);
  const c = data?.data;
  const deposited = existing?.data.find((x) => x.status === 'deposited');

  return (
    <Modal open onClose={onClose} title={`ESI Challan — ${period}`} size="lg">
      {isLoading ? (
        <p style={{ color: 'var(--text-3)' }}>Loading…</p>
      ) : !c ? null : (
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
            Pay this against the monthly challan on the ESIC portal.{' '}
            {c.esiRegistrationNumber
              ? `Employer code ${c.esiRegistrationNumber}. `
              : 'Set your ESI registration number in Company Settings. '}
            {c.totalIps} insured persons · ESI wages {formatINR(c.totalEsiWages)}.
          </p>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-md p-2.5" style={{ background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--text-3)' }}>Employee share 0.75% (recovered)</div>
              <div className="num text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>{formatINR(c.employeeShare)}</div>
            </div>
            <div className="rounded-md p-2.5" style={{ background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--text-3)' }}>Employer share 3.25% (cost)</div>
              <div className="num text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>{formatINR(c.employerShare)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md p-3" style={{ background: 'var(--accent-soft)' }}>
            <span className="font-medium" style={{ color: 'var(--accent-text)' }}>Total payable to ESIC</span>
            <span className="num text-[15px] font-semibold" style={{ color: 'var(--accent-text)' }}>{formatINR(c.grandTotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => api.download(
              `/hr/payroll-runs/${runId}/exports/esi`,
              `esi-mc-${c.run.year}-${String(c.run.month).padStart(2, '0')}.csv`,
            )}>
              <Download size={13} /> ESI return CSV
            </Button>
            {deposited ? (
              <Badge variant="success" title={deposited.referenceNumber ?? undefined}>
                Deposited {deposited.depositDate}
              </Badge>
            ) : (
              <Button size="sm" onClick={() => setDepositOpen(true)}>
                <CheckCircle2 size={13} /> Record deposit
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
      {depositOpen && c && (
        <RecordStatutoryDepositModal
          kind="esi"
          runId={runId}
          amount={c.grandTotal}
          label="ESI deposit"
          period={period}
          referenceLabel="Challan number"
          onClose={() => setDepositOpen(false)}
        />
      )}
    </Modal>
  );
}

/**
 * Generic record-deposit form for PF / ESI / PT. Posts to /hr/statutory-challans/deposit
 * which atomically creates the challan and posts the settlement JE
 * (Dr <liability> / Cr bank). For PT, stateCode pins the per-state challan.
 */
function RecordStatutoryDepositModal({
  kind, runId, stateCode, amount, label, period, referenceLabel, onClose,
}: {
  kind: 'pf' | 'esi' | 'pt';
  runId: string;
  stateCode?: string;
  amount: number;
  label: string;
  period: string;
  referenceLabel?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: banksData } = useBankAccounts();
  const record = useRecordStatutoryDeposit();
  const [bankAccountId, setBankAccountId] = useState('');
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [lateFeeAmount, setLateFeeAmount] = useState('');

  const interest = Number(interestAmount) || 0;
  const lateFee = Number(lateFeeAmount) || 0;
  const total = amount + interest + lateFee;
  const bankOptions = (banksData?.data ?? []).map((b: { id: string; name: string; bankName: string }) => ({
    value: b.id, label: `${b.name} · ${b.bankName}`,
  }));

  function submit() {
    record.mutate(
      {
        kind, payrollRunId: runId, stateCode: stateCode ?? null,
        bankAccountId, depositDate,
        referenceNumber: referenceNumber || null,
        interestAmount: interest, lateFeeAmount: lateFee,
      },
      {
        onSuccess: () => { toast('Deposit recorded — JE posted', 'success'); onClose(); },
        onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={`${label} — ${period}`} size="md">
      <div className="space-y-4">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          Liability <span className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(amount)}</span>.
          Recording posts the settlement JE (Dr liability / Cr bank) so the payable clears
          and the deposit is reconcilable against the bank statement.
        </p>

        <Combobox
          label="Bank account"
          required
          options={bankOptions}
          value={bankAccountId}
          onChange={setBankAccountId}
          placeholder="Bank the deposit went out of…"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Deposit date" type="date" value={depositDate}
            onChange={(e) => setDepositDate(e.target.value)} />
          <Input
            label={referenceLabel ?? 'Reference / challan no.'}
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            maxLength={30}
          />
          <Input label="Interest (₹)" value={interestAmount}
            onChange={(e) => setInterestAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0" />
          <Input label="Late fee (₹)" value={lateFeeAmount}
            onChange={(e) => setLateFeeAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0" />
        </div>

        <div className="flex items-center justify-between rounded-md p-3" style={{ background: 'var(--accent-soft)' }}>
          <span className="font-medium" style={{ color: 'var(--accent-text)' }}>Total deposited</span>
          <span className="num text-[15px] font-semibold" style={{ color: 'var(--accent-text)' }}>{formatINR(total)}</span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={record.isPending} disabled={!bankAccountId || !depositDate} onClick={submit}>
            <CheckCircle2 size={13} /> Record deposit
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PayslipModal({ payslip: s, period, runId, onClose }: {
  payslip: Payslip; period: string; runId: string; onClose: () => void;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Preview the server-rendered document rather than a second React layout of
  // the same numbers: what's on screen is then identical to the PDF the
  // employee receives, and there's one template to maintain.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/hr/payroll-runs/${runId}/payslips/${s.id}/print`, {
      headers: api.authHeaders(),
    })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => { if (!cancelled) setHtml(t); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [runId, s.id]);

  // The PDF comes from that same template, so the download is the document of
  // record — not a browser print dialogue whose output varies by machine.
  async function handleDownload() {
    setDownloading(true);
    try {
      const safe = s.employeeName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      await api.download(
        `/hr/payroll-runs/${runId}/payslips/${s.id}/print?format=pdf`,
        `Payslip-${period.replace(' ', '-')}-${safe}.pdf`,
      );
    } catch (e: any) {
      toast(e?.message ?? 'Could not download the payslip', 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Payslip — ${s.employeeName} (${period})`} size="lg">
      <div className="mb-2 flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
          <Download size={13} /> {downloading ? 'Preparing…' : 'Download PDF'}
        </Button>
      </div>
      {loadError ? (
        <div className="rounded-md px-3 py-6 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
          Could not load the payslip preview. The PDF download still works.
        </div>
      ) : html === null ? (
        <div className="px-3 py-10 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
          Loading payslip…
        </div>
      ) : (
        // White-on-white regardless of app theme: it's a document, and it
        // should look on screen exactly as it will on paper.
        <iframe
          title="Payslip"
          srcDoc={html}
          className="w-full rounded-md border"
          style={{ height: '70vh', background: '#fff', borderColor: 'var(--border)' }}
        />
      )}
    </Modal>
  );
}


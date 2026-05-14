import { useState } from 'react';
import {
  Download, Receipt, FileCheck2, CheckCircle2, Trash2, AlertTriangle, Plus,
} from 'lucide-react';
import {
  PageHeader, Button, Select, Input, Modal, Badge, useToast,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { StatTile, EmptyState } from '@/components/ar/primitives';
import { formatINR } from '@/lib/utils';
import { api } from '@/lib/api-client';
import {
  useTdsReturns, useGenerateTdsReturn, useValidateTdsReturn,
  useFileTdsReturn, useDeleteTdsReturn,
  type TdsReturn, type TdsReturnStatus,
} from '@/hooks/queries/use-hr-payroll';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_VARIANT: Record<TdsReturnStatus, any> = {
  draft: 'default', validated: 'info', generated: 'primary', filed: 'success', error: 'danger',
};
const QUARTERS = [
  { value: '1', label: 'Q1 (Apr-Jun)' },
  { value: '2', label: 'Q2 (Jul-Sep)' },
  { value: '3', label: 'Q3 (Oct-Dec)' },
  { value: '4', label: 'Q4 (Jan-Mar)' },
];
const MONTHS = ['', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Indian FY label for the current date — Apr-Mar. e.g. May 2026 → '2026-27'. */
function currentFinancialYear(): string {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function returnTds(r: TdsReturn): number {
  return (r.data?.annexureI ?? []).reduce((s, row) => s + row.tdsDeducted, 0);
}

export function Form24QPage() {
  const readOnly = useIsReadOnly();
  const { data, isLoading } = useTdsReturns();
  const [showGenerate, setShowGenerate] = useState(false);
  const [detail, setDetail] = useState<TdsReturn | null>(null);

  const returns = data?.data ?? [];
  const filed = returns.filter((r) => r.status === 'filed').length;
  const totalTds = returns.reduce((s, r) => s + returnTds(r), 0);

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Form 24Q' }]}
        title="Form 24Q — Quarterly TDS Return"
        description="Generate the quarter's Annexure I/II from payslips + deposited challans, validate, download the worksheet for NSDL's RPU/FVU, then record the filing token."
        actions={
          !readOnly && (
            <Button size="sm" onClick={() => setShowGenerate(true)}>
              <Plus size={13} /> Generate return
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Returns" value={returns.length} />
        <StatTile label="Filed" value={filed} accentColor="#16a34a" />
        <StatTile label="Total TDS reported" value={formatINR(totalTds)} />
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Period</Th>
            <Th>Status</Th>
            <Th align="right">Deductees</Th>
            <Th align="right">TDS</Th>
            <Th>Token / Notes</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : returns.length === 0 ? (
            <tr><td colSpan={6}>
              <EmptyState
                icon={<Receipt size={18} />}
                title="No Form 24Q returns yet"
                description="Generate a quarter once its payroll runs are approved and TDS challans deposited."
              />
            </td></tr>
          ) : returns.map((r) => (
            <TableRow key={r.id} onClick={() => setDetail(r)}>
              <TableCell>
                <span className="num font-medium" style={{ color: 'var(--text-1)' }}>
                  FY {r.financialYear} · Q{r.quarter}
                </span>
              </TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>
                {r.data?.annexureI.length ?? 0}
              </TableCell>
              <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>
                {formatINR(returnTds(r))}
              </TableCell>
              <TableCell className="num text-[11px]" style={{ color: 'var(--text-3)' }}>
                {r.token ?? (r.status === 'error' ? `${r.errorDetails?.length ?? 0} issue(s)` : '—')}
              </TableCell>
              <TableCell align="right">
                <Receipt size={14} style={{ color: 'var(--text-3)' }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} />}
      {detail && <ReturnDetailModal ret={detail} readOnly={readOnly} onClose={() => setDetail(null)} />}
    </div>
  );
}

function GenerateModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const generate = useGenerateTdsReturn();
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [quarter, setQuarter] = useState(1);

  const startYear = new Date().getFullYear();
  const fyOptions = [startYear - 1, startYear, startYear + 1].map((y) => {
    const fy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    return { value: fy, label: `FY ${fy}` };
  });

  function submit() {
    generate.mutate(
      { financialYear, quarter },
      {
        onSuccess: () => { toast('Return generated', 'success'); onClose(); },
        onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Generate Form 24Q Return" size="md">
      <div className="space-y-4">
        <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          Snapshots Annexure I (deductee-wise detail) from the quarter's payslips and deposited
          challans. Q4 also builds Annexure II — the annual salary &amp; tax computation.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Financial Year"
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            options={fyOptions}
          />
          <Select
            label="Quarter"
            value={String(quarter)}
            onChange={(e) => setQuarter(Number(e.target.value))}
            options={QUARTERS}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={generate.isPending}>Generate</Button>
        </div>
      </div>
    </Modal>
  );
}

function ReturnDetailModal({ ret, readOnly, onClose }: { ret: TdsReturn; readOnly: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const validate = useValidateTdsReturn();
  const fileReturn = useFileTdsReturn();
  const del = useDeleteTdsReturn();
  const [token, setToken] = useState('');

  const annexureI = ret.data?.annexureI ?? [];
  const annexureII = ret.data?.annexureII ?? [];
  const canValidate = ret.status === 'draft' || ret.status === 'error';
  const canDownload = ret.status === 'validated' || ret.status === 'generated';
  const canFile = ret.status === 'generated';

  return (
    <Modal open onClose={onClose} title={`Form 24Q — FY ${ret.financialYear} · Q${ret.quarter}`} size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[ret.status]}>{ret.status}</Badge>
          {ret.token && <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>Token {ret.token}</span>}
          <div className="flex-1" />
          {!readOnly && canValidate && (
            <Button size="sm" variant="outline" loading={validate.isPending} onClick={() => validate.mutate(ret.id, {
              onSuccess: (r: any) => toast(
                r?.data?.status === 'error' ? 'Validation found issues' : 'Validated',
                r?.data?.status === 'error' ? 'error' : 'success',
              ),
              onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
            })}>
              <FileCheck2 size={13} /> Validate
            </Button>
          )}
          {canDownload && (
            <Button size="sm" variant="outline" onClick={() => api.download(
              `/hr/tds-returns/${ret.id}/export`,
              `form-24q-${ret.financialYear}-Q${ret.quarter}.csv`,
            ).catch((e: any) => toast(e?.message ?? 'Failed', 'error'))}>
              <Download size={13} /> Download worksheet
            </Button>
          )}
          {!readOnly && ret.status !== 'filed' && (
            <Button size="sm" variant="outline" onClick={() => del.mutate(ret.id, {
              onSuccess: () => { toast('Deleted', 'success'); onClose(); },
              onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
            })}>
              <Trash2 size={13} /> Delete
            </Button>
          )}
        </div>

        {ret.status === 'error' && ret.errorDetails && ret.errorDetails.length > 0 && (
          <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium" style={{ color: '#dc2626' }}>
              <AlertTriangle size={13} /> {ret.errorDetails.length} issue(s) — fix and re-validate
            </div>
            <ul className="space-y-0.5 text-[12px]" style={{ color: 'var(--text-2)' }}>
              {ret.errorDetails.map((e, i) => <li key={i}>• {e.message}</li>)}
            </ul>
          </div>
        )}

        {!readOnly && canFile && (
          <div className="flex items-end gap-2 rounded-md p-3" style={{ background: 'var(--surface-2)' }}>
            <div className="flex-1">
              <Input
                label="Provisional Receipt / Token Number"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="From the TRACES acknowledgement after upload"
                maxLength={50}
              />
            </div>
            <Button loading={fileReturn.isPending} disabled={!token} onClick={() => fileReturn.mutate(
              { id: ret.id, token },
              {
                onSuccess: () => { toast('Marked filed', 'success'); onClose(); },
                onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
              },
            )}>
              <CheckCircle2 size={13} /> Mark filed
            </Button>
          </div>
        )}

        {/* Annexure I */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
            Annexure I — Deductee-wise deduction detail
          </div>
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <tr>
                  <Th>Employee</Th><Th>PAN</Th><Th>Month</Th>
                  <Th align="right">Amount Paid</Th><Th align="right">TDS</Th><Th>Challan CIN</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {annexureI.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>No deductions this quarter.</td></tr>
                ) : annexureI.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell style={{ color: 'var(--text-2)' }}>
                      {r.employeeName} <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{r.employeeCode}</span>
                    </TableCell>
                    <TableCell className="num" style={{ color: r.pan ? 'var(--text-2)' : '#dc2626' }}>{r.pan ?? 'missing'}</TableCell>
                    <TableCell style={{ color: 'var(--text-2)' }}>{MONTHS[r.paymentMonth]}</TableCell>
                    <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(r.amountPaid)}</TableCell>
                    <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(r.tdsDeducted)}</TableCell>
                    <TableCell className="num text-[11px]" style={{ color: r.challanBsrCode ? 'var(--text-3)' : '#dc2626' }}>
                      {r.challanBsrCode ? `${r.challanBsrCode}-${r.challanSerialNo}` : 'no challan'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Annexure II — Q4 */}
        {annexureII.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Annexure II — Annual salary &amp; tax computation
            </div>
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Employee</Th><Th align="right">Gross</Th><Th align="right">Std. Deduction</Th>
                    <Th align="right">Taxable</Th><Th align="right">Tax + Cess</Th><Th align="right">TDS</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {annexureII.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell style={{ color: 'var(--text-2)' }}>
                        {r.employeeName} <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{r.employeeCode}</span>
                      </TableCell>
                      <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(r.grossSalary)}</TableCell>
                      <TableCell align="right" className="num" style={{ color: 'var(--text-3)' }}>{formatINR(r.standardDeduction)}</TableCell>
                      <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(r.taxableIncome)}</TableCell>
                      <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{formatINR(r.taxOnIncome)}</TableCell>
                      <TableCell align="right" className="num font-medium" style={{ color: 'var(--text-1)' }}>{formatINR(r.tdsDeducted)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

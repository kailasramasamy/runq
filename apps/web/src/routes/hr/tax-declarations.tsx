import { useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import {
  PageHeader, Badge, Button, Select, Input, Modal,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';
import { EmptyState } from '@/components/ar/primitives';
import {
  useTaxDeclarations, useReviewTaxDeclaration, type TaxDeclaration,
} from '@/hooks/queries/use-hr-phase-next';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'outline', submitted: 'warning', approved: 'success', rejected: 'danger',
};

function fmt(n: string | number) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function totalOf(d: TaxDeclaration) {
  return Number(d.section80c) + Number(d.section80d) + Number(d.section80g)
    + Number(d.section80ccd1b) + Number(d.hraTotal) + Number(d.ltaTotal)
    + Number(d.homeLoanInterest) + Number(d.otherDeductions);
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function TaxDeclarationsPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [status, setStatus] = useState('submitted');
  const [fy, setFy] = useState('');
  const [regime, setRegime] = useState('');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<TaxDeclaration | null>(null);
  const { data, isLoading } = useTaxDeclarations({ status: status || undefined });
  const review = useReviewTaxDeclaration();

  const allRows = data?.data ?? [];

  const fyOptions = useMemo(() => {
    const set = new Set(allRows.map((d) => d.financialYear));
    return Array.from(set).sort().reverse();
  }, [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((d) => {
      if (fy && d.financialYear !== fy) return false;
      if (regime && d.regime !== regime) return false;
      if (q) {
        const name = `${d.firstName ?? ''} ${d.lastName ?? ''}`.toLowerCase();
        const code = (d.employeeCode ?? '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, fy, regime, search]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Tax declarations' }]}
        title="Investment declarations (Form 12BB)"
        description="Employee tax investment declarations. Approve to apply to monthly TDS."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or employee code"
            className="pl-8"
          />
        </div>
        <div className="w-40">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[
            { value: '', label: 'All statuses' },
            { value: 'draft', label: 'Draft' },
            { value: 'submitted', label: 'Submitted' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ]} />
        </div>
        <div className="w-36">
          <Select value={fy} onChange={(e) => setFy(e.target.value)} options={[
            { value: '', label: 'All FYs' },
            ...fyOptions.map((y) => ({ value: y, label: `FY ${y}` })),
          ]} />
        </div>
        <div className="w-36">
          <Select value={regime} onChange={(e) => setRegime(e.target.value)} options={[
            { value: '', label: 'All regimes' },
            { value: 'new', label: 'New regime' },
            { value: 'old', label: 'Old regime' },
          ]} />
        </div>
        {(search || fy || regime || status !== 'submitted') && (
          <Button variant="outline" size="sm" onClick={() => {
            setSearch(''); setFy(''); setRegime(''); setStatus('submitted');
          }}>Reset</Button>
        )}
        <div className="ml-auto text-xs text-zinc-500">
          {rows.length} of {allRows.length}
        </div>
      </div>
      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title={allRows.length === 0 ? 'Nothing to review' : 'No matches'}
          description={allRows.length === 0
            ? undefined
            : 'No declarations match the current filters. Try clearing them.'}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th>FY</Th><Th>Employee</Th><Th>Regime</Th><Th>Total claims</Th>
              <Th>Submitted</Th><Th>Status</Th><Th></Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id} className="cursor-pointer" onClick={() => setViewing(d)}>
                <TableCell>{d.financialYear}</TableCell>
                <TableCell className="font-medium">
                  {[d.firstName, d.lastName].filter(Boolean).join(' ')}{' '}
                  <span className="text-xs text-slate-500">{d.employeeCode}</span>
                </TableCell>
                <TableCell><Badge variant="outline">{d.regime.toUpperCase()}</Badge></TableCell>
                <TableCell className="font-semibold">₹{fmt(totalOf(d))}</TableCell>
                <TableCell className="text-xs text-slate-500">{fmtDate(d.submittedAt)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge></TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setViewing(d)}>View</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DeclarationModal
        decl={viewing}
        onClose={() => setViewing(null)}
        readOnly={readOnly}
        busy={review.isPending}
        onReview={(approved, rejectionReason) => {
          if (!viewing) return;
          review.mutate({ id: viewing.id, approved, rejectionReason }, {
            onSuccess: () => {
              toast(approved ? 'Approved' : 'Rejected', 'success');
              setViewing(null);
            },
            onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
          });
        }}
      />
    </div>
  );
}

const FIELDS: Array<{ key: keyof TaxDeclaration; label: string; cap?: number }> = [
  { key: 'section80c', label: 'Section 80C — LIC, PPF, ELSS, principal', cap: 150000 },
  { key: 'section80d', label: 'Section 80D — Health insurance', cap: 100000 },
  { key: 'section80ccd1b', label: 'Section 80CCD(1B) — NPS additional', cap: 50000 },
  { key: 'section80g', label: 'Section 80G — Donations' },
  { key: 'hraTotal', label: 'HRA — Rent paid' },
  { key: 'ltaTotal', label: 'LTA — Travel allowance' },
  { key: 'homeLoanInterest', label: 'Home loan interest', cap: 200000 },
  { key: 'otherDeductions', label: 'Other deductions' },
];

function DeclarationModal({
  decl, onClose, readOnly, busy, onReview,
}: {
  decl: TaxDeclaration | null;
  onClose: () => void;
  readOnly: boolean;
  busy: boolean;
  onReview: (approved: boolean, rejectionReason?: string) => void;
}) {
  if (!decl) return null;
  const name = [decl.firstName, decl.lastName].filter(Boolean).join(' ');
  const total = totalOf(decl);
  return (
    <Modal
      open={!!decl}
      onClose={onClose}
      size="lg"
      title={`${name} — FY ${decl.financialYear}`}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Meta label="Employee" value={`${name}${decl.employeeCode ? ` (${decl.employeeCode})` : ''}`} />
          <Meta label="Financial year" value={decl.financialYear} />
          <Meta label="Regime" value={decl.regime.toUpperCase()} />
          <Meta label="Status">
            <Badge variant={STATUS_VARIANT[decl.status]}>{decl.status}</Badge>
          </Meta>
          <Meta label="Submitted" value={fmtDate(decl.submittedAt)} />
          <Meta label="Reviewed" value={fmtDate(decl.reviewedAt)} />
        </div>

        {decl.regime === 'new' ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Employee chose <strong>new regime</strong> — Chapter VI-A / HRA / LTA / home-loan
            deductions don't apply. Standard deduction of ₹75,000 is auto-applied to TDS.
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Cap</th>
                  <th className="px-4 py-2 text-right font-medium">Declared</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map((f) => {
                  const v = Number(decl[f.key] ?? 0);
                  const over = f.cap !== undefined && v > f.cap;
                  return (
                    <tr key={String(f.key)} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">{f.label}</td>
                      <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400">
                        {f.cap ? `₹${fmt(f.cap)}` : '—'}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${over ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        ₹{fmt(v)}{over && <span className="ml-1 text-xs">⚠</span>}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900/60">
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">Total declared</td>
                  <td></td>
                  <td className="px-4 py-2 text-right text-zinc-900 dark:text-zinc-100">₹{fmt(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {decl.status === 'rejected' && decl.rejectionReason && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            <div className="font-semibold">Rejection reason</div>
            <div className="mt-1">{decl.rejectionReason}</div>
          </div>
        )}

        {decl.notes && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Employee notes</div>
            <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
              {decl.notes}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!readOnly && decl.status === 'submitted' && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => {
                const reason = window.prompt('Rejection reason?') ?? undefined;
                if (reason === undefined) return;
                onReview(false, reason);
              }}>Reject</Button>
              <Button disabled={busy} onClick={() => onReview(true)}>Approve</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Meta({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{children ?? value}</div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/utils';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useToast } from '@/components/ui';
import { useIsReadOnly } from '@/providers/auth-provider';

type ClaimStatus = 'pending' | 'verified' | 'rejected' | 'cancelled';

interface ClaimInvoice {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate?: string;
  dueDate?: string;
  totalAmount?: number;
  balanceDue?: number;
  status?: string;
}

interface AdminClaim {
  id: string;
  customerId: string;
  customerName: string;
  claimedAmount: number;
  claimDate: string;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  status: ClaimStatus;
  verifiedAt: string | null;
  createdAt: string;
  invoices: ClaimInvoice[];
}

const STATUS_FILTERS: Array<{ value: ClaimStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function daysSince(iso: string): number {
  const d = new Date(iso);
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

export function PaymentClaimListPage() {
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | 'all'>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<AdminClaim | null>(null);

  async function load() {
    setLoading(true);
    try {
      const qs = statusFilter === 'all' ? '' : `?status=${statusFilter}`;
      const res = await api.get<{ data: AdminClaim[] }>(`/ar/payment-claims${qs}`);
      setClaims(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const counts = claims.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const totalPendingAmount = claims
    .filter((c) => c.status === 'pending')
    .reduce((s, c) => s + c.claimedAmount, 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>
            Payment Reports
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
            Customer-reported payments awaiting your bank-statement verification.
          </p>
        </div>
        {statusFilter === 'pending' && claims.length > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Pending total
            </p>
            <p className="text-lg font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
              {formatINR(totalPendingAmount)}
            </p>
          </div>
        )}
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            {f.label}
            {f.value !== 'all' && counts[f.value] !== undefined && (
              <span className="tabular-nums opacity-60">{counts[f.value]}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border p-12 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
          Loading…
        </div>
      ) : claims.length === 0 ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            No {statusFilter === 'all' ? '' : statusFilter} payment reports.
          </p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--border)' }}
        >
          <table className="w-full text-left text-sm">
            <thead style={{ background: 'var(--surface-2)' }}>
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Date</th>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Customer</th>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Method</th>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Reference</th>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Invoices</th>
                <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Age</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Amount</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Status / Action</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <ClaimRow
                  key={c.id}
                  claim={c}
                  expanded={expanded === c.id}
                  onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                  onVerify={() => setVerifying(c)}
                  onReload={load}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {verifying && (
        <VerifyClaimModal
          claim={verifying}
          onClose={() => setVerifying(null)}
          onSuccess={() => {
            setVerifying(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ClaimRow({
  claim,
  expanded,
  onToggle,
  onVerify,
  onReload,
}: {
  claim: AdminClaim;
  expanded: boolean;
  onToggle: () => void;
  onVerify: () => void;
  onReload: () => void;
}) {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const age = daysSince(claim.claimDate);

  async function reject() {
    const reason = prompt('Reason for rejecting (optional):');
    if (reason === null) return;
    setBusy(true);
    try {
      await api.post(`/ar/payment-claims/${claim.id}/reject`, { reason: reason.trim() || null });
      toast('Claim rejected.', 'success');
      onReload();
    } catch {
      toast('Failed to reject.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        style={{ borderColor: 'var(--border)' }}
      >
        <td className="px-4 py-3" style={{ color: 'var(--text-1)' }}>{formatDate(claim.claimDate)}</td>
        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{claim.customerName}</td>
        <td className="px-4 py-3 text-xs uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
          {claim.paymentMethod.replace(/_/g, ' ')}
        </td>
        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-2)' }}>
          {claim.referenceNumber || <span style={{ color: 'var(--text-3)' }}>—</span>}
        </td>
        <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{claim.invoices.length}</td>
        <td className="px-4 py-3 text-xs" style={{ color: age > 7 ? '#dc2626' : 'var(--text-2)' }}>
          {age} day{age !== 1 ? 's' : ''}
        </td>
        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
          {formatINR(claim.claimedAmount)}
        </td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          {claim.status === 'pending' ? (
            <div className="inline-flex items-center gap-1.5">
              <button
                onClick={onVerify}
                disabled={readOnly || busy}
                className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Verify
              </button>
              <button
                onClick={reject}
                disabled={readOnly || busy}
                className="rounded-md border px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50"
                style={{ borderColor: 'var(--border)' }}
              >
                Reject
              </button>
            </div>
          ) : (
            <StatusBadge status={claim.status} />
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--surface-2)' }}>
          <td colSpan={8} className="px-4 py-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-2)' }}>
                <span>
                  Reported on <strong>{formatDate(claim.claimDate)}</strong>
                </span>
                <span>·</span>
                <span>
                  Customer:{' '}
                  <Link
                    to="/ar/customers/$customerId"
                    params={{ customerId: claim.customerId }}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {claim.customerName}
                  </Link>
                </span>
                {claim.referenceNumber && (
                  <>
                    <span>·</span>
                    <span className="font-mono">Ref: {claim.referenceNumber}</span>
                  </>
                )}
              </div>

              <div>
                <p
                  className="mb-1 text-[10px] font-medium uppercase tracking-wide"
                  style={{ color: 'var(--text-3)' }}
                >
                  Applied to {claim.invoices.length} invoice{claim.invoices.length !== 1 ? 's' : ''}
                </p>
                <div
                  className="overflow-hidden rounded-md border"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                >
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                          Invoice #
                        </th>
                        <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                          Issued
                        </th>
                        <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                          Due
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                          Invoice Total
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                          Allocated
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                          Balance
                        </th>
                        <th className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {claim.invoices.map((a) => (
                        <tr key={a.invoiceId} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-3 py-2">
                            <Link
                              to="/ar/invoices/$invoiceId"
                              params={{ invoiceId: a.invoiceId }}
                              className="font-mono font-medium text-indigo-600 hover:underline"
                            >
                              {a.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>
                            {a.invoiceDate ? formatDate(a.invoiceDate) : '—'}
                          </td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>
                            {a.dueDate ? formatDate(a.dueDate) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--text-2)' }}>
                            {a.totalAmount !== undefined ? formatINR(a.totalAmount) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
                            {formatINR(a.amount)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: 'var(--text-2)' }}>
                            {a.balanceDue !== undefined ? formatINR(a.balanceDue) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                            {a.status || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {claim.notes && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                    Customer notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: 'var(--text-1)' }}>
                    {claim.notes}
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  const styles: Record<ClaimStatus, string> = {
    pending: 'bg-amber-50 text-amber-700',
    verified: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-700',
    cancelled: 'bg-zinc-100 text-zinc-600',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

function VerifyClaimModal({
  claim,
  onClose,
  onSuccess,
}: {
  claim: AdminClaim;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: bankData } = useBankAccounts();
  const banks = bankData?.data ?? [];
  const [bankAccountId, setBankAccountId] = useState('');
  const [receiptDate, setReceiptDate] = useState(claim.claimDate);
  const [referenceNumber, setReferenceNumber] = useState(claim.referenceNumber ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!bankAccountId && banks.length > 0) setBankAccountId(banks[0]!.id);
  }, [banks, bankAccountId]);

  async function submit() {
    if (!bankAccountId) {
      setError('Choose the bank account where the money was received.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/ar/payment-claims/${claim.id}/verify`, {
        bankAccountId,
        receiptDate,
        referenceNumber: referenceNumber.trim() || null,
      });
      toast('Claim verified — receipt created.', 'success');
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to verify.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
            Verify payment from {claim.customerName}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-2)' }}>
            {claim.invoices.length} invoice{claim.invoices.length !== 1 ? 's' : ''} · {formatINR(claim.claimedAmount)} · {claim.paymentMethod.replace(/_/g, ' ')}
            {claim.referenceNumber ? ` · Ref ${claim.referenceNumber}` : ''}
          </p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Verifying creates a receipt against the chosen bank account, applies the customer's allocations to each invoice, and posts to the GL.
          </p>
          <label className="block text-xs" style={{ color: 'var(--text-2)' }}>
            Bank account
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="mt-1 block w-full rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
            >
              <option value="">Select bank…</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.bankName})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>
              Receipt date
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="mt-1 block w-full rounded-md border px-2 py-1.5 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
              />
            </label>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>
              Reference / UTR
              <input
                type="text"
                value={referenceNumber}
                maxLength={100}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. bank UTR"
                className="mt-1 block w-full rounded-md border px-2 py-1.5 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-1)' }}
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-sm font-medium"
            style={{ color: 'var(--text-2)' }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !bankAccountId}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Verifying…' : 'Verify & create receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

import './detail-tokens.css';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import {
  Download, MoreHorizontal, ArrowLeft, CircleCheck, AlertTriangle,
  Pencil, Trash2, Printer, Link2, Check,
} from 'lucide-react';
import {
  usePurchaseInvoice, useApproveInvoice, useDeletePurchaseInvoice,
  useVendorAdvanceBalance, useApplyAdvanceToBill, useRecordOwnerPayment,
} from '../../../hooks/queries/use-purchase-invoices';
import { useCreatePayment } from '../../../hooks/queries/use-payments';
import { useBankAccounts } from '../../../hooks/queries/use-bank-accounts';
import { useBillSyncSources } from '../../../hooks/queries/use-bill-sync';
import { useDocumentTrail } from '@/hooks/queries/use-trail';
import { useAuth } from '@/providers/auth-provider';
import type { PurchaseInvoiceWithDetails } from '@runq/types';
import { ConfirmationDialog } from '@/components/ui';
import { FileUpload } from '@/components/ui/file-upload';
import { DocumentTrail } from '@/components/audit/document-trail';
import {
  AutoFixSidekick, ActivityTimeline, useDerivedGaps, useDerivedActivity,
} from './detail-rail';

const fmtINR = (n: number, decimals = 2) => {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n < 0 ? '−' : ''}₹${formatted}`;
};
const fmtQty = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || '?';
}

export function BillDetailPage({ billId }: { billId: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const { data, isLoading, isError } = usePurchaseInvoice(billId);
  const invoice = data?.data;

  if (isLoading) return <BillDetailSkeleton />;
  if (isError || !invoice) {
    return <div className="bill-detail-page p-6 text-sm text-[color:var(--bd-neg)]">Bill not found.</div>;
  }
  return <BillDetailContent invoice={invoice} navigate={navigate} router={router} />;
}

function BillDetailSkeleton() {
  return (
    <div className="bill-detail-page p-7">
      <div className="mb-6 h-6 w-48 animate-pulse rounded bg-[color:var(--bd-surface-3)]" />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bd-card" />
        ))}
      </div>
    </div>
  );
}

interface ContentProps {
  invoice: PurchaseInvoiceWithDetails;
  navigate: ReturnType<typeof useNavigate>;
  router: ReturnType<typeof useRouter>;
}

function BillDetailContent({ invoice, navigate, router }: ContentProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const approveMutation = useApproveInvoice();
  const deleteMutation = useDeletePurchaseInvoice();
  const advanceQ = useVendorAdvanceBalance(invoice.vendorId);
  const advanceBalance = advanceQ.data?.data?.balance ?? 0;
  const applyAdvanceMutation = useApplyAdvanceToBill();

  const onApprove = useCallback(() => setShowApproveDialog(true), []);
  const onRecordPayment = useCallback(() => setShowRecordPayment(true), []);
  const onApplyAdvance = useCallback(() => {
    applyAdvanceMutation.mutate(invoice.id);
  }, [applyAdvanceMutation, invoice.id]);
  const onLinkPo = useCallback(() => {
    navigate({ to: '/ap/bills/$billId/edit', params: { billId: invoice.id } });
  }, [navigate, invoice.id]);

  const gaps = useDerivedGaps(invoice, advanceBalance, { onApprove, onRecordPayment, onApplyAdvance, onLinkPo });
  const activity = useDerivedActivity(invoice);
  const trailQ = useDocumentTrail('purchase_invoice', invoice.id);
  const trailGapCount = trailQ.data?.data?.gaps?.length ?? 0;

  function goBack() {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/ap/bills' });
  }

  const balance = Number(invoice.balanceDue);
  const total = Number(invoice.totalAmount);
  const paid = Number(invoice.amountPaid);
  const overdueDays = Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86400000));
  const isOverdue = balance > 0 && overdueDays > 0 && invoice.status !== 'paid' && invoice.status !== 'cancelled';
  const visibleGapCount = gaps.filter((g) => !dismissed.has(g.id)).length;
  const totalGapCount = visibleGapCount + trailGapCount;

  function fixAll() {
    gaps.forEach((g, i) => {
      if (dismissed.has(g.id)) return;
      setTimeout(() => g.onFix(), i * 250);
    });
  }

  return (
    <div className="bill-detail-page">
      <div className="mx-auto max-w-[1480px] px-6 py-7 pb-16">
        <BillHeader
          invoice={invoice}
          balance={balance} total={total} paid={paid}
          overdueDays={overdueDays}
          isOverdue={isOverdue}
          gapCount={totalGapCount}
          autoFixGapCount={visibleGapCount}
          trailGapCount={trailGapCount}
          onBack={goBack}
          onApprove={onApprove}
          onDelete={() => setShowDeleteDialog(true)}
          onRecordPayment={onRecordPayment}
        />

        <div className="bd-grid">
          <div className="bd-grid-main">
            <BillInfoCard invoice={invoice} />
            <LineItemsCard invoice={invoice} />
            <AttachmentsCard invoice={invoice} />
            <ActivityTimeline history={activity} />
          </div>
          <div className="bd-grid-rail">
            <AutoFixSidekick
              gaps={gaps}
              dismissedIds={dismissed}
              onDismiss={(id) => setDismissed((s) => new Set([...s, id]))}
              onFixAll={fixAll}
            />
            <DocumentTrailCard invoice={invoice} />
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={showApproveDialog}
        onClose={() => setShowApproveDialog(false)}
        onConfirm={() =>
          approveMutation.mutate({ id: invoice.id }, { onSuccess: () => setShowApproveDialog(false) })
        }
        title="Approve Bill"
        description={`Approve bill ${invoice.invoiceNumber} for ${fmtINR(total)}? Once approved, it will be available for payment.`}
        confirmLabel="Approve"
        variant="warning"
        loading={approveMutation.isPending}
      />
      {showRecordPayment && (
        <RecordPaymentDialog
          invoice={invoice}
          onClose={() => setShowRecordPayment(false)}
        />
      )}
      <ConfirmationDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={() =>
          deleteMutation.mutate(invoice.id, {
            onSuccess: () => { setShowDeleteDialog(false); navigate({ to: '/ap/bills' }); },
          })
        }
        title={invoice.status === 'draft' ? 'Delete Bill' : 'Cancel Bill'}
        description={
          invoice.status === 'draft'
            ? `Permanently delete bill ${invoice.invoiceNumber}? Line items and attachments will be removed.`
            : `Cancel bill ${invoice.invoiceNumber}?`
        }
        confirmLabel={invoice.status === 'draft' ? 'Delete Bill' : 'Cancel Bill'}
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

interface HeaderProps {
  invoice: PurchaseInvoiceWithDetails;
  balance: number; total: number; paid: number;
  overdueDays: number; isOverdue: boolean;
  gapCount: number;
  autoFixGapCount: number;
  trailGapCount: number;
  onBack: () => void;
  onApprove: () => void;
  onDelete: () => void;
  onRecordPayment: () => void;
}

function BillHeader({ invoice, balance, total, paid, overdueDays, isOverdue, gapCount, autoFixGapCount, trailGapCount, onBack, onApprove, onDelete, onRecordPayment }: HeaderProps) {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const printUrl = (format?: 'pdf') => {
    const fmt = format ? `&format=${format}` : '';
    return `/api/v1/ap/purchase-invoices/${invoice.id}/print?tenantId=${tenantId}${fmt}`;
  };
  const { data: sourcesData } = useBillSyncSources();
  const source = invoice.sourceId ? sourcesData?.data.find((s) => s.id === invoice.sourceId) : null;
  const isPaid = invoice.status === 'paid';
  const isDraft = invoice.status === 'draft';
  const initials = getInitials(invoice.vendorName);
  const taxAmount = invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount + invoice.cessAmount;

  return (
    <div className="bd-page-header">
      <div className="bd-ph-top">
        <div className="bd-ph-identity">
          <button onClick={onBack} className="bd-icon-btn" title="Back" aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="bd-vendor-avatar">{initials}</div>
          <div className="bd-ph-meta">
            <div className="bd-ph-eyebrow">
              {isOverdue && (
                <span className="bd-pill bd-pill-warn"><AlertTriangle size={12} />{overdueDays} day{overdueDays === 1 ? '' : 's'} overdue</span>
              )}
              {isPaid && <span className="bd-pill bd-pill-success"><CircleCheck size={12} />Paid</span>}
              {!isPaid && !isOverdue && <span className="bd-pill bd-pill-neutral">{invoice.status.replace('_', ' ')}</span>}
              {source && <span className="bd-pill bd-pill-info">{source.name} · v{invoice.externalVersion}</span>}
              <span className="bd-ph-id">#{invoice.invoiceNumber}</span>
            </div>
            <h1 className="bd-ph-title">{invoice.vendorName}</h1>
            <div className="bd-ph-sub">
              <span>Invoice {fmtDate(invoice.invoiceDate)}</span>
              <span className="bd-dot">·</span>
              <span>Due {fmtDate(invoice.dueDate)}</span>
              {invoice.placeOfSupply && (<><span className="bd-dot">·</span><span>{invoice.placeOfSupply}</span></>)}
            </div>
          </div>
        </div>
        <div className="bd-ph-actions">
          <button
            className="bd-btn bd-btn-ghost"
            onClick={() => window.open(printUrl('pdf'), '_blank')}
          >
            <Download size={15} />PDF
          </button>
          {isDraft && (
            <Link to="/ap/bills/$billId/edit" params={{ billId: invoice.id }}>
              <button className="bd-btn bd-btn-ghost"><Pencil size={15} />Edit</button>
            </Link>
          )}
          <BillActionsMenu printUrl={printUrl()} />
          {!isPaid && invoice.status !== 'cancelled' && (
            <button className="bd-btn bd-btn-danger" onClick={onDelete}>
              <Trash2 size={15} />{isDraft ? 'Delete' : 'Cancel'}
            </button>
          )}
          {isDraft && (
            <button className="bd-btn bd-btn-secondary" onClick={onApprove}>Approve</button>
          )}
          {!isPaid && balance > 0 && invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
            <button className="bd-btn bd-btn-primary" onClick={onRecordPayment}>
              <CircleCheck size={15} />Record payment
            </button>
          )}
        </div>
      </div>

      <div className="bd-amount-grid">
        <AmountTile label="Amount due" value={balance} accent="warn" big sub={isOverdue ? `${overdueDays} days late` : balance === 0 ? 'Settled' : 'Outstanding'} />
        <AmountTile label="Bill total" value={total} sub={taxAmount > 0 ? 'Incl. tax' : 'No tax'} />
        <AmountTile label="Paid so far" value={paid} sub={paid === 0 ? 'No payments' : 'Cumulative'} />
        <AmountTile
          label="Audit gaps"
          count={gapCount}
          accent="info"
          sub={
            gapCount === 0
              ? 'All clear'
              : trailGapCount > 0 && autoFixGapCount > 0
                ? `${autoFixGapCount} auto-fix · ${trailGapCount} trail`
                : trailGapCount > 0
                  ? `${trailGapCount} document trail`
                  : 'Auto-Fix available'
          }
        />
      </div>
    </div>
  );
}

function AmountTile({ label, value, count, sub, accent, big }: { label: string; value?: number; count?: number; sub?: string; accent?: 'warn' | 'info'; big?: boolean }) {
  const cls = `bd-amt-tile ${accent ? `bd-amt-${accent}` : ''} ${big ? 'bd-amt-big' : ''}`;
  return (
    <div className={cls}>
      <div className="bd-amt-label">{label}</div>
      <div>
        <span className="bd-amt-num">{count != null ? count : value != null ? fmtINR(value) : '—'}</span>
      </div>
      {sub && <div className="bd-amt-sub">{sub}</div>}
    </div>
  );
}

// ─── Bill Info ────────────────────────────────────────────────────────────────

function BillInfoCard({ invoice }: { invoice: PurchaseInvoiceWithDetails }) {
  const fields = [
    { label: 'Vendor', value: invoice.vendorName },
    { label: 'Invoice number', value: invoice.invoiceNumber, mono: true },
    { label: 'Invoice date', value: fmtDate(invoice.invoiceDate) },
    { label: 'Due date', value: fmtDate(invoice.dueDate), accent: 'warn' as const },
    { label: 'PO reference', value: invoice.poId, missing: !invoice.poId },
    { label: 'GRN reference', value: invoice.grnId, missing: !invoice.grnId },
    { label: 'Place of supply', value: invoice.placeOfSupply, missing: !invoice.placeOfSupply },
    { label: 'Supply type', value: invoice.isInterState != null ? (invoice.isInterState ? 'Inter-State' : 'Intra-State') : null, missing: invoice.isInterState == null },
  ];
  return (
    <section className="bd-card">
      <header className="bd-card-header">
        <div className="bd-card-title">Bill info</div>
      </header>
      <div className="bd-info-grid">
        {fields.map((f, i) => (
          <div key={i} className="bd-info-field">
            <div className="bd-info-label">{f.label}</div>
            <div className={`bd-info-value ${f.mono ? 'bd-mono' : ''} ${f.missing ? 'bd-info-missing' : ''} ${'accent' in f && f.accent === 'warn' ? 'bd-info-warn' : ''}`}>
              {f.value || 'Not set'}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Line Items ───────────────────────────────────────────────────────────────

function LineItemsCard({ invoice }: { invoice: PurchaseInvoiceWithDetails }) {
  const tax = invoice.cgstAmount + invoice.sgstAmount + invoice.igstAmount + invoice.cessAmount;
  return (
    <section className="bd-card">
      <header className="bd-card-header">
        <div className="flex items-baseline gap-2.5">
          <div className="bd-card-title">Line items</div>
          <div className="bd-card-meta">{invoice.items.length} item{invoice.items.length === 1 ? '' : 's'}</div>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="bd-line-table">
          <thead>
            <tr>
              <th style={{ width: '40%' }}>Item</th>
              <th className="bd-col-num">Qty</th>
              <th className="bd-col-num">Unit price</th>
              <th className="bd-col-num">Tax</th>
              <th className="bd-col-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="bd-item-name">{item.itemName}</div>
                  {item.hsnSacCode && <div className="bd-item-desc">HSN/SAC {item.hsnSacCode}</div>}
                </td>
                <td className="bd-col-num bd-mono">{fmtQty(item.quantity)}</td>
                <td className="bd-col-num bd-mono">{fmtINR(item.unitPrice)}</td>
                <td className="bd-col-num bd-mono bd-dim">{item.taxRate != null ? `${item.taxRate}%` : '—'}</td>
                <td className={`bd-col-num bd-mono ${item.amount < 0 ? 'bd-neg' : ''}`}>{fmtINR(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bd-totals">
        <div className="bd-totals-grid">
          <div className="bd-totals-row">
            <span className="bd-totals-label">Subtotal</span>
            <span className="bd-totals-val bd-mono">{fmtINR(invoice.subtotal)}</span>
          </div>
          {invoice.cgstAmount > 0 && (
            <div className="bd-totals-row">
              <span className="bd-totals-label">CGST</span>
              <span className="bd-totals-val bd-mono bd-dim">{fmtINR(invoice.cgstAmount)}</span>
            </div>
          )}
          {invoice.sgstAmount > 0 && (
            <div className="bd-totals-row">
              <span className="bd-totals-label">SGST</span>
              <span className="bd-totals-val bd-mono bd-dim">{fmtINR(invoice.sgstAmount)}</span>
            </div>
          )}
          {invoice.igstAmount > 0 && (
            <div className="bd-totals-row">
              <span className="bd-totals-label">IGST</span>
              <span className="bd-totals-val bd-mono bd-dim">{fmtINR(invoice.igstAmount)}</span>
            </div>
          )}
          {invoice.tdsAmount > 0 && (
            <div className="bd-totals-row">
              <span className="bd-totals-label">TDS{invoice.tdsSection ? ` (${invoice.tdsSection})` : ''}</span>
              <span className="bd-totals-val bd-mono">−{fmtINR(invoice.tdsAmount)}</span>
            </div>
          )}
          {tax > 0 && invoice.cgstAmount === 0 && invoice.sgstAmount === 0 && invoice.igstAmount === 0 && (
            <div className="bd-totals-row">
              <span className="bd-totals-label">Tax</span>
              <span className="bd-totals-val bd-mono bd-dim">{fmtINR(tax)}</span>
            </div>
          )}
          <div className="bd-totals-row bd-totals-grand">
            <span className="bd-totals-label">Total</span>
            <span className="bd-totals-val bd-mono">{fmtINR(invoice.totalAmount)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Attachments ──────────────────────────────────────────────────────────────

function AttachmentsCard({ invoice }: { invoice: PurchaseInvoiceWithDetails }) {
  return (
    <section className="bd-card">
      <header className="bd-card-header">
        <div className="bd-card-title">Attachments</div>
      </header>
      <div className="p-3">
        <FileUpload entityType="purchase_invoice" entityId={invoice.id} />
      </div>
    </section>
  );
}

function DocumentTrailCard({ invoice }: { invoice: PurchaseInvoiceWithDetails }) {
  return (
    <section className="bd-card">
      <header className="bd-card-header">
        <div className="bd-card-title">Document trail</div>
        <div className="bd-card-meta">Linked entities and reconciliation gaps</div>
      </header>
      <div className="p-4">
        <DocumentTrail entityType="purchase_invoice" entityId={invoice.id} />
      </div>
    </section>
  );
}

// ─── Record Payment dialog ────────────────────────────────────────────────────

const OWNER_SOURCE = '__owner__';

function RecordPaymentDialog({
  invoice,
  onClose,
}: {
  invoice: PurchaseInvoiceWithDetails;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(invoice.balanceDue));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState<string>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: bankData } = useBankAccounts();
  const createPayment = useCreatePayment();
  const recordOwner = useRecordOwnerPayment();
  const submitting = createPayment.isPending || recordOwner.isPending;

  const banks = bankData?.data ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (numAmount > invoice.balanceDue + 0.01) {
      setError(`Amount cannot exceed balance due ₹${invoice.balanceDue.toLocaleString('en-IN')}.`);
      return;
    }
    if (!source) {
      setError('Pick a payment source.');
      return;
    }

    if (source === OWNER_SOURCE) {
      recordOwner.mutate(
        { billId: invoice.id, amount: numAmount, paymentDate, notes: notes || undefined },
        {
          onSuccess: onClose,
          onError: (err) => setError((err as Error).message || 'Failed to record owner payment.'),
        },
      );
    } else {
      createPayment.mutate(
        {
          vendorId: invoice.vendorId,
          bankAccountId: source,
          paymentMethod: 'bank_transfer',
          referenceNumber: reference || null,
          paymentDate,
          totalAmount: numAmount,
          allocations: [{ invoiceId: invoice.id, amount: numAmount }],
          notes: notes || null,
        },
        {
          onSuccess: onClose,
          onError: (err) => setError((err as Error).message || 'Failed to record payment.'),
        },
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border bg-[color:var(--surface)] shadow-2xl"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Record payment — {invoice.invoiceNumber}
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-3)' }}>
            Balance due: ₹{invoice.balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={invoice.balanceDue}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bd-form-input"
                autoFocus
              />
            </Field>
            <Field label="Payment date">
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="bd-form-input"
              />
            </Field>
          </div>

          <Field label="Source">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="bd-form-input"
            >
              <option value="">Select source…</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.accountNumber ? `(****${b.accountNumber.slice(-4)})` : ''}
                </option>
              ))}
              <option value={OWNER_SOURCE}>Owner / Personal (Petty Cash + owner injection)</option>
            </select>
            {source === OWNER_SOURCE && (
              <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                Books two journal entries: <strong>Dr Petty Cash / Cr Owner&apos;s Capital</strong>, then <strong>Dr AP / Cr Petty Cash</strong>. Net effect: owner&apos;s personal funds settle this bill.
              </p>
            )}
          </Field>

          {source !== OWNER_SOURCE && (
            <Field label="UTR / Reference (optional)">
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="bd-form-input"
                placeholder="UTR123…"
              />
            </Field>
          )}

          <Field label="Notes (optional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bd-form-input"
              rows={2}
            />
          </Field>

          {error && (
            <div className="rounded-md border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--neg)', color: 'var(--neg)', background: 'var(--neg-soft, rgba(239,68,68,0.08))' }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--border)' }}>
          <button type="button" className="bd-btn bd-btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="bd-btn bd-btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── Actions menu (three-dots) ────────────────────────────────────────────────

function BillActionsMenu({ printUrl }: { printUrl: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handlePrint() {
    setOpen(false);
    window.open(printUrl, '_blank');
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 900);
    } catch {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        className="bd-btn bd-btn-ghost"
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 w-[200px] overflow-hidden rounded-lg border"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)',
          }}
        >
          <button
            role="menuitem"
            onClick={handlePrint}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[color:var(--surface-2)]"
            style={{ color: 'var(--text-1)' }}
          >
            <Printer size={14} />
            Print / preview
          </button>
          <button
            role="menuitem"
            onClick={handleCopyLink}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[color:var(--surface-2)]"
            style={{ color: 'var(--text-1)', borderTop: '1px solid var(--border-soft)' }}
          >
            {copied ? <Check size={14} /> : <Link2 size={14} />}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadCSV } from '@/lib/csv-export';

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
  upiLink: { deepLink: string; qrData: string } | null;
  pendingClaim: { claimId: string; claimDate: string } | null;
}

interface PaymentClaim {
  id: string;
  claimedAmount: number;
  claimDate: string;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'cancelled';
  verifiedAt: string | null;
  createdAt: string;
  invoices: Array<{ invoiceId: string; invoiceNumber: string; amount: number }>;
}

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'neft', label: 'NEFT' },
  { value: 'rtgs', label: 'RTGS' },
  { value: 'imps', label: 'IMPS' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

function paymentMethodLabel(v: string): string {
  return PAYMENT_METHODS.find((m) => m.value === v)?.label ?? v.toUpperCase();
}

interface StatementRow {
  date: string;
  type: 'invoice' | 'receipt' | 'credit_note' | 'customer_debit_note';
  ref: string;
  entityId?: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface Statement {
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  rows: StatementRow[];
}

interface ReceiptAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
}

interface ReceiptPayment {
  receiptId: string;
  receiptDate: string;
  totalAmount: number;
  method: string;
  referenceNumber: string | null;
  notes: string | null;
  allocations: ReceiptAllocation[];
  allocatedTotal: number;
}

type PortalCtx = { mode: 'slug'; slug: string } | { mode: 'token'; token: string };

function invoicePrintUrl(ctx: PortalCtx, invoiceId: string): string {
  if (ctx.mode === 'slug') return `/api/v1/ar/portal/s/${ctx.slug}/invoices/${invoiceId}/print`;
  return `/api/v1/ar/portal/invoices/${invoiceId}/print?token=${encodeURIComponent(ctx.token)}`;
}
type Tab = 'outstanding' | 'statement' | 'reports' | 'payments';

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function getPortalContext(): PortalCtx | null {
  const match = window.location.pathname.match(/\/portal\/s\/([a-z0-9-]+)/i);
  if (match) return { mode: 'slug', slug: match[1]! };
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) return { mode: 'token', token };
  return null;
}

function buildApiBase(ctx: PortalCtx): { base: string; qs: string } {
  if (ctx.mode === 'slug') return { base: `/api/v1/ar/portal/s/${ctx.slug}`, qs: '' };
  return { base: `/api/v1/ar/portal`, qs: `?token=${encodeURIComponent(ctx.token)}` };
}

function sessionStorageKey(ctx: PortalCtx): string {
  return `runq.portal.session.${ctx.mode === 'slug' ? ctx.slug : ctx.token}`;
}

function getSessionToken(ctx: PortalCtx): string | null {
  try {
    return localStorage.getItem(sessionStorageKey(ctx));
  } catch {
    return null;
  }
}

function setSessionToken(ctx: PortalCtx, token: string): void {
  try {
    localStorage.setItem(sessionStorageKey(ctx), token);
  } catch {
    /* private mode, etc. */
  }
}

function clearSessionToken(ctx: PortalCtx): void {
  try {
    localStorage.removeItem(sessionStorageKey(ctx));
  } catch {
    /* noop */
  }
}

async function portalFetch(ctx: PortalCtx, url: string, init?: RequestInit): Promise<Response> {
  const token = getSessionToken(ctx);
  const headers = new Headers(init?.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) clearSessionToken(ctx);
  return res;
}

function currentFY(): { from: string; to: string } {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31` };
}

function getTabFromHash(): Tab {
  const h = window.location.hash.replace('#', '');
  if (h === 'statement' || h === 'payments' || h === 'reports') return h;
  return 'outstanding';
}

function getInvoiceFromHash(): string | null {
  const m = window.location.hash.match(/^#invoice\/([0-9a-f-]+)$/i);
  return m ? m[1]! : null;
}

function getPaymentFromHash(): string | null {
  const m = window.location.hash.match(/^#payment\/([0-9a-f-]+)$/i);
  return m ? m[1]! : null;
}

export function PortalPage() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [needsPin, setNeedsPin] = useState(false);
  const [tab, setTab] = useState<Tab>(() => getTabFromHash());
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(() => getInvoiceFromHash());
  const [viewingPaymentId, setViewingPaymentId] = useState<string | null>(() => getPaymentFromHash());
  const ctx = useMemo(() => getPortalContext(), []);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    if (!ctx) {
      setError('Invalid portal link');
      setLoading(false);
      return;
    }
    void loadInvoices(ctx);
    const onHash = () => {
      setTab(getTabFromHash());
      setViewingInvoiceId(getInvoiceFromHash());
      setViewingPaymentId(getPaymentFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      document.documentElement.classList.add('dark');
      window.removeEventListener('hashchange', onHash);
    };
  }, [ctx]);

  async function loadInvoices(c: PortalCtx) {
    try {
      const { base, qs } = buildApiBase(c);
      const res = await portalFetch(c, `${base}/invoices${qs}`);
      if (res.status === 401) {
        setNeedsPin(true);
        return;
      }
      if (!res.ok) {
        setError('Invalid or expired link');
        return;
      }
      const data = await res.json();
      setNeedsPin(false);
      setCompanyName(data.companyName);
      setCustomerName(data.customerName);
      setInvoices(data.data);
    } catch {
      setError('Failed to load portal data');
    } finally {
      setLoading(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    window.location.hash = next === 'outstanding' ? '' : next;
  }

  if (loading) return <LoadingScreen />;
  if (error || !ctx) return <ErrorScreen message={error || 'Invalid portal link'} />;
  if (needsPin) {
    return (
      <PinLoginScreen
        ctx={ctx}
        onSuccess={() => {
          setLoading(true);
          void loadInvoices(ctx);
        }}
      />
    );
  }

  const totalDue = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="sticky top-0 z-20 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <StickyHeader companyName={companyName} customerName={customerName} totalDue={totalDue} />
        {!viewingInvoiceId && !viewingPaymentId && <TabBar active={tab} onChange={switchTab} />}
      </div>
      {viewingInvoiceId ? (
        <InvoiceView ctx={ctx} invoiceId={viewingInvoiceId} invoices={invoices} />
      ) : viewingPaymentId ? (
        <PaymentView ctx={ctx} paymentId={viewingPaymentId} />
      ) : (
        <>
          <div className="mx-auto max-w-5xl px-4 py-6">
            {tab === 'outstanding' && (
              <OutstandingTab invoices={invoices} ctx={ctx} onChange={() => ctx && loadInvoices(ctx)} />
            )}
            {tab === 'statement' && <StatementTab ctx={ctx} />}
            {tab === 'reports' && <ReportsTab ctx={ctx} />}
            {tab === 'payments' && <PaymentsTab ctx={ctx} />}
          </div>
        </>
      )}

      <Footer />
    </div>
  );
}

function InvoiceView({
  ctx,
  invoiceId,
  invoices,
}: {
  ctx: PortalCtx;
  invoiceId: string;
  invoices: PortalInvoice[];
}) {
  const inv = invoices.find((i) => i.id === invoiceId);
  const printUrl = invoicePrintUrl(ctx, invoiceId);
  const pdfUrl = `${printUrl}${printUrl.includes('?') ? '&' : '?'}format=pdf`;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(800);
  const [html, setHtml] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    portalFetch(ctx, printUrl)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.text();
      })
      .then((text) => {
        if (!cancelled && text) setHtml(text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [printUrl]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await portalFetch(ctx, pdfUrl);
      if (!res.ok) return;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = inv ? `${inv.invoiceNumber}.pdf` : 'invoice.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } finally {
      setDownloading(false);
    }
  }

  function goBack() {
    window.history.back();
  }

  function handleLoad() {
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      // Resize to content so the iframe doesn't scroll.
      const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      setIframeHeight(height + 16);
    } catch {
      // cross-origin or render race — leave default height
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {inv && (
            <span className="hidden font-mono text-sm text-zinc-500 sm:inline">{inv.invoiceNumber}</span>
          )}
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {downloading ? 'Downloading…' : '⬇ Download'}
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {html ? (
          <iframe
            ref={iframeRef}
            srcDoc={html}
            title="Invoice"
            onLoad={handleLoad}
            scrolling="no"
            style={{ height: `${iframeHeight}px` }}
            className="block w-full border-0"
          />
        ) : (
          <div className="flex h-96 items-center justify-center text-sm text-zinc-500">Loading invoice…</div>
        )}
      </div>
    </div>
  );
}

function PinLoginScreen({ ctx, onSuccess }: { ctx: PortalCtx; onSuccess: () => void }) {
  const [info, setInfo] = useState<{ companyName: string; customerName: string } | null>(null);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ctx.mode !== 'slug') return;
    fetch(`/api/v1/ar/portal/s/${ctx.slug}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInfo({ companyName: d.companyName, customerName: d.customerName }))
      .catch(() => {});
    inputRef.current?.focus();
  }, [ctx]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4 to 6 digits');
      return;
    }
    if (ctx.mode !== 'slug') {
      setError('PIN login is not available for this link.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/ar/portal/s/${ctx.slug}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.status === 401) {
        setError('Incorrect PIN. Please try again.');
        return;
      }
      if (!res.ok) {
        setError('Login failed. Please try again.');
        return;
      }
      const { token } = (await res.json()) as { token: string };
      setSessionToken(ctx, token);
      onSuccess();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {info && (
            <>
              <h1 className="text-xl font-bold text-zinc-900">{info.companyName}</h1>
              <p className="mt-1 text-sm text-zinc-500">Payment portal for {info.customerName}</p>
            </>
          )}
        </div>
        <form
          onSubmit={submit}
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Portal PIN
          </label>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="\d*"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••"
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-center font-mono text-2xl tracking-[0.5em] text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || pin.length < 4}
            className="mt-4 w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Verifying…' : 'Continue'}
          </button>
          <p className="mt-4 text-center text-xs text-zinc-500">
            Don't have the PIN? Contact {info?.companyName || 'us'} for access.
          </p>
        </form>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-600" />
        <p className="text-sm text-zinc-500">Loading your portal…</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center">
      <div className="mb-3 text-3xl">⚠️</div>
      <p className="text-base font-medium text-zinc-900">{message}</p>
      <p className="mt-1 text-sm text-zinc-500">Please contact us for a fresh link.</p>
    </div>
  );
}

function StickyHeader({
  companyName,
  customerName,
  totalDue,
}: {
  companyName: string;
  customerName: string;
  totalDue: number;
}) {
  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-zinc-900 sm:text-lg">{companyName}</h1>
          <p className="truncate text-xs text-zinc-500 sm:text-sm">for {customerName}</p>
        </div>
        {totalDue > 0 ? (
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 sm:text-xs">Total Due</p>
            <p className="text-base font-semibold tabular-nums text-red-600 sm:text-lg">{formatINR(totalDue)}</p>
          </div>
        ) : (
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            All clear ✓
          </div>
        )}
      </div>
    </div>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'outstanding', label: 'Outstanding' },
    { id: 'statement', label: 'Statement' },
    { id: 'reports', label: 'Payment Reports' },
    { id: 'payments', label: 'Payments' },
  ];
  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
              active === t.id ? 'text-indigo-600' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {t.label}
            {active === t.id && (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-indigo-600" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
type StatusFilter = 'all' | 'overdue' | 'due_soon' | 'current';

function OutstandingTab({
  invoices,
  ctx,
  onChange,
}: {
  invoices: PortalInvoice[];
  ctx: PortalCtx;
  onChange: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const shiftRef = useRef(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelect(list: PortalInvoice[], idx: number) {
    const target = list[idx];
    if (!target || target.pendingClaim) return;
    const useShift = shiftRef.current && lastIndex !== null && lastIndex !== idx;
    shiftRef.current = false;
    if (!useShift) {
      toggle(target.id);
      setLastIndex(idx);
      return;
    }
    const [from, to] = lastIndex! < idx ? [lastIndex!, idx] : [idx, lastIndex!];
    const targetState = !selected.has(target.id);
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = from; i <= to; i++) {
        const inv = list[i];
        if (!inv || inv.pendingClaim) continue;
        if (targetState) next.add(inv.id);
        else next.delete(inv.id);
      }
      return next;
    });
    setLastIndex(idx);
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function selectableInvoices(list: PortalInvoice[]): PortalInvoice[] {
    return list.filter((i) => !i.pendingClaim);
  }
  function allSelectedOnPage(list: PortalInvoice[]): boolean {
    const sel = selectableInvoices(list);
    return sel.length > 0 && sel.every((i) => selected.has(i.id));
  }
  function togglePage(list: PortalInvoice[]) {
    const sel = selectableInvoices(list);
    setSelected((prev) => {
      const next = new Set(prev);
      if (sel.every((i) => next.has(i.id))) sel.forEach((i) => next.delete(i.id));
      else sel.forEach((i) => next.add(i.id));
      return next;
    });
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center">
        <div className="mb-2 text-4xl">🎉</div>
        <p className="text-base font-medium text-zinc-900">All caught up!</p>
        <p className="mt-1 text-sm text-zinc-500">No outstanding invoices.</p>
      </div>
    );
  }

  const today = new Date();
  const totalDue = invoices.reduce((s, i) => s + i.balanceDue, 0);
  const overdueInvoices = invoices.filter((i) => new Date(i.dueDate) < today);
  const overdueAmount = overdueInvoices.reduce((s, i) => s + i.balanceDue, 0);
  const oldest = invoices.reduce<PortalInvoice | null>(
    (acc, i) => (acc === null || i.invoiceDate < acc.invoiceDate ? i : acc),
    null,
  );

  const sevenDaysOut = new Date(today);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  const q = search.trim().toLowerCase();
  const filtered = invoices.filter((inv) => {
    if (q && !inv.invoiceNumber.toLowerCase().includes(q)) return false;
    if (statusFilter === 'all') return true;
    const due = new Date(inv.dueDate);
    if (statusFilter === 'overdue') return due < today;
    if (statusFilter === 'due_soon') return due >= today && due <= sevenDaysOut;
    if (statusFilter === 'current') return due > sevenDaysOut;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageInvoices = filtered.slice(startIdx, startIdx + pageSize);
  const rangeLabel =
    filtered.length === 0
      ? '0 of 0'
      : `${startIdx + 1}–${Math.min(startIdx + pageSize, filtered.length)} of ${filtered.length}`;
  const filteredTotalDue = filtered.reduce((s, i) => s + i.balanceDue, 0);
  const showAction = filtered.some((i) => i.upiLink);

  function setFilter(next: StatusFilter) {
    setStatusFilter(next);
    setPage(1);
  }
  function setSearchValue(v: string) {
    setSearch(v);
    setPage(1);
  }

  const filterCounts = {
    all: invoices.length,
    overdue: invoices.filter((i) => new Date(i.dueDate) < today).length,
    due_soon: invoices.filter((i) => {
      const d = new Date(i.dueDate);
      return d >= today && d <= sevenDaysOut;
    }).length,
    current: invoices.filter((i) => new Date(i.dueDate) > sevenDaysOut).length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Due" value={totalDue} tone="due" />
        <SummaryCard label="Overdue" value={overdueAmount} tone={overdueAmount > 0 ? 'due' : 'neutral'} />
        <StatCard label="Invoices" value={String(invoices.length)} hint={`${overdueInvoices.length} overdue`} />
        <StatCard
          label="Oldest"
          value={oldest ? formatDate(oldest.invoiceDate) : '—'}
          hint={oldest ? oldest.invoiceNumber : ''}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search invoice number…"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={statusFilter === 'all'} count={filterCounts.all} onClick={() => setFilter('all')}>
            All
          </FilterChip>
          <FilterChip
            active={statusFilter === 'overdue'}
            count={filterCounts.overdue}
            tone="danger"
            onClick={() => setFilter('overdue')}
          >
            Overdue
          </FilterChip>
          <FilterChip
            active={statusFilter === 'due_soon'}
            count={filterCounts.due_soon}
            tone="warn"
            onClick={() => setFilter('due_soon')}
          >
            Due in 7d
          </FilterChip>
          <FilterChip
            active={statusFilter === 'current'}
            count={filterCounts.current}
            onClick={() => setFilter('current')}
          >
            Current
          </FilterChip>
          <ExportCsvButton onClick={() => exportOutstandingCsv(filtered)} disabled={filtered.length === 0} />
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
          No invoices match {q ? `"${search}"` : 'this filter'}.
        </div>
      )}

      {filtered.length > 0 && (
      <div className="sm:hidden space-y-3">
        {pageInvoices.map((inv, idx) => (
          <InvoiceCard
            key={inv.id}
            inv={inv}
            ctx={ctx}
            selected={selected.has(inv.id)}
            onSelect={() => handleSelect(pageInvoices, idx)}
            shiftRef={shiftRef}
          />
        ))}
      </div>
      )}

      {filtered.length > 0 && (
      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={allSelectedOnPage(pageInvoices)}
                  onChange={() => togglePage(pageInvoices)}
                  className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Invoice #</th>
              <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Issued</th>
              <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Due</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Total</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Balance Due</th>
              {showAction && (
                <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Action</th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageInvoices.map((inv, idx) => {
              const isOverdue = new Date(inv.dueDate) < today;
              function openInvoice() {
                window.location.hash = `invoice/${inv.id}`;
              }
              const claimed = !!inv.pendingClaim;
              return (
                <tr
                  key={inv.id}
                  onClick={openInvoice}
                  className={`border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 ${claimed ? '' : 'cursor-pointer'}`}
                >
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${inv.invoiceNumber}`}
                      checked={selected.has(inv.id)}
                      disabled={claimed}
                      onMouseDown={(e) => {
                        shiftRef.current = e.shiftKey;
                      }}
                      onChange={() => handleSelect(pageInvoices, idx)}
                      className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-indigo-600 hover:underline">
                        {inv.invoiceNumber}
                      </span>
                      {isOverdue && !claimed && (
                        <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-red-600">
                          Overdue
                        </span>
                      )}
                      {claimed && (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-700">
                          Payment reported
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{formatDate(inv.invoiceDate)}</td>
                  <td className={`px-4 py-3 ${isOverdue ? 'font-medium text-red-600' : 'text-zinc-600'}`}>
                    {formatDate(inv.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-500">
                    {formatINR(inv.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-zinc-900">
                    {formatINR(inv.balanceDue)}
                  </td>
                  {showAction && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {inv.upiLink ? (
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={inv.upiLink.deepLink}
                            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                          >
                            Pay
                          </a>
                          <CopyButton text={inv.upiLink.deepLink} />
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-50">
              <td colSpan={5} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">
                {statusFilter === 'all' && !q ? 'Total Outstanding' : 'Filtered Total'}
              </td>
              <td className="px-4 py-3 text-right font-mono text-base font-semibold tabular-nums text-red-600">
                {formatINR(filteredTotalDue)}
              </td>
              {showAction && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      )}

      {selected.size > 0 && (
        <SelectionBar
          count={selected.size}
          total={invoices.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.balanceDue, 0)}
          onClear={clearSelection}
          onMark={() => setShowMarkModal(true)}
        />
      )}

      {showMarkModal && (
        <MarkPaidModal
          ctx={ctx}
          invoiceIds={[...selected]}
          total={invoices.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.balanceDue, 0)}
          onClose={() => setShowMarkModal(false)}
          onSuccess={() => {
            setShowMarkModal(false);
            clearSelection();
            onChange();
          }}
        />
      )}

      {filtered.length > PAGE_SIZE_OPTIONS[0]! && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 sm:flex-row">
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{rangeLabel}</span>
            <label className="flex items-center gap-1.5">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="px-2 text-xs tabular-nums text-zinc-600">
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  count,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  tone?: 'danger' | 'warn';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const baseInactive =
    tone === 'danger'
      ? 'bg-red-50 text-red-700 hover:bg-red-100'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-zinc-900 text-white' : baseInactive
      }`}
    >
      {children}
      <span className={`tabular-nums ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>{count}</span>
    </button>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-900 sm:text-base">{value}</p>
      {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}

function InvoiceCard({
  inv,
  selected,
  onSelect,
  shiftRef,
}: {
  inv: PortalInvoice;
  ctx: PortalCtx;
  selected: boolean;
  onSelect: () => void;
  shiftRef: React.MutableRefObject<boolean>;
}) {
  const isOverdue = new Date(inv.dueDate) < new Date();
  const claimed = !!inv.pendingClaim;
  function openInvoice() {
    window.location.hash = `invoice/${inv.id}`;
  }
  return (
    <div
      onClick={openInvoice}
      className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`Select ${inv.invoiceNumber}`}
          checked={selected}
          disabled={claimed}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            shiftRef.current = e.shiftKey;
          }}
          onChange={onSelect}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-indigo-600">{inv.invoiceNumber}</span>
            {isOverdue && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-600">
                Overdue
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Issued {formatDate(inv.invoiceDate)} · Due{' '}
            <span className={isOverdue ? 'font-medium text-red-600' : ''}>{formatDate(inv.dueDate)}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-zinc-900">{formatINR(inv.balanceDue)}</p>
          {inv.balanceDue !== inv.totalAmount && (
            <p className="text-[10px] text-zinc-400">of {formatINR(inv.totalAmount)}</p>
          )}
        </div>
      </div>
      {inv.upiLink && (
        <div
          className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <a
            href={inv.upiLink.deepLink}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Pay via UPI
          </a>
          <CopyButton text={inv.upiLink.deepLink} />
        </div>
      )}
    </div>
  );
}

function StatementTab({ ctx }: { ctx: PortalCtx }) {
  const [range, setRange] = useState(() => currentFY());
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    void loadStatement();
  }, [range.from, range.to]);

  async function loadStatement() {
    setLoading(true);
    try {
      const { base, qs } = buildApiBase(ctx);
      const sep = qs ? '&' : '?';
      const res = await portalFetch(ctx, `${base}/statement${qs}${sep}from=${range.from}&to=${range.to}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStatement(data.statement);
    } catch {
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const { base, qs } = buildApiBase(ctx);
      const sep = qs ? '&' : '?';
      const url = `${base}/statement.pdf${qs}${sep}from=${range.from}&to=${range.to}`;
      const res = await portalFetch(ctx, url);
      if (!res.ok) return;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `statement-${range.from}-to-${range.to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } finally {
      setDownloading(false);
    }
  }

  function setPreset(preset: 'current_fy' | 'last_fy' | 'last_90') {
    if (preset === 'current_fy') setRange(currentFY());
    else if (preset === 'last_fy') {
      const cur = currentFY();
      const sy = Number(cur.from.slice(0, 4)) - 1;
      setRange({ from: `${sy}-04-01`, to: `${sy + 1}-03-31` });
    } else {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      setRange({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <PresetChip onClick={() => setPreset('current_fy')} active={range.from === currentFY().from}>
              This FY
            </PresetChip>
            <PresetChip onClick={() => setPreset('last_fy')}>Last FY</PresetChip>
            <PresetChip onClick={() => setPreset('last_90')}>Last 90 days</PresetChip>
          </div>
          <div className="flex items-center gap-1.5">
            <ExportCsvButton
              onClick={() => statement && exportStatementCsv(statement)}
              disabled={!statement || statement.rows.length === 0}
            />
            <button
              onClick={downloadPdf}
              disabled={downloading || !statement}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              ⬇ PDF
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-zinc-500">
            From
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
              className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-900"
            />
          </label>
          <label className="flex items-center gap-1.5 text-zinc-500">
            To
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
              className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-900"
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-400">
          Loading statement…
        </div>
      ) : statement ? (
        <StatementView statement={statement} />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-red-500">
          Failed to load statement
        </div>
      )}
    </div>
  );
}

function PresetChip({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function StatementView({ statement }: { statement: Statement }) {
  // Debit-side summary: invoices + customer debit notes.
  const totalInvoiced = statement.rows.filter((r) => r.type === 'invoice' || r.type === 'customer_debit_note').reduce((s, r) => s + r.debit, 0);
  // Credit-side summary: receipts + credit notes.
  const totalReceived = statement.rows.filter((r) => r.type === 'receipt' || r.type === 'credit_note').reduce((s, r) => s + r.credit, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Opening" value={statement.openingBalance} />
        <SummaryCard label="Invoiced" value={totalInvoiced} tone="neutral" />
        <SummaryCard label="Received" value={totalReceived} tone="positive" />
        <SummaryCard label="Closing" value={statement.closingBalance} tone="due" />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="hidden sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Date</th>
                <th className="px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Description</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Debit</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Credit</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100 bg-zinc-50/50">
                <td className="px-3 py-2.5 text-zinc-600">{formatDate(statement.fromDate)}</td>
                <td className="px-3 py-2.5 italic text-zinc-500">Opening Balance</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-zinc-900">
                  {formatINR(statement.openingBalance)}
                </td>
              </tr>
              {statement.rows.map((row, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-b-0">
                  <td className="px-3 py-2.5 text-zinc-600">{formatDate(row.date)}</td>
                  <td className="px-3 py-2.5 text-zinc-900">
                    <StatementDescription row={row} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-900">
                    {row.debit > 0 ? formatINR(row.debit) : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-600">
                    {row.credit > 0 ? formatINR(row.credit) : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium tabular-nums text-zinc-900">
                    {formatINR(row.runningBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-zinc-100 sm:hidden">
          <div className="bg-zinc-50/50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="italic text-zinc-500">Opening · {formatDate(statement.fromDate)}</span>
              <span className="font-mono font-semibold text-zinc-900">{formatINR(statement.openingBalance)}</span>
            </div>
          </div>
          {statement.rows.map((row, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500">{formatDate(row.date)}</p>
                  <p className="mt-0.5 text-sm text-zinc-900">
                    <StatementDescription row={row} />
                  </p>
                </div>
                <div className="text-right">
                  {row.debit > 0 && <p className="text-sm font-mono text-zinc-900">+{formatINR(row.debit)}</p>}
                  {row.credit > 0 && <p className="text-sm font-mono text-emerald-600">−{formatINR(row.credit)}</p>}
                  <p className="text-[10px] text-zinc-400">Bal: {formatINR(row.runningBalance)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <span className="text-sm font-medium text-zinc-700">Closing as of {formatDate(statement.toDate)}</span>
          <span className="font-mono text-base font-semibold text-red-600">{formatINR(statement.closingBalance)}</span>
        </div>
      </div>

      <p className="text-center text-xs text-zinc-400">
        Reply within 7 days if anything looks off — after that, statement is considered confirmed.
      </p>
    </>
  );
}

function StatementDescription({ row }: { row: StatementRow }) {
  if (!row.entityId || row.type === 'credit_note' || row.type === 'customer_debit_note') {
    return <span>{row.description}</span>;
  }
  const target = row.type === 'invoice' ? `invoice/${row.entityId}` : `payment/${row.entityId}`;
  return (
    <a
      href={`#${target}`}
      className="text-indigo-600 hover:text-indigo-700 hover:underline"
    >
      {row.description}
    </a>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'positive' | 'due';
}) {
  const valueColor =
    tone === 'positive' ? 'text-emerald-600' : tone === 'due' ? 'text-red-600' : 'text-zinc-900';
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums sm:text-base ${valueColor}`}>{formatINR(value)}</p>
    </div>
  );
}

function ExportCsvButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      ⬇ CSV
    </button>
  );
}

function csvDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function exportOutstandingCsv(invoices: PortalInvoice[]): void {
  const today = new Date();
  const rows = invoices.map((inv) => {
    const due = new Date(inv.dueDate);
    const status = due < today ? 'Overdue' : inv.pendingClaim ? 'Payment reported' : 'Open';
    return [
      inv.invoiceNumber,
      csvDate(inv.invoiceDate),
      csvDate(inv.dueDate),
      inv.totalAmount.toFixed(2),
      inv.balanceDue.toFixed(2),
      status,
    ];
  });
  downloadCSV(
    `outstanding-${todayStamp()}.csv`,
    ['Invoice #', 'Issued', 'Due', 'Total', 'Balance Due', 'Status'],
    rows,
  );
}

function exportStatementCsv(statement: Statement): void {
  const rows: (string | number)[][] = [];
  rows.push([csvDate(statement.fromDate), 'Opening Balance', '', '', statement.openingBalance.toFixed(2)]);
  for (const r of statement.rows) {
    rows.push([
      csvDate(r.date),
      r.description,
      r.debit > 0 ? r.debit.toFixed(2) : '',
      r.credit > 0 ? r.credit.toFixed(2) : '',
      r.runningBalance.toFixed(2),
    ]);
  }
  rows.push([csvDate(statement.toDate), 'Closing Balance', '', '', statement.closingBalance.toFixed(2)]);
  downloadCSV(
    `statement-${statement.fromDate}-to-${statement.toDate}.csv`,
    ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
    rows,
  );
}

function exportPaymentsCsv(payments: ReceiptPayment[]): void {
  const rows: (string | number)[][] = [];
  for (const p of payments) {
    const unallocated = (p.totalAmount - p.allocatedTotal).toFixed(2);
    const invoiceList = p.allocations.map((a) => `${a.invoiceNumber}: ${a.amount.toFixed(2)}`).join('; ');
    rows.push([
      csvDate(p.receiptDate),
      p.method.replace(/_/g, ' '),
      p.referenceNumber ?? '',
      p.totalAmount.toFixed(2),
      p.allocatedTotal.toFixed(2),
      unallocated,
      p.allocations.length,
      invoiceList,
      p.notes ?? '',
    ]);
  }
  downloadCSV(
    `payments-${todayStamp()}.csv`,
    ['Date', 'Method', 'Reference', 'Amount', 'Applied', 'Unapplied', 'Invoice Count', 'Invoices', 'Notes'],
    rows,
  );
}

function exportClaimsCsv(claims: PaymentClaim[]): void {
  const rows: (string | number)[][] = [];
  for (const c of claims) {
    const invoiceList = c.invoices.map((a) => `${a.invoiceNumber}: ${a.amount.toFixed(2)}`).join('; ');
    rows.push([
      csvDate(c.claimDate),
      paymentMethodLabel(c.paymentMethod),
      c.referenceNumber ?? '',
      c.claimedAmount.toFixed(2),
      c.status,
      c.invoices.length,
      invoiceList,
      c.notes ?? '',
    ]);
  }
  downloadCSV(
    `payment-reports-${todayStamp()}.csv`,
    ['Date', 'Method', 'Reference', 'Amount', 'Status', 'Invoice Count', 'Invoices', 'Notes'],
    rows,
  );
}

function SelectionBar({
  count,
  total,
  onClear,
  onMark,
}: {
  count: number;
  total: number;
  onClear: () => void;
  onMark: () => void;
}) {
  return (
    <div className="sticky bottom-3 z-30">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-900 px-4 py-3 text-white shadow-lg">
        <div>
          <p className="text-xs text-zinc-400">
            {count} invoice{count !== 1 ? 's' : ''} selected
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums">{formatINR(total)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClear}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Clear
          </button>
          <button
            onClick={onMark}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Mark as paid
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkPaidModal({
  ctx,
  invoiceIds,
  total,
  onClose,
  onSuccess,
}: {
  ctx: PortalCtx;
  invoiceIds: string[];
  total: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [claimDate, setClaimDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState('neft');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const { base, qs } = buildApiBase(ctx);
      const sep = qs ? '&' : '?';
      const res = await portalFetch(ctx, `${base}/payment-claims${qs}${sep}`.replace(/[&?]$/, ''), {
        method: 'POST',
        body: JSON.stringify({
          claimDate,
          paymentMethod,
          referenceNumber: referenceNumber.trim() || null,
          notes: notes.trim() || null,
          invoiceIds,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.message || 'Failed to mark as paid. Please try again.');
        return;
      }
      onSuccess();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-900">Mark as paid</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {invoiceIds.length} invoice{invoiceIds.length !== 1 ? 's' : ''} · {formatINR(total)}
          </p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            We'll confirm the payment after our bank reconciliation. Until then, these invoices will show
            as <strong>Payment reported</strong>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-zinc-600">
              Payment date
              <input
                type="date"
                value={claimDate}
                max={today}
                onChange={(e) => setClaimDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-600">
              Method
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-zinc-600">
            Reference / UTR <span className="text-zinc-400">(optional)</span>
            <input
              type="text"
              value={referenceNumber}
              maxLength={100}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="e.g. NEFT UTR or cheque #"
              className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
            />
          </label>
          <label className="block text-xs text-zinc-600">
            Notes <span className="text-zinc-400">(optional)</span>
            <textarea
              value={notes}
              maxLength={500}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Marking…' : 'Mark as paid'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportsTab({ ctx }: { ctx: PortalCtx }) {
  const [claims, setClaims] = useState<PaymentClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { base, qs } = buildApiBase(ctx);
      const res = await portalFetch(ctx, `${base}/payment-claims${qs}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setClaims(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function cancelClaim(id: string) {
    if (!confirm('Cancel this payment report? The invoices will become outstanding again.')) return;
    setCancelling(id);
    try {
      const { base, qs } = buildApiBase(ctx);
      const sep = qs ? '?' : '';
      await portalFetch(ctx, `${base}/payment-claims/${id}${sep}${qs.replace(/^\?/, '')}`, { method: 'DELETE' });
      await load();
    } finally {
      setCancelling(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-400">
        Loading reports…
      </div>
    );
  }
  if (claims.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center">
        <div className="mb-2 text-4xl">📩</div>
        <p className="text-base font-medium text-zinc-900">No payment reports yet</p>
        <p className="mt-1 text-sm text-zinc-500">
          When you mark invoices as paid on the Outstanding tab, they'll appear here pending verification.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportCsvButton onClick={() => exportClaimsCsv(claims)} disabled={claims.length === 0} />
      </div>
      {claims.map((c) => (
        <ClaimCard key={c.id} claim={c} onCancel={() => cancelClaim(c.id)} cancelling={cancelling === c.id} />
      ))}
    </div>
  );
}

function ClaimCard({
  claim,
  onCancel,
  cancelling,
}: {
  claim: PaymentClaim;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusTone =
    claim.status === 'verified'
      ? 'bg-emerald-50 text-emerald-700'
      : claim.status === 'pending'
        ? 'bg-amber-50 text-amber-700'
        : claim.status === 'rejected'
          ? 'bg-red-50 text-red-700'
          : 'bg-zinc-100 text-zinc-600';
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900">{formatDate(claim.claimDate)}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-700">
              {paymentMethodLabel(claim.paymentMethod)}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusTone}`}>
              {claim.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {claim.referenceNumber ? `Ref: ${claim.referenceNumber} · ` : ''}
            {claim.invoices.length} invoice{claim.invoices.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold tabular-nums text-zinc-900">
            {formatINR(claim.claimedAmount)}
          </span>
          <span className={`text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50/50">
          {claim.notes && (
            <div className="px-4 py-2 text-xs text-zinc-600">
              <span className="font-medium text-zinc-500">Notes: </span>
              {claim.notes}
            </div>
          )}
          <div className="px-4 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Applied to</p>
          </div>
          <div className="divide-y divide-zinc-100">
            {claim.invoices.map((a) => (
              <div key={a.invoiceId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <a
                  href={`#invoice/${a.invoiceId}`}
                  className="font-mono text-indigo-600 hover:underline"
                >
                  {a.invoiceNumber}
                </a>
                <span className="font-mono tabular-nums text-zinc-900">{formatINR(a.amount)}</span>
              </div>
            ))}
          </div>
          {claim.status === 'pending' && (
            <div className="border-t border-zinc-100 px-4 py-2.5 text-right">
              <button
                onClick={onCancel}
                disabled={cancelling}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel this report'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentsTab({ ctx }: { ctx: PortalCtx }) {
  const [payments, setPayments] = useState<ReceiptPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const { base, qs } = buildApiBase(ctx);
      const res = await portalFetch(ctx, `${base}/payments${qs}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPayments(data.data);
    } finally {
      setLoading(false);
    }
  }

  function openPayment(receiptId: string) {
    window.location.hash = `payment/${receiptId}`;
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-400">
        Loading payments…
      </div>
    );
  }
  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center">
        <div className="mb-2 text-4xl">💳</div>
        <p className="text-base font-medium text-zinc-900">No payments yet</p>
        <p className="mt-1 text-sm text-zinc-500">Payment history will appear here once received.</p>
      </div>
    );
  }

  const totalReceived = payments.reduce((s, p) => s + p.totalAmount, 0);
  const totalApplied = payments.reduce((s, p) => s + p.allocatedTotal, 0);
  const totalUnapplied = totalReceived - totalApplied;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportCsvButton onClick={() => exportPaymentsCsv(payments)} disabled={payments.length === 0} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total Received" value={totalReceived} tone="positive" />
        <SummaryCard label="Applied" value={totalApplied} tone="neutral" />
        <SummaryCard label="Unapplied" value={totalUnapplied} tone={totalUnapplied > 0.01 ? 'due' : 'neutral'} />
        <StatCard label="Payments" value={String(payments.length)} />
      </div>

      <div className="sm:hidden space-y-3">
        {payments.map((p) => (
          <PaymentCard key={p.receiptId} payment={p} onClick={() => openPayment(p.receiptId)} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Date</th>
              <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Method</th>
              <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Reference</th>
              <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Applied to</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const unallocated = p.totalAmount - p.allocatedTotal;
              return (
                <tr
                  key={p.receiptId}
                  onClick={() => openPayment(p.receiptId)}
                  className="cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3 text-zinc-900">{formatDate(p.receiptDate)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-700">
                      {p.method.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {p.referenceNumber || <span className="text-zinc-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {p.allocations.length} invoice{p.allocations.length !== 1 ? 's' : ''}
                    {unallocated > 0.01 && (
                      <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                        {formatINR(unallocated)} unapplied
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-emerald-600">
                    {formatINR(p.totalAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-200 bg-zinc-50">
              <td colSpan={4} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">
                Total Received
              </td>
              <td className="px-4 py-3 text-right font-mono text-base font-semibold tabular-nums text-emerald-600">
                {formatINR(totalReceived)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function PaymentCard({ payment, onClick }: { payment: ReceiptPayment; onClick: () => void }) {
  const unallocated = payment.totalAmount - payment.allocatedTotal;
  return (
    <button
      onClick={onClick}
      className="block w-full overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900">{formatDate(payment.receiptDate)}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              {payment.method.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {payment.referenceNumber ? `Ref: ${payment.referenceNumber} · ` : ''}
            Applied to {payment.allocations.length} invoice{payment.allocations.length !== 1 ? 's' : ''}
            {unallocated > 0.01 && (
              <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                {formatINR(unallocated)} unapplied
              </span>
            )}
          </p>
        </div>
        <span className="font-mono text-base font-semibold tabular-nums text-emerald-600">
          {formatINR(payment.totalAmount)}
        </span>
      </div>
    </button>
  );
}

function PaymentView({ ctx, paymentId }: { ctx: PortalCtx; paymentId: string }) {
  const [payment, setPayment] = useState<ReceiptPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { base, qs } = buildApiBase(ctx);
        const res = await portalFetch(ctx, `${base}/payments${qs}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        const found = (data.data as ReceiptPayment[]).find((p) => p.receiptId === paymentId);
        if (!found) setNotFound(true);
        else setPayment(found);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ctx, paymentId]);

  function goBack() {
    window.history.back();
  }

  function openInvoice(invoiceId: string) {
    window.location.hash = `invoice/${invoiceId}`;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-zinc-500">Loading payment…</div>
    );
  }
  if (notFound || !payment) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <button
          onClick={goBack}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          ← Back
        </button>
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
          Payment not found.
        </div>
      </div>
    );
  }

  const unallocated = payment.totalAmount - payment.allocatedTotal;
  const today = new Date();

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
      <button
        onClick={goBack}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        ← Back
      </button>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Payment received</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">{formatINR(payment.totalAmount)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <span>{formatDate(payment.receiptDate)}</span>
              <span className="text-zinc-300">·</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-700">
                {payment.method.replace(/_/g, ' ')}
              </span>
              {payment.referenceNumber && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="font-mono text-xs">Ref: {payment.referenceNumber}</span>
                </>
              )}
            </div>
            {payment.notes && (
              <p className="mt-2 text-xs text-zinc-500">{payment.notes}</p>
            )}
          </div>
          <div className="text-right text-xs text-zinc-500">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Applied to {payment.allocations.length} invoice{payment.allocations.length !== 1 ? 's' : ''}
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-zinc-900 sm:text-base">
              {formatINR(payment.allocatedTotal)}
            </p>
            {unallocated > 0.01 && (
              <p className="mt-1">
                Unapplied:{' '}
                <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono tabular-nums text-amber-700">
                  {formatINR(unallocated)}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div>
        {payment.allocations.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            This payment has not been applied to any invoice yet.
          </div>
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {payment.allocations.map((a) => (
                <AllocationCard key={a.invoiceId} a={a} onClick={() => openInvoice(a.invoiceId)} />
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Invoice #</th>
                    <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Issued</th>
                    <th className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Due</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Invoice Total</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Applied</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-zinc-500">Balance Due</th>
                  </tr>
                </thead>
                <tbody>
                  {payment.allocations.map((a) => {
                    const isOverdue = a.dueDate && new Date(a.dueDate) < today && a.balanceDue > 0;
                    return (
                      <tr
                        key={a.invoiceId}
                        onClick={() => openInvoice(a.invoiceId)}
                        className="cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-medium text-indigo-600 hover:underline">
                            {a.invoiceNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{a.invoiceDate ? formatDate(a.invoiceDate) : '—'}</td>
                        <td className={`px-4 py-3 ${isOverdue ? 'font-medium text-red-600' : 'text-zinc-600'}`}>
                          {a.dueDate ? formatDate(a.dueDate) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-500">
                          {formatINR(a.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-emerald-600">
                          {formatINR(a.amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900">
                          {formatINR(a.balanceDue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-200 bg-zinc-50">
                    <td colSpan={4} className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Total Applied
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-base font-semibold tabular-nums text-emerald-600">
                      {formatINR(payment.allocatedTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AllocationCard({ a, onClick }: { a: ReceiptAllocation; onClick: () => void }) {
  const isOverdue = a.dueDate && new Date(a.dueDate) < new Date() && a.balanceDue > 0;
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-indigo-600">{a.invoiceNumber}</span>
            {isOverdue && (
              <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-red-600">
                Overdue
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Issued {a.invoiceDate ? formatDate(a.invoiceDate) : '—'} · Due {a.dueDate ? formatDate(a.dueDate) : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-emerald-600">{formatINR(a.amount)}</p>
          <p className="text-[10px] text-zinc-400">Bal: {formatINR(a.balanceDue)}</p>
        </div>
      </div>
    </button>
  );
}

function Footer() {
  return (
    <div className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-1.5 px-4 py-4 text-xs text-zinc-400">
        Powered by
        <img src={`${import.meta.env.BASE_URL}runq-dark.png`} alt="runQ" className="h-3.5" />
      </div>
    </div>
  );
}

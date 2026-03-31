import { useEffect, useState } from 'react';

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
  upiLink: { deepLink: string; qrData: string } | null;
}

interface PaymentHistoryEntry {
  id: string;
  receiptDate: string;
  amount: number;
  paymentMethod: string;
  invoiceNumber: string;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function getPortalContext(): { mode: 'slug'; slug: string } | { mode: 'token'; token: string } | null {
  const match = window.location.pathname.match(/^\/portal\/s\/([a-z0-9]+)/i);
  if (match) return { mode: 'slug', slug: match[1] };
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) return { mode: 'token', token };
  return null;
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
      className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function PortalPage() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.remove('dark');

    const ctx = getPortalContext();
    if (!ctx) {
      setError('Invalid portal link');
      setLoading(false);
      return;
    }
    void loadData(ctx);

    return () => {
      document.documentElement.classList.add('dark');
    };
  }, []);

  async function loadData(ctx: { mode: 'slug'; slug: string } | { mode: 'token'; token: string }) {
    try {
      const base = ctx.mode === 'slug'
        ? `/api/v1/ar/portal/s/${ctx.slug}`
        : `/api/v1/ar/portal`;
      const qs = ctx.mode === 'token' ? `?token=${encodeURIComponent(ctx.token)}` : '';

      const [invRes, histRes] = await Promise.all([
        fetch(`${base}/invoices${qs}`),
        fetch(`${base}/history${qs}`),
      ]);

      if (!invRes.ok || !histRes.ok) {
        setError('Invalid or expired link');
        return;
      }

      const invData = await invRes.json();
      const histData = await histRes.json();

      setCompanyName(invData.companyName);
      setCustomerName(invData.customerName);
      setInvoices(invData.data);
      setHistory(histData.data);
    } catch {
      setError('Failed to load portal data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-zinc-500">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-red-500">
        {error}
      </div>
    );
  }

  const totalDue = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{companyName}</h1>
            <p className="mt-0.5 text-sm text-zinc-500">Payment portal for {customerName}</p>
          </div>
          {totalDue > 0 && (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Total Due</p>
              <p className="text-lg font-semibold tabular-nums text-red-600">{formatINR(totalDue)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        {/* Outstanding Invoices */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Outstanding Invoices
          </h2>
          {invoices.length === 0 ? (
            <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-400">
              No outstanding invoices. You're all caught up!
            </p>
          ) : (
            <InvoiceTable invoices={invoices} />
          )}
        </div>

        {/* Payment History */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Payment History
          </h2>
          {history.length === 0 ? (
            <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-400">
              No payment history yet.
            </p>
          ) : (
            <HistoryTable history={history} />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 bg-white mt-8">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-center gap-1.5 text-xs text-zinc-400">
          Powered by
          <span className="inline-flex items-center rounded bg-zinc-900 px-1.5 py-0.5">
            <img src="/logo.svg" alt="runQ" className="h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: PortalInvoice[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50">
          <tr>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Invoice #</th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Date</th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Due Date</th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400 text-right">Balance Due</th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Pay</th>
          </tr>
        </thead>
        <tbody className="text-zinc-700">
          {invoices.map((inv) => {
            const isOverdue = new Date(inv.dueDate) < new Date();
            return (
              <tr key={inv.id} className="border-b border-zinc-100 last:border-b-0">
                <td className="px-3 py-2.5 font-mono text-xs font-medium text-zinc-900">{inv.invoiceNumber}</td>
                <td className="px-3 py-2.5 text-zinc-600">{inv.invoiceDate}</td>
                <td className="px-3 py-2.5">
                  <span className={isOverdue ? 'font-medium text-red-600' : 'text-zinc-600'}>
                    {inv.dueDate}
                  </span>
                  {isOverdue && (
                    <span className="ml-1.5 inline-block rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                      Overdue
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-medium text-zinc-900">{formatINR(inv.balanceDue)}</td>
                <td className="px-3 py-2.5">
                  {inv.upiLink ? (
                    <span className="flex items-center">
                      <a
                        href={inv.upiLink.deepLink}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                      >
                        Pay via UPI
                      </a>
                      <CopyButton text={inv.upiLink.deepLink} />
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-300">--</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTable({ history }: { history: PaymentHistoryEntry[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50">
          <tr>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Date</th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Invoice #</th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">Method</th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="text-zinc-700">
          {history.map((h) => (
            <tr key={h.id} className="border-b border-zinc-100 last:border-b-0">
              <td className="px-3 py-2.5 text-zinc-600">{h.receiptDate}</td>
              <td className="px-3 py-2.5 font-mono text-xs">{h.invoiceNumber}</td>
              <td className="px-3 py-2.5 capitalize text-zinc-600">{h.paymentMethod.replace(/_/g, ' ')}</td>
              <td className="px-3 py-2.5 text-right font-mono font-medium text-emerald-600">{formatINR(h.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

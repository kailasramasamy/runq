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

function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
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
      className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
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
    const token = getTokenFromUrl();
    if (!token) {
      setError('Missing portal token');
      setLoading(false);
      return;
    }
    void loadData(token);
  }, []);

  async function loadData(token: string) {
    try {
      const [invRes, histRes] = await Promise.all([
        fetch(`/api/v1/ar/portal/invoices?token=${encodeURIComponent(token)}`),
        fetch(`/api/v1/ar/portal/history?token=${encodeURIComponent(token)}`),
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
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-500">{error}</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{companyName}</h1>
      <p className="mt-1 text-sm text-zinc-500">Payment portal for {customerName}</p>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Outstanding Invoices
      </h2>
      {invoices.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No outstanding invoices.</p>
      ) : (
        <InvoiceTable invoices={invoices} />
      )}

      <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Payment History
      </h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No payment history.</p>
      ) : (
        <HistoryTable history={history} />
      )}
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: PortalInvoice[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-zinc-50 dark:bg-zinc-800">
          <tr>
            <th className="px-3 py-2">Invoice #</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Due Date</th>
            <th className="px-3 py-2 text-right">Balance Due</th>
            <th className="px-3 py-2">Pay</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b last:border-b-0 dark:border-zinc-700">
              <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
              <td className="px-3 py-2">{inv.invoiceDate}</td>
              <td className="px-3 py-2">{inv.dueDate}</td>
              <td className="px-3 py-2 text-right font-mono">{formatINR(inv.balanceDue)}</td>
              <td className="px-3 py-2">
                {inv.upiLink ? (
                  <span className="flex items-center">
                    <a
                      href={inv.upiLink.deepLink}
                      className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Pay via UPI
                    </a>
                    <CopyButton text={inv.upiLink.deepLink} />
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTable({ history }: { history: PaymentHistoryEntry[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-zinc-50 dark:bg-zinc-800">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Invoice #</th>
            <th className="px-3 py-2">Method</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-b last:border-b-0 dark:border-zinc-700">
              <td className="px-3 py-2">{h.receiptDate}</td>
              <td className="px-3 py-2 font-mono text-xs">{h.invoiceNumber}</td>
              <td className="px-3 py-2 capitalize">{h.paymentMethod.replace(/_/g, ' ')}</td>
              <td className="px-3 py-2 text-right font-mono text-emerald-600">{formatINR(h.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

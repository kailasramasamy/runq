import { useEffect, useState } from 'react';

interface VendorPortalInfo {
  companyName: string;
  vendorName: string;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string;
  totalAmount: number;
  status: string;
}

interface Bill {
  id: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
}

interface PaymentEntry {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  billNumber: string;
}

type Tab = 'po' | 'bills' | 'payments';

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

function getSlug(): string | null {
  const match = window.location.pathname.match(/^\/vendor-portal\/s\/([a-z0-9]+)/i);
  return match ? match[1] : null;
}

export function VendorPortalPage() {
  const [info, setInfo] = useState<VendorPortalInfo | null>(null);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [tab, setTab] = useState<Tab>('bills');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slug = getSlug();
    if (!slug) { setError('Invalid vendor portal link'); setLoading(false); return; }
    void loadData(slug);
  }, []);

  async function loadData(slug: string) {
    try {
      const base = `/api/v1/ap/vendor-portal/s/${slug}`;
      const [infoRes, poRes, billRes, payRes] = await Promise.all([
        fetch(`${base}/info`),
        fetch(`${base}/purchase-orders`),
        fetch(`${base}/bills`),
        fetch(`${base}/payments`),
      ]);
      if (!infoRes.ok) { setError('Invalid or expired link'); return; }
      const infoData = await infoRes.json();
      setInfo(infoData.data ?? infoData);
      if (poRes.ok) setPos((await poRes.json()).data ?? []);
      if (billRes.ok) setBills((await billRes.json()).data ?? []);
      if (payRes.ok) setPayments((await payRes.json()).data ?? []);
    } catch {
      setError('Failed to load vendor portal data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">Loading...</div>;
  }
  if (error) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-red-500 dark:bg-zinc-900">{error}</div>;
  }

  const totalOutstanding = bills.reduce((s, b) => s + b.balanceDue, 0);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'po', label: 'Purchase Orders' },
    { key: 'bills', label: 'Outstanding Bills' },
    { key: 'payments', label: 'Payment History' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <div>
            <h1 className="text-xl font-bold">{info?.companyName}</h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Vendor portal for {info?.vendorName}</p>
          </div>
          {totalOutstanding > 0 && (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Outstanding</p>
              <p className="text-lg font-semibold tabular-nums text-red-600">{formatINR(totalOutstanding)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        {tab === 'po' && <POTable items={pos} />}
        {tab === 'bills' && <BillTable items={bills} />}
        {tab === 'payments' && <PaymentTable items={payments} />}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 bg-white mt-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-center gap-1.5 text-xs text-zinc-400">
          Powered by
          <span className="inline-flex items-center rounded bg-zinc-900 px-1.5 py-0.5 dark:bg-zinc-100">
            <img src="/logo.svg" alt="runQ" className="h-3.5 dark:invert" />
          </span>
        </div>
      </div>
    </div>
  );
}

const thClass = 'px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400';
const tdClass = 'px-3 py-2.5';
const tableWrap = 'overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800';
const emptyMsg = 'rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800';

function POTable({ items }: { items: PurchaseOrder[] }) {
  if (!items.length) return <p className={emptyMsg}>No purchase orders found.</p>;
  return (
    <div className={tableWrap}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <tr>
            <th className={thClass}>PO #</th>
            <th className={thClass}>Date</th>
            <th className={`${thClass} text-right`}>Amount</th>
            <th className={thClass}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((po) => (
            <tr key={po.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-700">
              <td className={`${tdClass} font-mono text-xs font-medium`}>{po.poNumber}</td>
              <td className={`${tdClass} text-zinc-600 dark:text-zinc-400`}>{po.poDate}</td>
              <td className={`${tdClass} text-right font-mono font-medium`}>{formatINR(po.totalAmount)}</td>
              <td className={tdClass}>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize dark:bg-zinc-700">{po.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillTable({ items }: { items: Bill[] }) {
  if (!items.length) return <p className={emptyMsg}>No outstanding bills.</p>;
  return (
    <div className={tableWrap}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <tr>
            <th className={thClass}>Bill #</th>
            <th className={thClass}>Date</th>
            <th className={thClass}>Due Date</th>
            <th className={`${thClass} text-right`}>Balance Due</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => {
            const overdue = new Date(b.dueDate) < new Date();
            return (
              <tr key={b.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-700">
                <td className={`${tdClass} font-mono text-xs font-medium`}>{b.billNumber}</td>
                <td className={`${tdClass} text-zinc-600 dark:text-zinc-400`}>{b.billDate}</td>
                <td className={tdClass}>
                  <span className={overdue ? 'font-medium text-red-600' : 'text-zinc-600 dark:text-zinc-400'}>{b.dueDate}</span>
                  {overdue && <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30">Overdue</span>}
                </td>
                <td className={`${tdClass} text-right font-mono font-medium text-red-600`}>{formatINR(b.balanceDue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentTable({ items }: { items: PaymentEntry[] }) {
  if (!items.length) return <p className={emptyMsg}>No payment history yet.</p>;
  return (
    <div className={tableWrap}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <tr>
            <th className={thClass}>Date</th>
            <th className={thClass}>Bill #</th>
            <th className={thClass}>Method</th>
            <th className={`${thClass} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-700">
              <td className={`${tdClass} text-zinc-600 dark:text-zinc-400`}>{p.paymentDate}</td>
              <td className={`${tdClass} font-mono text-xs`}>{p.billNumber}</td>
              <td className={`${tdClass} capitalize text-zinc-600 dark:text-zinc-400`}>{p.paymentMethod.replace(/_/g, ' ')}</td>
              <td className={`${tdClass} text-right font-mono font-medium text-emerald-600`}>{formatINR(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

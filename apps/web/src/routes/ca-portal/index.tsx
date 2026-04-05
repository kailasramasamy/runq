import { useState, useEffect } from 'react';
import { useParams, useSearch } from '@tanstack/react-router';
import { FileSpreadsheet, BookOpen, Receipt, Download, ArrowDownToLine } from 'lucide-react';

const API_BASE = '';

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);
}

function defaultPeriod() {
  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { dateFrom: `${fy}-04-01`, dateTo: now.toISOString().slice(0, 10) };
}

type Tab = 'reports' | 'trial-balance' | 'journal' | 'sales' | 'purchase' | 'export';

export function CAPortalPage() {
  const params = useParams({ strict: false }) as { slug?: string };
  const slug = params.slug ?? '';

  const [company, setCompany] = useState<{ name: string; gstin?: string; address?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('reports');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) { setError('Invalid portal link'); setLoading(false); return; }
    fetch(`${API_BASE}/api/v1/ca/s/${slug}/info`)
      .then((r) => r.json())
      .then((d) => { setCompany(d.data); setLoading(false); })
      .catch(() => { setError('Invalid or expired portal link'); setLoading(false); });
  }, [slug]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-zinc-500">Loading...</div>;
  if (error) return <div className="flex min-h-screen items-center justify-center text-red-500">{error}</div>;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'reports', label: 'Financial Reports', icon: <FileSpreadsheet size={16} /> },
    { id: 'trial-balance', label: 'Trial Balance', icon: <BookOpen size={16} /> },
    { id: 'journal', label: 'Journal Entries', icon: <Receipt size={16} /> },
    { id: 'sales', label: 'Sales Register', icon: <Receipt size={16} /> },
    { id: 'purchase', label: 'Purchase Register', icon: <Receipt size={16} /> },
    { id: 'export', label: 'Tally Export', icon: <Download size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{company?.name}</h1>
              <p className="text-sm text-zinc-500">CA Portal — Read-only access</p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              {company?.gstin && <p>GSTIN: {company.gstin}</p>}
              {company?.address && <p>{company.address}</p>}
            </div>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {tab === 'reports' && <ReportsTab slug={slug} />}
        {tab === 'trial-balance' && <TrialBalanceTab slug={slug} />}
        {tab === 'journal' && <JournalTab slug={slug} />}
        {tab === 'sales' && <RegisterTab slug={slug} type="sales" />}
        {tab === 'purchase' && <RegisterTab slug={slug} type="purchase" />}
        {tab === 'export' && <ExportTab slug={slug} />}
      </main>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────

function PeriodSelector({ dateFrom, dateTo, onChange }: {
  dateFrom: string; dateTo: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="mb-4 flex gap-2 items-end">
      <label className="text-sm">
        <span className="block text-xs text-zinc-500 mb-1">From</span>
        <input type="date" value={dateFrom} onChange={(e) => onChange(e.target.value, dateTo)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]" />
      </label>
      <label className="text-sm">
        <span className="block text-xs text-zinc-500 mb-1">To</span>
        <input type="date" value={dateTo} onChange={(e) => onChange(dateFrom, e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]" />
      </label>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-800/50">
          <tr>{headers.map((h, i) => <th key={i} className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-3 py-6 text-center text-zinc-400">No data</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2 ${typeof cell === 'number' ? 'text-right font-mono' : ''}`}>
                  {typeof cell === 'number' ? formatINR(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {children}
    </div>
  );
}

// ─── Reports Tab ────────────────────────────────────────────────────────────

function ReportsTab({ slug }: { slug: string }) {
  const { dateFrom: df, dateTo: dt } = defaultPeriod();
  const [dateFrom, setDateFrom] = useState(df);
  const [dateTo, setDateTo] = useState(dt);
  const [pnl, setPnl] = useState<any>(null);
  const [bs, setBs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [pnlRes, bsRes] = await Promise.all([
        fetch(`/api/v1/ca/s/${slug}/profit-and-loss?dateFrom=${dateFrom}&dateTo=${dateTo}`).then((r) => r.json()),
        fetch(`/api/v1/ca/s/${slug}/balance-sheet?asOfDate=${dateTo}`).then((r) => r.json()),
      ]);
      setPnl(pnlRes.data);
      setBs(bsRes.data);
    } catch (err) {
      setError('Failed to load reports');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  return (
    <div>
      <PeriodSelector dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      {loading ? <p className="text-sm text-zinc-500">Loading reports...</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pnl && (
            <SectionCard title={`Profit & Loss (${dateFrom} to ${dateTo})`}>
              <DataTable
                headers={['Account', 'Amount']}
                rows={[
                  ...pnl.revenue.map((r: any) => [r.accountName, r.amount]),
                  ['Total Revenue', pnl.totalRevenue],
                  ['Gross Profit', pnl.grossProfit],
                  ...pnl.operatingExpenses.map((r: any) => [r.accountName, r.amount]),
                  ['Operating Profit', pnl.operatingProfit],
                  ['Net Profit', pnl.netProfit],
                ]}
              />
            </SectionCard>
          )}

          {bs && (
            <SectionCard title={`Balance Sheet (as of ${dateTo})`}>
              <DataTable
                headers={['Account', 'Amount']}
                rows={[
                  ...bs.assets.map((r: any) => [r.accountName, r.amount]),
                  ['Total Assets', bs.totalAssets],
                  ...bs.liabilities.map((r: any) => [r.accountName, r.amount]),
                  ['Total Liabilities', bs.totalLiabilities],
                  ...bs.equity.map((r: any) => [r.accountName, r.amount]),
                  ['Total Equity', bs.totalEquity],
                ]}
              />
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Trial Balance Tab ──────────────────────────────────────────────────────

function TrialBalanceTab({ slug }: { slug: string }) {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`${API_BASE}/api/v1/ca/s/${slug}/trial-balance?asOfDate=${asOfDate}`).then((r) => r.json());
    setData(res.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [asOfDate]);

  return (
    <div>
      <div className="mb-4">
        <label className="text-sm">
          <span className="block text-xs text-zinc-500 mb-1">As of Date</span>
          <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark]" />
        </label>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading...</p> : data && (
        <SectionCard title={`Trial Balance — as of ${asOfDate}`}>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Code</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Account</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Type</th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">Debit</th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-600">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.accounts.map((a: any) => (
                  <tr key={a.code} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                    <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2 capitalize text-zinc-500">{a.type}</td>
                    <td className="px-3 py-2 text-right font-mono">{a.debit > 0 ? formatINR(a.debit) : ''}</td>
                    <td className="px-3 py-2 text-right font-mono">{a.credit > 0 ? formatINR(a.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-zinc-50 font-semibold dark:bg-zinc-800/50">
                <tr>
                  <td colSpan={3} className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right font-mono">{formatINR(data.totalDebit)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatINR(data.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ─── Journal Entries Tab ────────────────────────────────────────────────────

function JournalTab({ slug }: { slug: string }) {
  const { dateFrom: df, dateTo: dt } = defaultPeriod();
  const [dateFrom, setDateFrom] = useState(df);
  const [dateTo, setDateTo] = useState(dt);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`${API_BASE}/api/v1/ca/s/${slug}/journal-entries?dateFrom=${dateFrom}&dateTo=${dateTo}`).then((r) => r.json());
    setEntries(res.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  return (
    <div>
      <PeriodSelector dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      {loading ? <p className="text-sm text-zinc-500">Loading...</p> : (
        <div className="space-y-3">
          {entries.length === 0 ? (
            <p className="text-center text-sm text-zinc-400 py-8">No journal entries in this period.</p>
          ) : entries.map((e: any) => (
            <div key={e.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-medium">{e.entryNumber}</span>
                <span className="text-xs text-zinc-500">{e.entryDate}</span>
              </div>
              {e.narration && <p className="mb-2 text-xs text-zinc-500">{e.narration}</p>}
              <table className="w-full text-xs">
                <thead><tr>
                  <th className="text-left pb-1 text-zinc-500">Account</th>
                  <th className="text-right pb-1 text-zinc-500">Debit</th>
                  <th className="text-right pb-1 text-zinc-500">Credit</th>
                </tr></thead>
                <tbody>
                  {e.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="py-0.5">{l.accountCode} — {l.accountName}</td>
                      <td className="py-0.5 text-right font-mono">{l.debit > 0 ? formatINR(l.debit) : ''}</td>
                      <td className="py-0.5 text-right font-mono">{l.credit > 0 ? formatINR(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Invoice Register Tab ───────────────────────────────────────────────────

function RegisterTab({ slug, type }: { slug: string; type: 'sales' | 'purchase' }) {
  const { dateFrom: df, dateTo: dt } = defaultPeriod();
  const [dateFrom, setDateFrom] = useState(df);
  const [dateTo, setDateTo] = useState(dt);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const endpoint = type === 'sales' ? 'sales-register' : 'purchase-register';
  const partyLabel = type === 'sales' ? 'Customer' : 'Vendor';
  const partyField = type === 'sales' ? 'customerName' : 'vendorName';

  async function load() {
    setLoading(true);
    const res = await fetch(`${API_BASE}/api/v1/ca/s/${slug}/${endpoint}?dateFrom=${dateFrom}&dateTo=${dateTo}`).then((r) => r.json());
    setRows(res.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0);
  const totalTax = rows.reduce((s, r) => s + r.taxAmount, 0);

  return (
    <div>
      <PeriodSelector dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      {loading ? <p className="text-sm text-zinc-500">Loading...</p> : (
        <>
          <div className="mb-3 flex gap-4 text-sm">
            <span className="text-zinc-500">{rows.length} invoices</span>
            <span className="font-medium">Total: {formatINR(totalAmount)}</span>
            <span className="text-zinc-500">Tax: {formatINR(totalTax)}</span>
          </div>
          <DataTable
            headers={['Invoice #', 'Date', partyLabel, 'Total', 'Tax', 'Balance Due', 'Status']}
            rows={rows.map((r: any) => [
              r.invoiceNumber,
              r.invoiceDate,
              r[partyField],
              r.totalAmount,
              r.taxAmount,
              r.balanceDue,
              r.status,
            ])}
          />
        </>
      )}
    </div>
  );
}

// ─── Tally Export Tab ───────────────────────────────────────────────────────

function ExportTab({ slug }: { slug: string }) {
  const { dateFrom: df, dateTo: dt } = defaultPeriod();
  const [dateFrom, setDateFrom] = useState(df);
  const [dateTo, setDateTo] = useState(dt);

  function downloadVouchers() {
    window.open(`${API_BASE}/api/v1/ca/s/${slug}/export/tally-vouchers?dateFrom=${dateFrom}&dateTo=${dateTo}`, '_blank');
  }

  function downloadLedgers() {
    window.open(`${API_BASE}/api/v1/ca/s/${slug}/export/tally-ledgers`, '_blank');
  }

  return (
    <div>
      <PeriodSelector dateFrom={dateFrom} dateTo={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">Tally Vouchers</h3>
          <p className="mb-4 text-sm text-zinc-500">Export all transactions for the selected period as Tally-compatible XML.</p>
          <button onClick={downloadVouchers} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <ArrowDownToLine size={16} /> Download Vouchers XML
          </button>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">Tally Ledger Masters</h3>
          <p className="mb-4 text-sm text-zinc-500">Export the chart of accounts as Tally ledger masters XML.</p>
          <button onClick={downloadLedgers} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <ArrowDownToLine size={16} /> Download Ledgers XML
          </button>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useCustomers } from '@/hooks/queries/use-customers';
import {
  PageHeader, Button, Combobox, Select,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import { Split, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

type SplitRule = 'larger_per_day' | 'smaller_per_day';

interface SplitRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
}

interface Preview {
  sourceCustomerName: string;
  targetCustomerName: string;
  toMove: SplitRow[];
  daysSkipped: { date: string; reason: string }[];
}

const RULE_OPTIONS = [
  { value: 'larger_per_day', label: 'Larger amount each day → target' },
  { value: 'smaller_per_day', label: 'Smaller amount each day → target' },
];

export function CustomerSplitPage() {
  const qc = useQueryClient();
  const { data: customersData, isLoading: loadingCustomers } = useCustomers({ limit: 500 });
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rule, setRule] = useState<SplitRule>('larger_per_day');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ moved: number } | null>(null);

  const customerOptions = useMemo(() =>
    (customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [customersData],
  );

  function buildBody() {
    return { sourceCustomerId: sourceId, targetCustomerId: targetId, dateFrom, dateTo, rule };
  }

  function inputsReady(): boolean {
    return !!sourceId && !!targetId && sourceId !== targetId && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) && /^\d{4}-\d{2}-\d{2}$/.test(dateTo);
  }

  async function runPreview() {
    if (!inputsReady() || loading) return;
    setLoading(true); setError(null); setApplied(null);
    try {
      const res = await api.post<{ data: Preview }>('/audit/customer-split/preview', buildBody());
      setPreview(res.data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }

  async function runApply() {
    if (!preview || preview.toMove.length === 0 || loading) return;
    const ok = window.confirm(`Move ${preview.toMove.length} invoice${preview.toMove.length === 1 ? '' : 's'} from "${preview.sourceCustomerName}" to "${preview.targetCustomerName}"? This cannot be undone via the UI.`);
    if (!ok) return;
    setLoading(true); setError(null);
    try {
      const res = await api.post<{ data: { moved: number } }>('/audit/customer-split/apply', buildBody());
      setApplied(res.data);
      setPreview(null);
      // Invalidate any cached customer / invoice / analytics views — totals will move.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['customers'] }),
        qc.invalidateQueries({ queryKey: ['invoices'] }),
        qc.invalidateQueries({ queryKey: ['gap-scan'] }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setLoading(false);
    }
  }

  const total = preview ? preview.toMove.reduce((s, r) => s + r.totalAmount, 0) : 0;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Audit' }, { label: 'Customer split' }]}
        title="Customer split"
        description="Retro-attribute past invoices to the correct customer record after splitting one customer into two (e.g. a DC-level split). Picks one invoice per day by amount rule."
      />

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 lg:grid-cols-2">
        <Combobox
          label="From customer (current record)"
          options={customerOptions}
          value={sourceId}
          onChange={setSourceId}
          placeholder={loadingCustomers ? 'Loading customers…' : 'Pick the customer whose invoices need re-attributing'}
        />
        <Combobox
          label="To customer (target record)"
          options={customerOptions}
          value={targetId}
          onChange={setTargetId}
          placeholder={loadingCustomers ? 'Loading customers…' : 'Pick the customer to move invoices to'}
        />
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Date from</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Date to</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Rule</label>
          <Select
            options={RULE_OPTIONS}
            value={rule}
            onChange={(e) => setRule(e.target.value as SplitRule)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            For each invoice date in range, picks the matching invoice and reassigns it. GST shape must match between the two customers (same state + GSTIN) — otherwise the action will refuse.
          </p>
        </div>
        <div className="lg:col-span-2 flex items-center gap-2">
          <Button onClick={runPreview} disabled={!inputsReady() || loading} variant="outline">
            {loading && !preview ? <Loader2 size={14} className="animate-spin" /> : <Split size={14} />}
            Preview
          </Button>
          {preview && preview.toMove.length > 0 && (
            <Button onClick={runApply} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Apply ({preview.toMove.length} invoice{preview.toMove.length === 1 ? '' : 's'})
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {applied && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          Moved {applied.moved} invoice{applied.moved === 1 ? '' : 's'}. Run Preview again to confirm none remain, or refresh the customer pages to see updated balances.
        </div>
      )}

      {preview && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="text-sm">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {preview.toMove.length} invoice{preview.toMove.length === 1 ? '' : 's'} will move
              </span>
              {' '}
              <span className="text-zinc-500">
                from <strong>{preview.sourceCustomerName}</strong> → <strong>{preview.targetCustomerName}</strong>
              </span>
            </div>
            <span className="text-sm tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
              ₹{total.toLocaleString('en-IN')}
            </span>
          </div>

          {preview.toMove.length > 0 && (
            <Table>
              <TableHeader>
                <tr>
                  <Th>Date</Th>
                  <Th>Invoice #</Th>
                  <Th>Amount</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {preview.toMove.map((r) => (
                  <TableRow key={r.invoiceId}>
                    <TableCell className="text-xs text-zinc-500 whitespace-nowrap">{r.invoiceDate}</TableCell>
                    <TableCell className="text-sm">{r.invoiceNumber}</TableCell>
                    <TableCell className="text-sm tabular-nums">₹{r.totalAmount.toLocaleString('en-IN')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {preview.daysSkipped.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                {preview.daysSkipped.length} day{preview.daysSkipped.length === 1 ? '' : 's'} skipped
              </p>
              <ul className="space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                {preview.daysSkipped.slice(0, 20).map((d, i) => (
                  <li key={i}>{d.date} — {d.reason}</li>
                ))}
                {preview.daysSkipped.length > 20 && <li>…and {preview.daysSkipped.length - 20} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

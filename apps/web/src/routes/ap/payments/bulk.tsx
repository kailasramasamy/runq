import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { Plus, Trash2, Upload, Check, X } from 'lucide-react';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useVendors } from '@/hooks/queries/use-vendors';
import { useCreateBatchPayment, useImportBatchPayment } from '@/hooks/queries/use-payments';
import { useToast } from '@/components/ui';
import type { BatchPaymentResult, BatchImportResult } from '@runq/types';
import {
  PageHeader,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Button,
  Input,
  Select,
  DateInput,
  Textarea,
  Badge,
} from '@/components/ui';

// ─── Shared select helpers ──────────────────────────────────────────────────

function useBankAccountOptions() {
  const { data } = useBankAccounts();
  return [
    { value: '', label: 'Select bank account…' },
    ...(data?.data ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];
}

function useVendorOptions() {
  const { data } = useVendors({ limit: 100 });
  return [
    { value: '', label: 'Select vendor…' },
    ...(data?.data ?? []).map((v) => ({ value: v.id, label: v.name })),
  ];
}

// ─── Manual Batch Tab ────────────────────────────────────────────────────────

interface BatchRow {
  vendorId: string;
  amount: string;
  referenceNumber: string;
  notes: string;
}

function emptyRow(): BatchRow {
  return { vendorId: '', amount: '', referenceNumber: '', notes: '' };
}

function ManualBatchTab() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const bankAccountOptions = useBankAccountOptions();
  const vendorOptions = useVendorOptions();
  const createBatch = useCreateBatchPayment();

  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [rows, setRows] = useState<BatchRow[]>([emptyRow()]);

  const totalAmount = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  function updateRow(index: number, field: keyof BatchRow, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    const validRows = rows.filter((r) => r.vendorId && parseFloat(r.amount) > 0);
    if (!bankAccountId || !paymentDate || validRows.length === 0) {
      toast('Fill in bank account, date, and at least one valid payment row.', 'error');
      return;
    }
    createBatch.mutate(
      {
        bankAccountId,
        paymentMethod: 'bank_transfer',
        paymentDate,
        payments: validRows.map((r) => ({
          vendorId: r.vendorId,
          amount: parseFloat(r.amount),
          referenceNumber: r.referenceNumber || null,
          notes: r.notes || null,
        })),
      },
      {
        onSuccess: (res) => {
          const d = res.data as BatchPaymentResult;
          toast(`Created ${d.created} payments totalling ₹${d.totalAmount.toLocaleString('en-IN')}`, 'success');
          navigate({ to: '/ap/payments' });
        },
        onError: () => toast('Batch payment failed. Please try again.', 'error'),
      },
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Batch Details" />
        <CardContent className="flex flex-wrap gap-4">
          <div className="w-64">
            <Select label="Bank Account" required options={bankAccountOptions} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} />
          </div>
          <div className="w-44">
            <DateInput label="Payment Date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Payment Rows" />
        <CardContent className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="w-52">
                <Select label={i === 0 ? 'Vendor' : undefined} options={vendorOptions} value={row.vendorId} onChange={(e) => updateRow(i, 'vendorId', e.target.value)} />
              </div>
              <div className="w-32">
                <Input label={i === 0 ? 'Amount' : undefined} type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateRow(i, 'amount', e.target.value)} />
              </div>
              <div className="w-36">
                <Input label={i === 0 ? 'Reference' : undefined} placeholder="UTR / Ref" value={row.referenceNumber} onChange={(e) => updateRow(i, 'referenceNumber', e.target.value)} />
              </div>
              <div className="flex-1 min-w-[160px]">
                <Input label={i === 0 ? 'Notes' : undefined} placeholder="Optional notes" value={row.notes} onChange={(e) => updateRow(i, 'notes', e.target.value)} />
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
                className="mb-px p-2 text-zinc-400 hover:text-red-500 disabled:opacity-30"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={addRow}>
              <Plus size={16} /> Add Row
            </Button>
            <span className="text-sm text-zinc-500">
              Total: <span className="font-semibold text-zinc-900 dark:text-zinc-100">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </span>
          </div>
          <Button onClick={handleSubmit} loading={createBatch.isPending} disabled={!bankAccountId || !paymentDate}>
            Create {rows.filter((r) => r.vendorId && parseFloat(r.amount) > 0).length} Payments
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ─── CSV Preview Row ─────────────────────────────────────────────────────────

interface CsvPreviewRow {
  vendorName: string;
  amount: string;
  reference: string;
  notes: string;
}

function parseCsvPreview(csv: string): CsvPreviewRow[] {
  const lines = csv.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return { vendorName: cols[0] ?? '', amount: cols[1] ?? '', reference: cols[2] ?? '', notes: cols[3] ?? '' };
  }).filter((r) => r.vendorName);
}

// ─── CSV Import Tab ───────────────────────────────────────────────────────────

function CsvImportTab() {
  const { toast } = useToast();
  const bankAccountOptions = useBankAccountOptions();
  const importBatch = useImportBatchPayment();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [csvData, setCsvData] = useState('');
  const [preview, setPreview] = useState<CsvPreviewRow[]>([]);
  const [result, setResult] = useState<BatchImportResult | null>(null);

  function handlePreview() {
    const rows = parseCsvPreview(csvData);
    if (rows.length === 0) { toast('No data rows found. Check your CSV format.', 'error'); return; }
    setPreview(rows);
    setStep(3);
  }

  function handleImport() {
    if (importBatch.isPending) return;
    importBatch.mutate(
      { bankAccountId, paymentDate, csvData },
      {
        onSuccess: (res) => {
          const data = (res as any)?.data ?? res;
          setResult(data as BatchImportResult);
          setStep(4);
          toast(`${data.created} payment(s) created successfully.`, 'success');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        onError: () => toast('Import failed. Check your CSV and try again.', 'error'),
      },
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1. Select Bank Account & Date" />
        <CardContent className="flex flex-wrap gap-4">
          <div className="w-64">
            <Select label="Bank Account" required options={bankAccountOptions} value={bankAccountId} onChange={(e) => { setBankAccountId(e.target.value); if (step < 2) setStep(2); }} />
          </div>
          <div className="w-44">
            <DateInput label="Payment Date" required value={paymentDate} onChange={(e) => { setPaymentDate(e.target.value); if (step < 2) setStep(2); }} />
          </div>
        </CardContent>
      </Card>

      <Card className={!bankAccountId || !paymentDate ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader title="2. Paste CSV Data" />
        <CardContent>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            Expected columns: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">Vendor Name,Amount,Reference,Notes</code>
          </p>
          <p className="mb-3 font-mono text-xs text-zinc-400 dark:text-zinc-500">
            Gopal Sharma,87500,MC/MAR/001,5000L @ 17.50
          </p>
          <Textarea
            label="CSV Data"
            placeholder={`Vendor Name,Amount,Reference,Notes\nGopal Sharma,87500,MC/MAR/001,5000L @ 17.50`}
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            className="min-h-[140px] font-mono text-xs"
          />
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handlePreview} disabled={!csvData.trim()}>
            Preview Rows
          </Button>
        </CardFooter>
      </Card>

      {step >= 3 && preview.length > 0 && (
        <Card>
          <CardHeader title={`3. Preview — ${preview.length} row${preview.length !== 1 ? 's' : ''}`} />
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                  {['Vendor Name', 'Amount', 'Reference', 'Notes'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-2 font-medium">{row.vendorName}</td>
                    <td className="px-4 py-2 text-right font-mono">{row.amount}</td>
                    <td className="px-4 py-2 font-mono text-zinc-500">{row.reference || '—'}</td>
                    <td className="px-4 py-2 text-zinc-500">{row.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 20 && (
              <p className="px-4 py-2 text-xs text-zinc-400">… and {preview.length - 20} more rows</p>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <Button variant="outline" onClick={() => { setStep(2); setPreview([]); }}>Back</Button>
            <Button onClick={handleImport} loading={importBatch.isPending}>
              <Upload size={16} /> Import {preview.length} Rows
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 4 && result && (
        <>
          {/* Success banner */}
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-800/50">
                <Check size={22} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
                  Bulk Payment Complete
                </h3>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  {result.created} payment{result.created !== 1 ? 's' : ''} created
                  {result.created > 0 && <> — Total: <span className="font-semibold">₹{result.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></>}
                  {result.skipped > 0 && <>, {result.skipped} skipped</>}
                  {result.errors.length > 0 && <>, {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</>}
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <Card>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{result.created}</p>
                  <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Created</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-800 dark:bg-zinc-800/50">
                  <p className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">{result.skipped}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">Skipped</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-900/20">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">{result.errors.length}</p>
                  <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">Errors</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                  <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">Errors:</p>
                  <ul className="space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-600 dark:text-red-400">
                        Row {err.row} ({err.vendorName}): {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => { setStep(1); setResult(null); setPreview([]); setCsvData(''); }}>
                Import Another Batch
              </Button>
              <Link to="/ap/payments">
                <Button>Go to Payments</Button>
              </Link>
            </CardFooter>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'manual' | 'csv';

export function BulkPaymentPage() {
  const [activeTab, setActiveTab] = useState<Tab>('manual');

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title="Bulk Payment"
        breadcrumbs={[
          { label: 'AP', href: '/ap' },
          { label: 'Payments', href: '/ap/payments' },
          { label: 'Bulk Payment' },
        ]}
      />

      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {(['manual', 'csv'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200',
            ].join(' ')}
          >
            {tab === 'manual' ? 'API Batch' : 'CSV Import'}
          </button>
        ))}
      </div>

      {activeTab === 'manual' ? <ManualBatchTab /> : <CsvImportTab />}
    </div>
  );
}

import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, ArrowRight, FileSpreadsheet } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  DateInput,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  useToast,
} from '@/components/ui';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ApiSuccess } from '@runq/types';

type Step = 'trial-balance' | 'receivables' | 'payables' | 'bank-accounts' | 'done';

const STEPS: { id: Step; label: string; description: string }[] = [
  { id: 'trial-balance', label: '1. Opening Balances', description: 'Import trial balance (GL account balances as of a date)' },
  { id: 'receivables', label: '2. Outstanding Receivables', description: 'Import unpaid customer invoices' },
  { id: 'payables', label: '3. Outstanding Payables', description: 'Import unpaid vendor bills' },
  { id: 'bank-accounts', label: '4. Bank Accounts', description: 'Import bank account details and balances' },
  { id: 'done', label: 'Done', description: 'Migration complete' },
];

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
  journalEntryId?: string;
}

interface PreviewResult {
  lines: { accountName: string; accountCode?: string; debit: number; credit: number }[];
  matched: number;
  unmatched: string[];
  totalDebit: number;
  totalCredit: number;
}

export function TallyImportPage() {
  const [step, setStep] = useState<Step>('trial-balance');

  const currentIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Migrate from Tally</h2>
        <p className="text-sm text-zinc-500">Import your existing data from Tally step by step. Each step is optional — skip what you don't need.</p>
      </div>

      {/* Step indicators */}
      <div className="mb-6 flex gap-1">
        {STEPS.filter((s) => s.id !== 'done').map((s, i) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
              step === s.id
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400'
                : i < currentIdx
                  ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400'
                  : 'border-zinc-200 text-zinc-500 dark:border-zinc-800'
            }`}
          >
            <span className="font-medium">{s.label}</span>
          </button>
        ))}
      </div>

      {step === 'trial-balance' && <TrialBalanceStep onNext={() => setStep('receivables')} />}
      {step === 'receivables' && <CSVImportStep type="receivables" title="Outstanding Receivables" description="Upload a CSV with columns: Customer Name, Invoice Number, Invoice Date, Due Date, Amount, Balance" csvTemplate="Customer Name,Invoice Number,Invoice Date,Due Date,Amount,Balance" endpoint="/tally/import/receivables" onNext={() => setStep('payables')} />}
      {step === 'payables' && <CSVImportStep type="payables" title="Outstanding Payables" description="Upload a CSV with columns: Vendor Name, Bill Number, Invoice Date, Due Date, Amount, Balance" csvTemplate="Vendor Name,Bill Number,Invoice Date,Due Date,Amount,Balance" endpoint="/tally/import/payables" onNext={() => setStep('bank-accounts')} />}
      {step === 'bank-accounts' && <CSVImportStep type="bank-accounts" title="Bank Accounts" description="Upload a CSV with columns: Bank Name, Account Name, Account Number, IFSC Code, Balance" csvTemplate="Bank Name,Account Name,Account Number,IFSC Code,Balance" endpoint="/tally/import/bank-accounts" onNext={() => setStep('done')} />}
      {step === 'done' && <DoneStep onRestart={() => setStep('trial-balance')} />}
    </div>
  );
}

// ─── Trial Balance Step (with preview) ──────────────────────────────────────

function TrialBalanceStep({ onNext }: { onNext: () => void }) {
  const { toast } = useToast();
  const [csvData, setCsvData] = useState('');
  const [asOfDate, setAsOfDate] = useState(() => {
    const now = new Date();
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${fy}-04-01`;
  });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const previewMutation = useMutation({
    mutationFn: (data: string) => api.post<ApiSuccess<PreviewResult>>('/tally/import/preview-trial-balance', { csvData: data }),
  });

  const importMutation = useMutation({
    mutationFn: (data: { csvData: string; asOfDate: string }) => api.post<ApiSuccess<ImportResult>>('/tally/import/trial-balance', data),
  });

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvData(text);
      setPreview(null);
      setResult(null);
    };
    reader.readAsText(file);
  }

  async function handlePreview() {
    if (!csvData.trim()) { toast('Paste or upload CSV data first', 'error'); return; }
    try {
      const res = await previewMutation.mutateAsync(csvData);
      setPreview(res.data);
    } catch {
      toast('Failed to parse CSV', 'error');
    }
  }

  async function handleImport() {
    try {
      const res = await importMutation.mutateAsync({ csvData, asOfDate });
      setResult(res.data);
      toast(`Imported ${res.data.created} account balances`, 'success');
    } catch {
      toast('Failed to import trial balance', 'error');
    }
  }

  return (
    <Card>
      <CardHeader title="Step 1: Opening Balances (Trial Balance)" />
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-500">
          Export your Trial Balance from Tally as CSV/Excel. Required columns: <strong>Account Name, Debit, Credit</strong>. Optional: Account Code.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Upload CSV file</label>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="block w-full text-sm text-zinc-500 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-950/30 dark:file:text-indigo-400" />
          </div>
          <DateInput label="Balances as of date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Or paste CSV data</label>
          <textarea
            value={csvData}
            onChange={(e) => { setCsvData(e.target.value); setPreview(null); setResult(null); }}
            rows={6}
            placeholder={"Account Name,Debit,Credit\nCash at Bank,50000,\nAccounts Payable,,30000\nShare Capital,,20000"}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePreview} loading={previewMutation.isPending} disabled={!csvData.trim()}>
            <FileSpreadsheet size={14} /> Preview Mapping
          </Button>
          {preview && preview.unmatched.length === 0 && (
            <Button onClick={handleImport} loading={importMutation.isPending}>
              <Upload size={14} /> Import Balances
            </Button>
          )}
        </div>

        {preview && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <Badge variant="success">{preview.matched} matched</Badge>
              {preview.unmatched.length > 0 && <Badge variant="danger">{preview.unmatched.length} unmatched</Badge>}
              <span className="text-zinc-500">Debit: {fmt(preview.totalDebit)} | Credit: {fmt(preview.totalCredit)}</span>
              {Math.abs(preview.totalDebit - preview.totalCredit) > 0.01 && (
                <Badge variant="warning">Off by {fmt(Math.abs(preview.totalDebit - preview.totalCredit))} (will auto-balance to Retained Earnings)</Badge>
              )}
            </div>

            {preview.unmatched.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
                <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">Unmatched accounts (create these in Chart of Accounts first):</p>
                <ul className="list-disc list-inside text-xs text-red-700 dark:text-red-400">
                  {preview.unmatched.map((name) => <li key={name}>{name}</li>)}
                </ul>
              </div>
            )}

            <Table>
              <TableHeader>
                <tr>
                  <Th>Account Name</Th>
                  <Th>Mapped Code</Th>
                  <Th align="right">Debit</Th>
                  <Th align="right">Credit</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {preview.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className={l.accountCode ? '' : 'text-red-600 dark:text-red-400'}>{l.accountName}</TableCell>
                    <TableCell className="font-mono text-xs">{l.accountCode ?? <Badge variant="danger">Not found</Badge>}</TableCell>
                    <TableCell align="right" numeric>{l.debit > 0 ? fmt(l.debit) : ''}</TableCell>
                    <TableCell align="right" numeric>{l.credit > 0 ? fmt(l.credit) : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {result && <ResultCard result={result} label="account balances" />}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onNext}>Skip / Next <ArrowRight size={14} /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Generic CSV Import Step ────────────────────────────────────────────────

function CSVImportStep({ type, title, description, csvTemplate, endpoint, onNext }: {
  type: string;
  title: string;
  description: string;
  csvTemplate: string;
  endpoint: string;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const [csvData, setCsvData] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const importMutation = useMutation({
    mutationFn: (data: string) => api.post<ApiSuccess<ImportResult>>(endpoint, { csvData: data }),
  });

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setCsvData(ev.target?.result as string); setResult(null); };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!csvData.trim()) { toast('Paste or upload CSV data first', 'error'); return; }
    try {
      const res = await importMutation.mutateAsync(csvData);
      setResult(res.data);
      toast(`Imported ${res.data.created} records`, 'success');
    } catch {
      toast('Import failed', 'error');
    }
  }

  const stepNum = type === 'receivables' ? '2' : type === 'payables' ? '3' : '4';

  return (
    <Card>
      <CardHeader title={`Step ${stepNum}: ${title}`} />
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-500">{description}</p>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Upload CSV file</label>
          <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="block w-full text-sm text-zinc-500 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-950/30 dark:file:text-indigo-400" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Or paste CSV data</label>
          <textarea
            value={csvData}
            onChange={(e) => { setCsvData(e.target.value); setResult(null); }}
            rows={5}
            placeholder={csvTemplate}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <Button onClick={handleImport} loading={importMutation.isPending} disabled={!csvData.trim()}>
          <Upload size={14} /> Import {title}
        </Button>

        {result && <ResultCard result={result} label="records" />}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onNext}>Skip / Next <ArrowRight size={14} /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Done Step ──────────────────────────────────────────────────────────────

function DoneStep({ onRestart }: { onRestart: () => void }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Migration Complete</h3>
        <p className="mt-2 text-sm text-zinc-500">
          Your data from Tally has been imported. You can review the imported records in their respective sections (GL, AR, AP, Banking).
        </p>
        <div className="mt-6">
          <Button variant="outline" onClick={onRestart}>Import More Data</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────

function ResultCard({ result, label }: { result: ImportResult; label: string }) {
  return (
    <div className={`rounded-lg border p-3 ${result.errors.length > 0 ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20'}`}>
      <div className="flex gap-4 text-sm">
        <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
          <CheckCircle size={14} /> {result.created} {label} imported
        </span>
        {result.skipped > 0 && <span className="text-zinc-500">{result.skipped} skipped</span>}
        {result.errors.length > 0 && (
          <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <AlertCircle size={14} /> {result.errors.length} errors
          </span>
        )}
      </div>
      {result.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
          {result.errors.slice(0, 10).map((e, i) => (
            <li key={i}>Row {e.row}: {e.message}</li>
          ))}
          {result.errors.length > 10 && <li>...and {result.errors.length - 10} more</li>}
        </ul>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);
}

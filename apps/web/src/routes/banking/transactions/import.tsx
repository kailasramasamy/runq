import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Check, X } from 'lucide-react';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useImportTransactions } from '@/hooks/queries/use-transactions';
import { useToast } from '@/components/ui';
import type { BankStatementImportResult } from '@runq/types';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Select,
  Textarea,
} from '@/components/ui';

interface ParsedRow {
  date: string;
  narration: string;
  reference: string;
  debit: string;
  credit: string;
  balance: string;
}

function parseCSV(csv: string): ParsedRow[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const rows = lines.slice(1);
  return rows
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      return {
        date: cols[0] ?? '',
        narration: cols[1] ?? '',
        reference: cols[2] ?? '',
        debit: cols[3] ?? '',
        credit: cols[4] ?? '',
        balance: cols[5] ?? '',
      };
    })
    .filter((r) => r.date);
}

type Step = 1 | 2 | 3 | 4;

export function ImportTransactionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [accountId, setAccountId] = useState('');
  const [csvData, setCsvData] = useState('');
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<BankStatementImportResult | null>(null);

  const { data: accountsData } = useBankAccounts();
  const accounts = accountsData?.data ?? [];
  const importMutation = useImportTransactions();

  const accountOptions = [
    { value: '', label: 'Select account…' },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  function handlePreview() {
    const rows = parseCSV(csvData);
    setPreview(rows);
    setStep(3);
  }

  function handleImport() {
    importMutation.mutate(
      { accountId, csvData },
      {
        onSuccess: (res) => {
          setResult(res.data);
          setStep(4);
        },
        onError: () => {
          toast('Import failed. Please check your CSV format and try again.', 'error');
        },
      },
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        breadcrumbs={[
          { label: 'Banking', href: '/banking' },
          { label: 'Transactions', href: '/banking/transactions' },
          { label: 'Import' },
        ]}
        title="Import Bank Statement"
        description="Paste CSV data from your bank statement to import transactions."
      />

      {/* Step 1: Select Account */}
      <Card className={step < 1 ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader title="1. Select Bank Account" />
        <CardContent>
          <div className="max-w-sm">
            <Select
              label="Bank Account"
              required
              options={accountOptions}
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                if (step < 2) setStep(2);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Paste CSV */}
      <Card className={!accountId ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader title="2. Paste CSV Data" />
        <CardContent>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Expected columns: Date, Narration, Reference, Debit, Credit, Balance
          </p>
          <Textarea
            label="CSV Data"
            placeholder={`Date,Narration,Reference,Debit,Credit,Balance\n2025-03-01,NEFT Transfer,UTR123456,50000,,150000\n2025-03-02,Salary Credit,,0,100000,250000`}
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            className="min-h-[160px] font-mono text-xs"
          />
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            onClick={handlePreview}
            disabled={!accountId || !csvData.trim()}
          >
            Preview Rows
          </Button>
        </CardFooter>
      </Card>

      {/* Step 3: Preview */}
      {step >= 3 && preview.length > 0 && (
        <Card>
          <CardHeader title={`3. Preview — ${preview.length} row${preview.length !== 1 ? 's' : ''} parsed`} />
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                  {['Date', 'Narration', 'Reference', 'Debit', 'Credit', 'Balance'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-2 text-zinc-500">{row.date}</td>
                    <td className="px-4 py-2 max-w-[200px] truncate">{row.narration}</td>
                    <td className="px-4 py-2 font-mono text-zinc-500">{row.reference}</td>
                    <td className="px-4 py-2 text-right font-mono text-red-600 dark:text-red-400">
                      {row.debit}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {row.credit}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-500">{row.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 20 && (
              <p className="px-4 py-2 text-xs text-zinc-400 dark:text-zinc-600">
                … and {preview.length - 20} more rows
              </p>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <Button variant="outline" onClick={() => { setStep(2); setPreview([]); }}>
              Back
            </Button>
            <Button
              onClick={handleImport}
              loading={importMutation.isPending}
              disabled={preview.length === 0}
            >
              <Upload size={16} />
              Import {preview.length} Transactions
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Results */}
      {step === 4 && result && (
        <Card>
          <CardHeader title="4. Import Results" />
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
                <Check className="mx-auto mb-1 text-emerald-600 dark:text-emerald-400" size={20} />
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {result.imported}
                </p>
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Imported</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-800 dark:bg-zinc-800/50">
                <Badge variant="default" className="mx-auto mb-1 block w-fit">Skip</Badge>
                <p className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">
                  {result.duplicatesSkipped}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">Duplicates Skipped</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-900/20">
                <X className="mx-auto mb-1 text-red-600 dark:text-red-400" size={20} />
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {result.errors.length}
                </p>
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">Errors</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">
                  Row Errors:
                </p>
                <ul className="space-y-1">
                  {result.errors.map((err) => (
                    <li key={err.row} className="text-xs text-red-600 dark:text-red-400">
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={() => navigate({ to: '/banking/transactions' })}>
              View Transactions
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

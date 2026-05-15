import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Upload, Check, X, FileText, Trash2, AlertTriangle, Calendar } from 'lucide-react';
import { cn, formatINR } from '@/lib/utils';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import { useParseStatement, useCommitStatement, useAnalyzeStatement, type AnalyzeImportResult } from '@/hooks/queries/use-transactions';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Select,
  useToast,
} from '@/components/ui';
import type {
  ParsedStatementFile,
  ParsedStatementTransaction,
  StatementParseResult,
  BankStatementImportResult,
} from '@runq/types';

const ALLOWED_EXTENSIONS = ['.xls', '.xlsx', '.csv', '.pdf', '.jpg', '.jpeg', '.png'];
const MAX_SIZE = 10 * 1024 * 1024;

function validateFile(file: File): string | null {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type ${ext} is not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  if (file.size > MAX_SIZE) return `File "${file.name}" exceeds 10 MB limit`;
  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

type Phase = 'upload' | 'review' | 'result';

export function ImportTransactionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('upload');

  // Upload phase
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Review phase
  const [parseResult, setParseResult] = useState<StatementParseResult | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Record<number, string>>({});

  // Result phase
  const [commitResult, setCommitResult] = useState<BankStatementImportResult | null>(null);

  // Duplicate-guard: analyses per account, plus a flag confirming the user
  // has acknowledged any duplicates before we proceed to commit.
  const [analyses, setAnalyses] = useState<AnalyzeImportResult[] | null>(null);
  const [confirmedDupes, setConfirmedDupes] = useState(false);

  const { data: accountsData } = useBankAccounts();
  const accounts = accountsData?.data ?? [];
  const parseMutation = useParseStatement();
  const commitMutation = useCommitStatement();
  const analyzeMutation = useAnalyzeStatement();

  const accountOptions = useMemo(
    () => [
      { value: '', label: 'Select account…' },
      ...accounts.map((a) => ({ value: a.id, label: `${a.name} — ${a.bankName}` })),
    ],
    [accounts],
  );

  // Get last sync date for an account from parse result
  const getLastSyncDate = useCallback(
    (accountId: string) => {
      if (!parseResult) return null;
      return parseResult.accounts.find((a) => a.id === accountId)?.lastSyncDate ?? null;
    },
    [parseResult],
  );

  // ── File handling ──────────────────────────────────────────────

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const valid: File[] = [];
    for (const file of Array.from(fileList)) {
      const err = validateFile(file);
      if (err) { setValidationError(err); return; }
      valid.push(file);
    }
    setValidationError(null);
    setFiles((prev) => [...prev, ...valid]);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Parse ──────────────────────────────────────────────────────

  function handleParse() {
    parseMutation.mutate(files, {
      onSuccess: (result) => {
        setParseResult(result);
        // Pre-fill detected account IDs
        const preSelected: Record<number, string> = {};
        result.files.forEach((f, i) => {
          if (f.detectedAccountId) preSelected[i] = f.detectedAccountId;
        });
        setSelectedAccountIds(preSelected);
        setPhase('review');
      },
      onError: (err) => {
        toast(err.message || 'Failed to parse files', 'error');
      },
    });
  }

  // ── Commit ─────────────────────────────────────────────────────

  /** Returns a map of accountId → transactions, grouped from all files. */
  function groupByAccount(): Map<string, ParsedStatementTransaction[]> {
    const byAccount = new Map<string, ParsedStatementTransaction[]>();
    if (!parseResult) return byAccount;
    parseResult.files.forEach((file, i) => {
      const accountId = selectedAccountIds[i];
      if (!accountId || file.transactions.length === 0) return;
      const existing = byAccount.get(accountId) ?? [];
      existing.push(...file.transactions);
      byAccount.set(accountId, existing);
    });
    return byAccount;
  }

  /**
   * First click runs the duplicate analysis. If any duplicates are detected,
   * we surface them and require the user to click again to confirm. Second
   * click (or no-duplicate path) proceeds straight to commit.
   */
  async function handleCommit() {
    const byAccount = groupByAccount();
    if (byAccount.size === 0) {
      toast('No transactions to import. Select a bank account for each file.', 'error');
      return;
    }

    // Phase 1: run analysis if we haven't or if the user changed something.
    if (!analyses) {
      try {
        const results: AnalyzeImportResult[] = [];
        for (const [accountId, txns] of byAccount) {
          const res = await analyzeMutation.mutateAsync({ accountId, transactions: txns });
          results.push(res.data);
        }
        setAnalyses(results);
        const dupeTotal = results.reduce((s, r) => s + r.duplicateRows, 0);
        if (dupeTotal > 0) {
          // Stop here — user must click again to confirm.
          return;
        }
      } catch (err) {
        toast((err as Error).message || 'Duplicate check failed', 'error');
        return;
      }
    } else if (!confirmedDupes && analyses.some((a) => a.duplicateRows > 0)) {
      // User clicked while duplicates were flagged — require an explicit ack.
      setConfirmedDupes(true);
      return;
    }

    // Phase 2: commit.
    let totalImported = 0;
    let totalDuplicates = 0;
    const allErrors: { row: number; message: string }[] = [];

    for (const [accountId, txns] of byAccount) {
      try {
        const res = await commitMutation.mutateAsync({ accountId, transactions: txns });
        totalImported += res.data.imported;
        totalDuplicates += res.data.duplicatesSkipped;
        allErrors.push(...res.data.errors);
      } catch (err) {
        allErrors.push({ row: 0, message: (err as Error).message });
      }
    }

    setCommitResult({
      imported: totalImported,
      duplicatesSkipped: totalDuplicates,
      errors: allErrors,
    });
    setPhase('result');
  }

  // Re-running analysis is needed whenever the user changes account
  // selection — clear cached results so the next commit click re-checks.
  function clearAnalysis() {
    setAnalyses(null);
    setConfirmedDupes(false);
  }

  // ── Count totals for review ────────────────────────────────────

  const totalTransactions = parseResult?.files.reduce((sum, f) => sum + f.transactions.length, 0) ?? 0;
  const filesWithErrors = parseResult?.files.filter((f) => f.error) ?? [];
  const readyFiles = parseResult?.files.filter((f) => f.transactions.length > 0 && !f.error) ?? [];

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader fullWidth
        breadcrumbs={[
          { label: 'Banking', href: '/banking' },
          { label: 'Transactions', href: '/banking/transactions' },
          { label: 'Import' },
        ]}
        title="Import Bank Statement"
        description="Drop your bank statement files to import transactions automatically."
      />

      {/* ── Upload Phase ─────────────────────────────────────── */}
      {phase === 'upload' && (
        <Card>
          <CardHeader title="Upload Bank Statement" />
          <CardContent className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors',
                dragOver
                  ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/10'
                  : 'border-zinc-300 hover:border-indigo-300 dark:border-zinc-700 dark:hover:border-indigo-600',
                parseMutation.isPending && 'pointer-events-none opacity-60',
              )}
            >
              <Upload className="mb-3 h-8 w-8 text-zinc-400" />
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Drop bank statement files here or click to browse
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                XLS, XLSX, CSV, PDF, JPG, PNG — up to 10 MB each
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ALLOWED_EXTENSIONS.join(',')}
                multiple
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {validationError && (
              <p className="text-xs text-red-600 dark:text-red-400">{validationError}</p>
            )}

            {/* File list */}
            {files.length > 0 && (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">{file.name}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{formatSize(file.size)}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button
              onClick={handleParse}
              disabled={files.length === 0}
              loading={parseMutation.isPending}
            >
              <Upload size={16} />
              Parse {files.length} File{files.length !== 1 ? 's' : ''}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ── Review Phase ─────────────────────────────────────── */}
      {phase === 'review' && parseResult && (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
            <Badge variant="success">{totalTransactions} transactions parsed</Badge>
            {readyFiles.length > 0 && (
              <span className="text-xs text-zinc-500">{readyFiles.length} file{readyFiles.length !== 1 ? 's' : ''} ready</span>
            )}
            {filesWithErrors.length > 0 && (
              <Badge variant="danger">{filesWithErrors.length} file{filesWithErrors.length !== 1 ? 's' : ''} failed</Badge>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setPhase('upload'); setParseResult(null); }}>
                Back
              </Button>
            </div>
          </div>

          {/* Per-file review cards */}
          {parseResult.files.map((file, fileIdx) => (
            <FileReviewCard
              key={fileIdx}
              file={file}
              fileIdx={fileIdx}
              accountOptions={accountOptions}
              selectedAccountId={selectedAccountIds[fileIdx] ?? ''}
              lastSyncDate={getLastSyncDate(selectedAccountIds[fileIdx] ?? '')}
              onAccountChange={(accountId) => {
                setSelectedAccountIds((prev) => ({ ...prev, [fileIdx]: accountId }));
                clearAnalysis(); // re-check dupes after any account change
              }}
            />
          ))}

          {/* Duplicate warning — only shown once analysis has run */}
          {analyses && analyses.some((a) => a.duplicateRows > 0) && (
            <DuplicateWarning analyses={analyses} accounts={accounts} confirmed={confirmedDupes} />
          )}

          {/* Commit button */}
          <div className="flex justify-end">
            <Button
              onClick={handleCommit}
              loading={commitMutation.isPending || analyzeMutation.isPending}
              disabled={totalTransactions === 0 || Object.values(selectedAccountIds).every((v) => !v)}
            >
              <Check size={16} />
              {(() => {
                const dupeTotal = analyses?.reduce((s, a) => s + a.duplicateRows, 0) ?? 0;
                const newTotal  = analyses?.reduce((s, a) => s + a.newRows, 0) ?? 0;
                if (!analyses) return `Import ${totalTransactions} Transactions`;
                if (dupeTotal === 0) return `Import ${newTotal} Transactions`;
                if (!confirmedDupes) return `Review ${dupeTotal} Duplicate${dupeTotal === 1 ? '' : 's'}`;
                return `Import ${newTotal} New, Skip ${dupeTotal} Duplicate${dupeTotal === 1 ? '' : 's'}`;
              })()}
            </Button>
          </div>
        </>
      )}

      {/* ── Result Phase ─────────────────────────────────────── */}
      {phase === 'result' && commitResult && (
        <Card>
          <CardHeader title="Import Results" />
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ResultCard
                icon={<Check className="mx-auto mb-1 text-emerald-600 dark:text-emerald-400" size={20} />}
                value={commitResult.imported}
                label="Imported"
                color="emerald"
              />
              <ResultCard
                icon={<Badge variant="default" className="mx-auto mb-1 block w-fit">Skip</Badge>}
                value={commitResult.duplicatesSkipped}
                label="Duplicates Skipped"
                color="zinc"
              />
              <ResultCard
                icon={<X className="mx-auto mb-1 text-red-600 dark:text-red-400" size={20} />}
                value={commitResult.errors.length}
                label="Errors"
                color="red"
              />
            </div>

            {commitResult.errors.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">Errors:</p>
                <ul className="space-y-1">
                  {commitResult.errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600 dark:text-red-400">
                      {err.row > 0 ? `Row ${err.row}: ` : ''}{err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setPhase('upload'); setFiles([]); setParseResult(null); setCommitResult(null); }}>
              Import More
            </Button>
            <Button onClick={() => navigate({ to: '/finance/banking/transactions' })}>
              View Transactions
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

// ── File review card ───────────────────────────────────────────────

function FileReviewCard({
  file,
  fileIdx,
  accountOptions,
  selectedAccountId,
  lastSyncDate,
  onAccountChange,
}: {
  file: ParsedStatementFile;
  fileIdx: number;
  accountOptions: { value: string; label: string }[];
  selectedAccountId: string;
  lastSyncDate: string | null;
  onAccountChange: (id: string) => void;
}) {
  if (file.error) {
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">{file.fileName}</span>
            <span className="text-xs text-red-500">{file.error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={file.fileName} />
      <div className="-mt-2 mb-1 flex flex-wrap items-center gap-2 px-6">
        <Badge variant="default">{file.transactions.length} txns</Badge>
        {file.detectedBankName && (
          <Badge variant="success">Detected: {file.detectedBankName}</Badge>
        )}
        <Badge variant="default" className="text-xs">
          via {file.parserUsed}
        </Badge>
      </div>
      <CardContent className="space-y-3">
        {/* Bank account selector + sync date */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[250px] max-w-sm flex-1">
            <Select
              label="Bank Account"
              required
              options={accountOptions}
              value={selectedAccountId}
              onChange={(e) => onAccountChange(e.target.value)}
            />
          </div>
          {lastSyncDate && (
            <div className="flex items-center gap-1.5 pb-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Calendar className="h-3.5 w-3.5" />
              Synced till <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatDate(lastSyncDate)}</span>
            </div>
          )}
          {!selectedAccountId && (
            <p className="pb-1 text-xs text-amber-600 dark:text-amber-400">
              Select a bank account to import these transactions
            </p>
          )}
        </div>

        {/* Transaction preview table */}
        {file.transactions.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                  {['Date', 'Narration', 'Reference', 'Debit', 'Credit', 'Balance'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {file.transactions.map((txn, i) => (
                  <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="whitespace-nowrap px-3 py-1.5 text-zinc-500">{formatDate(txn.transactionDate)}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5">{txn.narration ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-zinc-500">{txn.reference ?? ''}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-red-600 dark:text-red-400">
                      {txn.type === 'debit' ? formatINR(txn.amount) : ''}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {txn.type === 'credit' ? formatINR(txn.amount) : ''}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-zinc-500">
                      {txn.runningBalance !== null ? formatINR(txn.runningBalance) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Result card ────────────────────────────────────────────────────

function ResultCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: 'emerald' | 'zinc' | 'red';
}) {
  const colorMap = {
    emerald: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20',
    zinc: 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50',
    red: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20',
  };
  const textMap = {
    emerald: 'text-emerald-700 dark:text-emerald-400',
    zinc: 'text-zinc-700 dark:text-zinc-300',
    red: 'text-red-700 dark:text-red-400',
  };
  const subtextMap = {
    emerald: 'text-emerald-600 dark:text-emerald-500',
    zinc: 'text-zinc-500',
    red: 'text-red-600 dark:text-red-500',
  };

  return (
    <div className={cn('rounded-lg border p-4 text-center', colorMap[color])}>
      {icon}
      <p className={cn('text-2xl font-bold', textMap[color])}>{value}</p>
      <p className={cn('mt-0.5 text-xs', subtextMap[color])}>{label}</p>
    </div>
  );
}

function DuplicateWarning({
  analyses,
  accounts,
  confirmed,
}: {
  analyses: AnalyzeImportResult[];
  accounts: Array<{ id: string; name: string; bankName: string }>;
  confirmed: boolean;
}) {
  const accountName = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.name} — ${a.bankName}` : 'Unknown account';
  };
  const dupeTotal = analyses.reduce((s, a) => s + a.duplicateRows, 0);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-900/20">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {dupeTotal} duplicate{dupeTotal === 1 ? '' : 's'} detected
          </p>
          <p className="mt-0.5 text-[12.5px] text-amber-800 dark:text-amber-300">
            These rows match transactions already in your books for the same date, amount,
            and narration. Importing again will skip them — your books are safe.
            {!confirmed && ' Click the button below once more to proceed.'}
          </p>

          {analyses.map((a) => {
            if (a.duplicateRows === 0) return null;
            return (
              <div key={a.accountId} className="mt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  {accountName(a.accountId)} · {a.duplicateRows} duplicate{a.duplicateRows === 1 ? '' : 's'} of {a.totalRows} rows
                </p>
                <ul className="mt-1 space-y-0.5 text-[12px] text-amber-900 dark:text-amber-200">
                  {a.duplicates.slice(0, 5).map((d) => (
                    <li key={d.rowIndex} className="flex items-center gap-2">
                      <span className="font-mono">{formatDate(d.transactionDate)}</span>
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
                        d.type === 'credit'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                      )}>
                        {d.type}
                      </span>
                      <span className="font-mono tabular-nums">{formatINR(d.amount)}</span>
                      <span className="min-w-0 flex-1 truncate text-amber-700 dark:text-amber-300">
                        {d.narration ?? d.reference ?? '—'}
                      </span>
                    </li>
                  ))}
                  {a.duplicates.length > 5 && (
                    <li className="text-[11px] text-amber-700 dark:text-amber-400">
                      +{a.duplicates.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

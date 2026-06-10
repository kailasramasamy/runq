import { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Check, X } from 'lucide-react';
import { useBankAccounts } from '@/hooks/queries/use-bank-accounts';
import {
  useUnreconciled,
  useAutoReconcile,
  useManualMatch,
  useUnmatch,
  usePostAsExpense,
  useReceiveOnAccount,
  useMatchedTransactions,
} from '@/hooks/queries/use-reconciliation';
import type { MatchedTransaction } from '@/hooks/queries/use-reconciliation';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import { useToast } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { BankTransaction, AutoReconciliationResult, Account } from '@runq/types';
import {
  Badge,
  Button,
  Select,
  Card,
  CardHeader,
  CardContent,
  Table,
  TableHeader,
  Th,
  TableBody,
  TableRow,
  TableCell,
  TableSkeleton,
  EmptyState,
  Input,
  Pagination,
  Combobox,
} from '@/components/ui';
import { PageHeader } from '@/components/ar/primitives';
import { GitCompare, Receipt, Unlink, Search, PiggyBank } from 'lucide-react';

interface AutoResult {
  matched: number;
  unmatched: number;
  matchRate: string;
  items: AutoReconciliationResult['matched'];
}

function SummaryBar({
  bankBalance,
  bookBalance,
}: {
  bankBalance: number;
  bookBalance: number;
}) {
  const diff = bankBalance - bookBalance;
  const hasDiff = Math.abs(diff) > 0.01;

  return (
    <div className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Bank Balance
        </p>
        <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {formatINR(bankBalance)}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Book Balance
        </p>
        <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {formatINR(bookBalance)}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Difference
        </p>
        <p
          className={[
            'mt-1 font-mono text-xl font-semibold tabular-nums',
            hasDiff
              ? 'text-red-600 dark:text-red-400'
              : 'text-emerald-600 dark:text-emerald-400',
          ].join(' ')}
        >
          {hasDiff ? formatINR(diff) : 'Balanced'}
        </p>
      </div>
    </div>
  );
}

interface SuggestedMatch {
  paymentId?: string;
  receiptId?: string;
  confidence: number;
  matchReason: string;
}

function confidenceBadge(c: number) {
  if (c >= 0.9) return { variant: 'success' as const, label: `${Math.round(c * 100)}%` };
  if (c >= 0.7) return { variant: 'warning' as const, label: `${Math.round(c * 100)}%` };
  return { variant: 'default' as const, label: `${Math.round(c * 100)}%` };
}

function BankTxnRow({
  txn,
  selected,
  onSelect,
  suggestions,
  onPostExpense,
  onReceiveOnAccount,
}: {
  txn: BankTransaction;
  selected: boolean;
  onSelect: (id: string) => void;
  suggestions: SuggestedMatch[];
  onPostExpense?: (id: string) => void;
  onReceiveOnAccount?: (id: string) => void;
}) {
  const topSuggestion = suggestions[0];

  return (
    <TableRow
      className={[
        'cursor-pointer transition-colors',
        selected
          ? 'bg-indigo-50 dark:bg-indigo-900/20'
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
      ].join(' ')}
      onClick={() => onSelect(txn.id)}
    >
      <TableCell className="w-8">
        <input
          type="radio"
          checked={selected}
          onChange={() => onSelect(txn.id)}
          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
          onClick={(e) => e.stopPropagation()}
        />
      </TableCell>
      <TableCell className="text-xs text-zinc-500">{txn.transactionDate}</TableCell>
      <TableCell className="max-w-[180px] truncate text-sm">{txn.narration ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs text-zinc-500">{txn.reference ?? '—'}</TableCell>
      <TableCell align="right" numeric>
        <span
          className={[
            'font-medium tabular-nums',
            txn.type === 'debit'
              ? 'text-red-600 dark:text-red-400'
              : 'text-emerald-600 dark:text-emerald-400',
          ].join(' ')}
        >
          {txn.type === 'debit' ? '-' : '+'}{formatINR(txn.amount)}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {topSuggestion ? (
            <Badge variant={confidenceBadge(topSuggestion.confidence).variant} title={topSuggestion.matchReason}>
              {confidenceBadge(topSuggestion.confidence).label}
              {suggestions.length > 1 && <span className="ml-1 text-xs opacity-60">+{suggestions.length - 1}</span>}
            </Badge>
          ) : (
            <span className="text-xs text-zinc-400">—</span>
          )}
          {txn.type === 'debit' && onPostExpense && (
            <button
              onClick={(e) => { e.stopPropagation(); onPostExpense(txn.id); }}
              className="rounded p-1 text-zinc-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
              title="Post as Expense"
            >
              <Receipt size={14} />
            </button>
          )}
          {txn.type === 'credit' && onReceiveOnAccount && (
            <button
              onClick={(e) => { e.stopPropagation(); onReceiveOnAccount(txn.id); }}
              className="rounded p-1 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
              title="Receive on account (advance — no invoice)"
            >
              <PiggyBank size={14} />
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

interface MockPayment {
  id: string;
  type: 'vendor_payment' | 'payment_receipt';
  amount: number;
  date: string;
  referenceNumber: string | null;
  description: string;
}

function PaymentRow({
  payment,
  selected,
  onSelect,
}: {
  payment: MockPayment;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <TableRow
      className={[
        'cursor-pointer transition-colors',
        selected
          ? 'bg-indigo-50 dark:bg-indigo-900/20'
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
      ].join(' ')}
      onClick={() => onSelect(payment.id)}
    >
      <TableCell className="w-8">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(payment.id)}
          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
          onClick={(e) => e.stopPropagation()}
        />
      </TableCell>
      <TableCell className="text-xs text-zinc-500">{payment.date}</TableCell>
      <TableCell className="text-sm">{payment.description}</TableCell>
      <TableCell className="font-mono text-xs text-zinc-500">
        {payment.referenceNumber ?? '—'}
      </TableCell>
      <TableCell align="right" numeric>
        <Badge variant={payment.type === 'vendor_payment' ? 'warning' : 'success'}>
          {payment.type === 'vendor_payment' ? 'Payment' : 'Receipt'}
        </Badge>
      </TableCell>
      <TableCell align="right" numeric>
        <span className="font-medium tabular-nums">{formatINR(payment.amount)}</span>
      </TableCell>
    </TableRow>
  );
}

export function ReconciliationPage() {
  const { toast } = useToast();
  const [accountId, setAccountId] = useState('');
  const [selectedBankTxn, setSelectedBankTxn] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState<
    'vendor_payment' | 'payment_receipt' | null
  >(null);
  const [autoResult, setAutoResult] = useState<AutoResult | null>(null);
  const [expenseFormTxnId, setExpenseFormTxnId] = useState<string | null>(null);
  const [expenseAccountCode, setExpenseAccountCode] = useState('');
  const [expenseNarration, setExpenseNarration] = useState('');
  const [matchedPage, setMatchedPage] = useState(1);
  const [matchedSearch, setMatchedSearch] = useState('');

  const { data: accountsData } = useBankAccounts();
  const accounts = accountsData?.data ?? [];

  // Auto-select first bank account
  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0]!.id);
    }
  }, [accountId, accounts]);
  const { data: glAccountsData } = useGLAccounts();
  const expenseAccounts = useMemo(
    () => (glAccountsData?.data ?? []).filter((a: Account) => a.type === 'expense' && a.isActive),
    [glAccountsData],
  );

  const { data: unreconciledData, isLoading: unreconciledLoading } = useUnreconciled(
    accountId || undefined,
  );
  const debouncedSearch = useMemo(() => matchedSearch, [matchedSearch]);
  const { data: matchedData } = useMatchedTransactions(accountId || undefined, matchedPage, 20, debouncedSearch || undefined);
  const matchedTxns: MatchedTransaction[] = matchedData?.data ?? [];
  const matchedMeta = matchedData?.meta;
  const unreconciledTxns = unreconciledData?.data?.unreconciledBankTxns ?? [];
  const suggestedMatches = unreconciledData?.data?.suggestedMatches ?? [];
  const unreconciledPayments: MockPayment[] = (unreconciledData?.data?.unreconciledPayments ?? []).map((p: any) => ({
    id: p.id, type: 'vendor_payment' as const, amount: Number(p.amount), date: p.paymentDate,
    referenceNumber: p.utrNumber ?? null, description: p.vendorName ?? p.vendorId?.slice(0, 8) ?? '—',
  }));
  const unreconciledReceipts: MockPayment[] = (unreconciledData?.data?.unreconciledReceipts ?? []).map((r: any) => ({
    id: r.id, type: 'payment_receipt' as const, amount: Number(r.amount), date: r.receiptDate,
    referenceNumber: r.referenceNumber ?? null, description: r.customerName ?? r.customerId?.slice(0, 8) ?? '—',
  }));
  const allPaymentsReceipts = [...unreconciledPayments, ...unreconciledReceipts];

  const autoReconcileMutation = useAutoReconcile();
  const manualMatchMutation = useManualMatch();
  const unmatchMutation = useUnmatch();
  const postExpenseMutation = usePostAsExpense();
  const receiveOnAccountMutation = useReceiveOnAccount();

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const bankBalance = unreconciledData?.data?.summary?.bankBalance ?? selectedAccount?.currentBalance ?? 0;
  const bookBalance = unreconciledData?.data?.summary?.bookBalance ?? bankBalance;

  const accountOptions = [
    { value: '', label: 'Select account…' },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  function handleAutoReconcile() {
    autoReconcileMutation.mutate(
      { accountId, data: {} },
      {
        onSuccess: (res) => {
          const r = res.data;
          setAutoResult({
            matched: r.summary.autoMatched,
            unmatched: r.summary.remainingUnmatched,
            matchRate: r.summary.matchRate,
            items: r.matched,
          });
          toast(
            `Auto-reconcile complete: ${r.summary.autoMatched} matched (${r.summary.matchRate} rate)`,
            'success',
          );
        },
        onError: () => toast('Auto-reconcile failed. Please try again.', 'error'),
      },
    );
  }

  function handleManualMatch() {
    if (!selectedBankTxn || !selectedPaymentId || !selectedPaymentType) {
      toast('Select a bank transaction and a payment/receipt to match.', 'error');
      return;
    }
    manualMatchMutation.mutate(
      {
        bankTransactionId: selectedBankTxn,
        matchType: selectedPaymentType,
        matchId: selectedPaymentId,
      },
      {
        onSuccess: () => {
          toast('Transactions matched successfully.', 'success');
          setSelectedBankTxn(null);
          setSelectedPaymentId(null);
          setSelectedPaymentType(null);
        },
        onError: () => toast('Match failed. Please try again.', 'error'),
      },
    );
  }

  function handleUnmatch(bankTxnId: string) {
    unmatchMutation.mutate(bankTxnId, {
      onSuccess: () => toast('Match removed.', 'success'),
      onError: () => toast('Failed to unmatch. Please try again.', 'error'),
    });
  }

  function handleOpenExpenseForm(txnId: string) {
    const txn = unreconciledTxns.find((t) => t.id === txnId);
    setExpenseFormTxnId(txnId);
    setExpenseAccountCode('');
    setExpenseNarration(txn?.narration ?? '');
  }

  function handlePostExpense() {
    if (!expenseFormTxnId || !expenseAccountCode) return;
    postExpenseMutation.mutate(
      { bankTransactionId: expenseFormTxnId, expenseAccountCode, narration: expenseNarration || undefined },
      {
        onSuccess: () => {
          toast('Expense posted and reconciled.', 'success');
          setExpenseFormTxnId(null);
          setExpenseAccountCode('');
          setExpenseNarration('');
        },
        onError: () => toast('Failed to post expense.', 'error'),
      },
    );
  }

  function handleReceiveOnAccount(txnId: string) {
    const txn = unreconciledTxns.find((t) => t.id === txnId);
    if (!txn?.customerId) {
      toast('Assign a customer to this transaction first.', 'error');
      return;
    }
    if (!window.confirm(`Receive ${formatINR(txn.amount)} on account as an advance (no invoice)?`)) return;
    receiveOnAccountMutation.mutate(
      { bankTransactionId: txnId },
      {
        onSuccess: () => toast('Received on account as advance.', 'success'),
        onError: () => toast('Failed to receive on account.', 'error'),
      },
    );
  }

  function selectPayment(id: string, type: 'vendor_payment' | 'payment_receipt') {
    if (selectedPaymentId === id) {
      setSelectedPaymentId(null);
      setSelectedPaymentType(null);
    } else {
      setSelectedPaymentId(id);
      setSelectedPaymentType(type);
    }
  }

  const canMatch = !!(selectedBankTxn && selectedPaymentId);

  // FE-06: O(1) lookup map — avoids O(N²) .find() inside .map()
  const matchMap = useMemo(
    () => new Map(suggestedMatches.map((s: any) => [s.transactionId, s])),
    [suggestedMatches],
  );

  return (
    <div className="space-y-6">
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'Banking', href: '/banking' }, { label: 'Reconciliation' }]}
        title="Reconciliation"
        description="Match bank transactions to payments and receipts."
        actions={
          <Button
            onClick={handleAutoReconcile}
            loading={autoReconcileMutation.isPending}
          >
            <RefreshCw size={16} />
            Auto Reconcile
          </Button>
        }
      />

      <div className="flex items-end gap-4">
        <div className="w-full sm:w-64">
          <Select
            label="Bank Account"
            options={accountOptions}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          />
        </div>
      </div>

      <SummaryBar bankBalance={bankBalance} bookBalance={bookBalance} />

      {/* Auto-reconcile results */}
      {autoResult && (
        <Card>
          <CardHeader title="Auto-Reconcile Results" />
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-900/20">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {autoResult.matched}
                </p>
                <p className="mt-0.5 text-xs text-emerald-600">Matched</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-800 dark:bg-zinc-800/50">
                <p className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">
                  {autoResult.unmatched}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">Unmatched</p>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-center dark:border-indigo-900 dark:bg-indigo-900/20">
                <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">
                  {autoResult.matchRate}
                </p>
                <p className="mt-0.5 text-xs text-indigo-600">Match Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual match section */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: Unreconciled bank transactions */}
        <Card>
          <CardHeader
            title="Unreconciled Bank Transactions"
            action={
              <Badge variant="warning">
                {unreconciledTxns.length} pending
              </Badge>
            }
          />
          <CardContent className="p-0">
            {unreconciledLoading ? (
              <div className="p-4">
                <TableSkeleton rows={5} cols={5} />
              </div>
            ) : unreconciledTxns.length === 0 ? (
              <EmptyState
                icon={GitCompare}
                title="All transactions reconciled"
                description="No unmatched bank transactions."
                helpHref="/finance/help/rec_reconcile_bank"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <tr>
                      <Th className="w-8" />
                      <Th>Date</Th>
                      <Th>Narration</Th>
                      <Th>Reference</Th>
                      <Th align="right">Amount</Th>
                      <Th>Match</Th>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {unreconciledTxns.map((txn) => {
                      const txnSuggestions = matchMap.get(txn.id)?.suggestions ?? [];
                      return (
                        <BankTxnRow
                          key={txn.id}
                          txn={txn}
                          selected={selectedBankTxn === txn.id}
                          onSelect={setSelectedBankTxn}
                          suggestions={txnSuggestions}
                          onPostExpense={handleOpenExpenseForm}
                          onReceiveOnAccount={handleReceiveOnAccount}
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          {expenseFormTxnId && (
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="min-w-[200px] flex-1">
                  <Combobox
                    label="Expense Account"
                    value={expenseAccountCode}
                    onChange={setExpenseAccountCode}
                    placeholder="Search account..."
                    options={expenseAccounts.map((a: Account) => ({ value: a.code, label: `${a.code} — ${a.name}` }))}
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <Input
                    label="Narration"
                    value={expenseNarration}
                    onChange={(e) => setExpenseNarration(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handlePostExpense}
                    loading={postExpenseMutation.isPending}
                    disabled={!expenseAccountCode}
                  >
                    Post Expense
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpenseFormTxnId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Right: Unreconciled payments & receipts */}
        <Card>
          <CardHeader
            title="Unreconciled Payments & Receipts"
            action={
              <Badge variant="info">{allPaymentsReceipts.length} pending</Badge>
            }
          />
          <CardContent className="p-0">
            {allPaymentsReceipts.length === 0 ? (
              <EmptyState
                icon={GitCompare}
                title="No unreconciled items"
                description="Payments and receipts pending reconciliation will appear here."
                helpHref="/finance/help/rec_reconcile_bank"
              />
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <tr>
                      <Th className="w-8" />
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th>Reference</Th>
                      <Th>Type</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {allPaymentsReceipts.map((p) => (
                      <PaymentRow
                        key={p.id}
                        payment={p}
                        selected={selectedPaymentId === p.id}
                        onSelect={(id) => selectPayment(id, p.type)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Match action bar */}
      <div
        className={[
          'sticky bottom-4 rounded-xl border p-4 shadow-lg transition-all',
          canMatch
            ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/30'
            : 'border-zinc-200 bg-white opacity-60 dark:border-zinc-800 dark:bg-zinc-900',
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
              <GitCompare size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {canMatch
                  ? 'Ready to match — confirm to link these records'
                  : 'Select a bank transaction and a payment/receipt to match'}
              </p>
              {canMatch && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Bank txn: {selectedBankTxn?.slice(0, 8)}… ↔ Payment: {selectedPaymentId?.slice(0, 8)}…
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canMatch && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedBankTxn(null);
                  setSelectedPaymentId(null);
                  setSelectedPaymentType(null);
                }}
              >
                <X size={14} /> Clear
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleManualMatch}
              loading={manualMatchMutation.isPending}
              disabled={!canMatch}
            >
              <Check size={14} /> Match
            </Button>
          </div>
        </div>
      </div>

      {/* Matched items */}
      {autoResult && autoResult.items.length > 0 && (
        <Card>
          <CardHeader title="Recently Matched" />
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <tr>
                  <Th>Bank Txn</Th>
                  <Th>Matched To</Th>
                  <Th>Strategy</Th>
                  <Th>Confidence</Th>
                  <Th align="right">Amount</Th>
                  <Th>Actions</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {autoResult.items.map((item) => (
                  <TableRow key={item.bankTransactionId}>
                    <TableCell className="font-mono text-xs">
                      {item.bankTransactionId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{item.matchedTo.id.slice(0, 8)}…</span>
                      <Badge variant="info" className="ml-2">
                        {item.matchedTo.type === 'vendor_payment' ? 'Payment' : 'Receipt'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">{item.strategy}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.confidence === 'exact' ? 'success' : 'info'}>
                        {item.confidence}
                      </Badge>
                    </TableCell>
                    <TableCell align="right" numeric>
                      <span className="tabular-nums">{formatINR(item.amount)}</span>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleUnmatch(item.bankTransactionId)}
                        className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        aria-label="Unmatch"
                      >
                        <X size={14} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Previously matched transactions */}
      {accountId && (matchedTxns.length > 0 || matchedSearch) && (
        <Card>
          <CardHeader
            title="Matched Transactions"
            action={matchedMeta && <Badge variant="success">{matchedMeta.total} matched</Badge>}
          />
          <CardContent>
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search matched..."
                value={matchedSearch}
                onChange={(e) => { setMatchedSearch(e.target.value); setMatchedPage(1); }}
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
              />
            </div>
          </CardContent>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Date</Th>
                    <Th>Party</Th>
                    <Th>Narration</Th>
                    <Th>Match Type</Th>
                    <Th align="right">Amount</Th>
                    <Th>Actions</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {matchedTxns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-zinc-500 py-8">
                        {matchedSearch ? 'No matches found.' : 'No matched transactions.'}
                      </TableCell>
                    </TableRow>
                  ) : matchedTxns.map((m) => (
                    <TableRow key={m.matchId}>
                      <TableCell className="text-xs text-zinc-500">{m.date}</TableCell>
                      <TableCell className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.partyName ?? '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-zinc-500">{m.narration ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="default">{m.matchType.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell align="right" numeric>
                        <span className={[
                          'font-medium tabular-nums',
                          m.type === 'debit' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                        ].join(' ')}>
                          {m.type === 'debit' ? '-' : '+'}{formatINR(m.amount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleUnmatch(m.bankTransactionId)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                        >
                          <Unlink size={12} />
                          Unmatch
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {matchedMeta && matchedMeta.totalPages > 1 && (
              <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                <Pagination
                  page={matchedMeta.page}
                  totalPages={matchedMeta.totalPages}
                  total={matchedMeta.total}
                  limit={matchedMeta.limit}
                  onPageChange={setMatchedPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

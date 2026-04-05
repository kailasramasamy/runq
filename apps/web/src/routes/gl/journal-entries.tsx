import { useState, Fragment } from 'react';
import { BookOpen, ExternalLink, Plus, Trash2, X, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { Link } from '@tanstack/react-router';
import { useJournalEntries, useJournalEntry, useCreateJournalEntry, useGLAccounts } from '@/hooks/queries/use-gl';
import type { JournalEntry } from '@runq/types';
import {
  PageHeader, Badge, TableSkeleton, EmptyState, Button, Input, DateInput,
  Select, Textarea, useToast,
} from '@/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableCell, Th } from '@/components/ui';
import { formatINR } from '@/lib/utils';

const STATUS_VARIANT = {
  posted: 'success' as const,
  draft: 'default' as const,
  reversed: 'warning' as const,
};

const SOURCE_LABELS: Record<string, string> = {
  sales_invoice: 'Sales Invoice',
  purchase_invoice: 'Purchase Invoice',
  payment: 'Payment',
  receipt: 'Receipt',
  debit_note: 'Debit Note',
  credit_note: 'Credit Note',
};

function getSourceLink(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;
  const routes: Record<string, string> = {
    sales_invoice: `/ar/invoices/${sourceId}`,
    purchase_invoice: `/ap/bills/${sourceId}`,
    payment: `/ap/payments/${sourceId}`,
    receipt: `/ar/receipts/${sourceId}`,
    debit_note: `/ap/debit-notes/${sourceId}`,
    credit_note: `/ar/credit-notes/${sourceId}`,
  };
  return routes[sourceType] ?? null;
}

function SourceLink({ sourceType, sourceId }: { sourceType: string | null; sourceId: string | null }) {
  const link = getSourceLink(sourceType, sourceId);
  const label = sourceType ? (SOURCE_LABELS[sourceType] ?? sourceType) : null;
  if (!label) return <span className="text-zinc-400">—</span>;
  if (!link) return <span className="text-sm text-zinc-500">{label}</span>;
  return (
    <Link
      to={link}
      className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
      <ExternalLink size={12} />
    </Link>
  );
}

function EntryRow({ entry, onSelect }: { entry: JournalEntry; onSelect: (id: string) => void }) {
  return (
    <TableRow className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => onSelect(entry.id)}>
      <TableCell className="font-mono text-sm">{entry.entryNumber}</TableCell>
      <TableCell>{entry.date}</TableCell>
      <TableCell className="max-w-xs truncate">{entry.description}</TableCell>
      <TableCell>
        <SourceLink sourceType={entry.sourceType} sourceId={entry.sourceId} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatINR(entry.totalDebit)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatINR(entry.totalCredit)}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[entry.status as keyof typeof STATUS_VARIANT] ?? 'default'}>
          {entry.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function EntryDetail({ id }: { id: string }) {
  const { data, isLoading } = useJournalEntry(id);
  const entry = data?.data;

  if (isLoading) {
    return (
      <tr><td colSpan={7} className="p-4 text-sm text-zinc-500">Loading...</td></tr>
    );
  }
  if (!entry) return null;

  return (
    <tr>
      <td colSpan={7} className="p-0">
        <div className="bg-zinc-50 dark:bg-zinc-900/50 border-y border-zinc-200 dark:border-zinc-800 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-zinc-500">{entry.entryNumber} — {entry.description}</span>
            <SourceLink sourceType={entry.sourceType} sourceId={entry.sourceId} />
          </div>
          <div className="space-y-1.5 max-w-lg">
            {entry.lines.map((line) => {
              const amount = line.debit > 0 ? line.debit : line.credit;
              const side = line.debit > 0 ? 'Dr' : 'Cr';
              return (
                <div key={line.id} className="flex items-baseline justify-between text-sm">
                  <span>
                    {line.accountName}
                    <span className="text-zinc-400 dark:text-zinc-500 ml-1.5 text-xs">({line.accountCode})</span>
                  </span>
                  <span className="tabular-nums ml-4 whitespace-nowrap">
                    {formatINR(amount)}
                    <span className={`ml-1.5 text-xs font-medium ${side === 'Dr' ? 'text-blue-500' : 'text-emerald-500'}`}>
                      {side}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── New Journal Entry Modal ──────────────────────────────────────────

interface JELine {
  accountCode: string;
  debit: string;
  credit: string;
  description: string;
}

const EMPTY_LINE: JELine = { accountCode: '', debit: '', credit: '', description: '' };

function NewEntryModal({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateJournalEntry();
  const { data: accountsData } = useGLAccounts();
  const { toast } = useToast();
  const allAccounts = (accountsData?.data ?? []).filter((a) => a.isActive);
  const parentCodes = new Set(allAccounts.filter((a) => a.parentId).map((a) => {
    const parent = allAccounts.find((p) => p.id === a.parentId);
    return parent?.code;
  }).filter(Boolean));
  const leafAccounts = allAccounts.filter((a) => !parentCodes.has(a.code));

  const TYPE_LABELS: Record<string, string> = {
    asset: '── Assets ──',
    liability: '── Liabilities ──',
    equity: '── Equity ──',
    revenue: '── Revenue ──',
    expense: '── Expenses ──',
  };

  const accountOptions = [
    { value: '', label: 'Select account...' },
    ...(['asset', 'liability', 'equity', 'revenue', 'expense'] as const).flatMap((type) => {
      const group = leafAccounts.filter((a) => a.type === type);
      if (group.length === 0) return [];
      return [
        { value: `__group_${type}`, label: TYPE_LABELS[type], disabled: true },
        ...group.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` })),
      ];
    }),
  ] as Array<{ value: string; label: string; disabled?: boolean }>;

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JELine[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  const [error, setError] = useState('');

  function updateLine(idx: number, field: keyof JELine, val: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: val } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!description.trim()) { setError('Description is required'); return; }
    if (lines.some((l) => !l.accountCode)) { setError('All lines must have an account'); return; }
    if (totalDebit === 0 && totalCredit === 0) { setError('Enter at least one debit or credit amount'); return; }
    if (!isBalanced) { setError(`Entry is not balanced: Debit ${formatINR(totalDebit)} ≠ Credit ${formatINR(totalCredit)}`); return; }

    createMutation.mutate(
      {
        date,
        description: description.trim(),
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          description: l.description.trim() || undefined,
        })),
      },
      {
        onSuccess: () => { toast('Journal entry posted', 'success'); onClose(); },
        onError: (err: any) => setError(err?.message || 'Failed to create entry'),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">New Journal Entry</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DateInput label="Date" required value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="Description" required placeholder="e.g. Electricity accrual — March 2026" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Lines</p>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_100px_1fr_32px] gap-2 items-end">
                  <Select
                    options={accountOptions}
                    value={line.accountCode}
                    onChange={(e) => updateLine(idx, 'accountCode', e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Debit"
                    value={line.debit}
                    onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Credit"
                    value={line.credit}
                    onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                  />
                  <Input
                    placeholder="Narration (optional)"
                    value={line.description}
                    onChange={(e) => updateLine(idx, 'description', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length <= 2}
                    className="text-zinc-400 hover:text-red-500 disabled:opacity-30 pb-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={addLine} className="mt-2">
              <Plus size={14} /> Add Line
            </Button>
          </div>

          <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-700 pt-3 text-sm">
            <div className="flex gap-6 tabular-nums">
              <span>Debit: <span className="font-semibold">{formatINR(totalDebit)}</span></span>
              <span>Credit: <span className="font-semibold">{formatINR(totalCredit)}</span></span>
              {totalDebit > 0 || totalCredit > 0 ? (
                <Badge variant={isBalanced ? 'success' : 'danger'}>
                  {isBalanced ? 'Balanced' : 'Unbalanced'}
                </Badge>
              ) : null}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button size="sm" type="submit" loading={createMutation.isPending}>
              Post Entry
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export function JournalEntriesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading } = useJournalEntries(undefined, page, 20);
  const entries = data?.data ?? [];
  const meta = data?.meta;

  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'General Ledger', href: '/gl' }, { label: 'Journal Entries' }]}
        title="Journal Entries"
        description="Double-entry bookkeeping records."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('journal-entries.csv', ['Entry #', 'Date', 'Narration', 'Total Debit', 'Total Credit', 'Status'], entries.map(e => [e.entryNumber, e.date, e.description, e.totalDebit, e.totalCredit, e.status]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Entry
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <table className="w-full"><tbody><TableSkeleton rows={8} /></tbody></table>
      ) : entries.length === 0 ? (
        <EmptyState icon={BookOpen} title="No journal entries" description="Entries will appear here as transactions are recorded." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Entry #</Th>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Source</Th>
                <Th className="text-right">Debit</Th>
                <Th className="text-right">Credit</Th>
                <Th>Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <Fragment key={entry.id}>
                  <EntryRow entry={entry} onSelect={handleSelect} />
                  {selectedId === entry.id && <EntryDetail id={entry.id} />}
                </Fragment>
              ))}
            </TableBody>
          </Table>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 mt-2 text-sm text-zinc-500">
              <span>
                Page {meta.page} of {meta.totalPages} ({meta.total} entries)
              </span>
              <div className="flex gap-2">
                <button
                  className="rounded px-3 py-1 border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => { setPage((p) => p - 1); setSelectedId(null); }}
                >
                  Previous
                </button>
                <button
                  className="rounded px-3 py-1 border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
                  disabled={page >= meta.totalPages}
                  onClick={() => { setPage((p) => p + 1); setSelectedId(null); }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && <NewEntryModal onClose={() => { setShowCreate(false); setPage(1); }} />}
    </div>
  );
}

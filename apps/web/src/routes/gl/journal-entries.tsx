import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { useJournalEntries, useJournalEntry } from '@/hooks/queries/use-gl';
import type { JournalEntry } from '@runq/types';
import { PageHeader, Badge, TableSkeleton, EmptyState } from '@/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableCell, Th } from '@/components/ui';
import { formatINR } from '@/lib/utils';

const STATUS_VARIANT = {
  posted: 'success' as const,
  draft: 'default' as const,
  reversed: 'warning' as const,
};

function EntryRow({ entry, onSelect }: { entry: JournalEntry; onSelect: (id: string) => void }) {
  return (
    <TableRow className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50" onClick={() => onSelect(entry.id)}>
      <TableCell className="font-mono text-sm">{entry.entryNumber}</TableCell>
      <TableCell>{entry.date}</TableCell>
      <TableCell className="max-w-xs truncate">{entry.description}</TableCell>
      <TableCell className="text-zinc-400 text-sm">{entry.sourceType ?? '—'}</TableCell>
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

  if (isLoading) return <p className="text-sm text-zinc-500 mt-4">Loading...</p>;
  if (!entry) return null;

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <h3 className="font-semibold mb-2">{entry.entryNumber} — {entry.description}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <Th>Code</Th>
            <Th>Account</Th>
            <Th className="text-right">Debit</Th>
            <Th className="text-right">Credit</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="font-mono text-sm">{line.accountCode}</TableCell>
              <TableCell>{line.accountName}</TableCell>
              <TableCell className="text-right tabular-nums">{line.debit > 0 ? formatINR(line.debit) : '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{line.credit > 0 ? formatINR(line.credit) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function JournalEntriesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useJournalEntries();
  const entries = data?.data ?? [];

  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'General Ledger', href: '/gl' }, { label: 'Journal Entries' }]}
        title="Journal Entries"
        description="Double-entry bookkeeping records."
      />

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : entries.length === 0 ? (
        <EmptyState icon={BookOpen} title="No journal entries" description="Entries will appear here as transactions are recorded." />
      ) : (
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
              <EntryRow key={entry.id} entry={entry} onSelect={handleSelect} />
            ))}
          </TableBody>
        </Table>
      )}

      {selectedId && <EntryDetail id={selectedId} />}
    </div>
  );
}

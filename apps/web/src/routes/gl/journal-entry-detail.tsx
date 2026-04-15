import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { useJournalEntry } from '@/hooks/queries/use-gl';
import { formatINR } from '@/lib/utils';
import { DocumentTrail } from '@/components/audit/document-trail';
import {
  PageHeader,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  Skeleton,
} from '@/components/ui';

const STATUS_VARIANT: Record<string, 'success' | 'default' | 'warning'> = {
  posted: 'success',
  draft: 'default',
  reversed: 'warning',
};

const SOURCE_LABELS: Record<string, string> = {
  sales_invoice: 'Sales Invoice',
  purchase_invoice: 'Purchase Invoice',
  payment: 'Payment',
  receipt: 'Receipt',
  debit_note: 'Debit Note',
  credit_note: 'Credit Note',
  bank_expense: 'Bank Expense',
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

interface Props {
  journalEntryId: string;
}

export function JournalEntryDetailPage({ journalEntryId }: Props) {
  const { data, isLoading, isError } = useJournalEntry(journalEntryId);
  const entry = data?.data;

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !entry) {
    return <p className="text-sm text-red-500">Journal entry not found.</p>;
  }

  const sourceLabel = entry.sourceType ? (SOURCE_LABELS[entry.sourceType] ?? entry.sourceType) : null;
  const sourceLink = getSourceLink(entry.sourceType, entry.sourceId);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={entry.entryNumber}
        breadcrumbs={[
          { label: 'GL', href: '/gl' },
          { label: 'Journal Entries', href: '/gl/journal-entries' },
          { label: entry.entryNumber },
        ]}
        actions={
          <Badge variant={STATUS_VARIANT[entry.status] ?? 'default'} className="capitalize text-sm px-3 py-1">
            {entry.status}
          </Badge>
        }
      />

      <Card>
        <CardHeader title="Details" />
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Date</p>
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{entry.date}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Description</p>
              <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{entry.description}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Source</p>
              {sourceLink ? (
                <Link
                  to={sourceLink as '/'}
                  className="mt-0.5 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {sourceLabel} <ExternalLink size={12} />
                </Link>
              ) : (
                <p className="mt-0.5 text-sm text-zinc-900 dark:text-zinc-100">{sourceLabel ?? '—'}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Debit</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatINR(entry.totalDebit)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Credit</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatINR(entry.totalCredit)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Lines" />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Account</Th>
                <Th>Code</Th>
                <Th align="right">Debit</Th>
                <Th align="right">Credit</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {entry.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-sm">{line.accountName}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500">{line.accountCode}</TableCell>
                  <TableCell align="right" numeric className={line.debit > 0 ? 'font-medium' : 'text-zinc-400'}>
                    {line.debit > 0 ? formatINR(line.debit) : '—'}
                  </TableCell>
                  <TableCell align="right" numeric className={line.credit > 0 ? 'font-medium' : 'text-zinc-400'}>
                    {line.credit > 0 ? formatINR(line.credit) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Audit Trail" />
        <CardContent>
          <DocumentTrail entityType="journal_entry" entityId={journalEntryId} />
        </CardContent>
      </Card>
    </div>
  );
}

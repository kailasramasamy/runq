import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { FileWarning, Plus, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useDebitNotes } from '../../../hooks/queries/use-debit-notes';
import { useVendors } from '../../../hooks/queries/use-vendors';
import type { DebitNote, DebitNoteStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Th,
  TableSkeleton,
  EmptyState,
  Pagination,
} from '@/components/ui';

const STATUS_VARIANT: Record<DebitNoteStatus, 'default' | 'info' | 'success' | 'outline'> = {
  draft: 'default',
  issued: 'info',
  adjusted: 'success',
  cancelled: 'outline',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'adjusted', label: 'Adjusted' },
  { value: 'cancelled', label: 'Cancelled' },
];

function DebitNoteRow({ dn }: { dn: DebitNote & { vendorName?: string; invoiceNumber?: string | null } }) {
  const isCancelled = dn.status === 'cancelled';
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/ap/debit-notes/$debitNoteId"
          params={{ debitNoteId: dn.id }}
          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {dn.debitNoteNumber}
        </Link>
      </TableCell>
      <TableCell className="text-sm">{dn.vendorName ?? dn.vendorId.slice(0, 8)}</TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
        {dn.invoiceNumber ?? (dn.invoiceId ? dn.invoiceId.slice(0, 8) : '—')}
      </TableCell>
      <TableCell className="text-zinc-600 dark:text-zinc-400">{dn.issueDate}</TableCell>
      <TableCell align="right" numeric>{formatINR(dn.amount)}</TableCell>
      <TableCell className={`max-w-[200px] truncate text-zinc-500 dark:text-zinc-400 ${isCancelled ? 'line-through' : ''}`} title={dn.reason}>
        {dn.reason.length > 50 ? dn.reason.slice(0, 50) + '…' : dn.reason}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[dn.status]} className={`capitalize ${isCancelled ? 'line-through' : ''}`}>
          {dn.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

export function DebitNoteListPage() {
  const navigate = useNavigate();
  const [vendorId, setVendorId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: vendorData } = useVendors({ limit: 100 });
  const { data, isLoading } = useDebitNotes({
    vendorId: vendorId || undefined,
    status: status || undefined,
    page,
    limit: 20,
  });

  const vendors = vendorData?.data ?? [];
  const debitNotes = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const vendorOptions = [
    { value: '', label: 'All Vendors' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Debit Notes"
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Debit Notes' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('debit-notes.csv', ['DN #', 'Date', 'Vendor', 'Amount', 'Status'], debitNotes.map(dn => [dn.debitNoteNumber, dn.issueDate, (dn as DebitNote & { vendorName?: string }).vendorName ?? '', String(dn.amount), dn.status]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Link to="/ap/debit-notes/new">
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-700">
                <Plus size={16} />
                New Debit Note
              </button>
            </Link>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 py-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="sm:w-52">
            <Select
              label="Vendor"
              options={vendorOptions}
              value={vendorId}
              onChange={(e) => { setVendorId(e.target.value); setPage(1); }}
            />
          </div>
          <div className="sm:w-44">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : debitNotes.length === 0 ? (
          <EmptyState
            icon={FileWarning}
            title="No debit notes found"
            description="Raise a debit note to capture vendor deductions or adjustments."
          />
        ) : (
          debitNotes.map((dn) => {
            const isCancelled = dn.status === 'cancelled';
            return (
              <div
                key={dn.id}
                className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
                onClick={() => navigate({ to: '/ap/debit-notes/$debitNoteId', params: { debitNoteId: dn.id } })}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{dn.debitNoteNumber}</span>
                  <Badge variant={STATUS_VARIANT[dn.status]} className={`capitalize ${isCancelled ? 'line-through' : ''}`}>{dn.status}</Badge>
                </div>
                <div className="mt-0.5 truncate text-sm text-zinc-600 dark:text-zinc-400" title={dn.reason}>
                  {dn.reason.length > 60 ? dn.reason.slice(0, 60) + '…' : dn.reason}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{dn.issueDate}</span>
                  <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300 ml-auto">{formatINR(dn.amount)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <tr>
            <Th>DN #</Th>
            <Th>Vendor</Th>
            <Th>Invoice #</Th>
            <Th>Date</Th>
            <Th align="right">Amount</Th>
            <Th>Reason</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : debitNotes.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={FileWarning}
                  title="No debit notes found"
                  description="Raise a debit note to capture vendor deductions or adjustments."
                />
              </td>
            </tr>
          ) : (
            debitNotes.map((dn) => <DebitNoteRow key={dn.id} dn={dn} />)
          )}
        </TableBody>
      </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={20}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

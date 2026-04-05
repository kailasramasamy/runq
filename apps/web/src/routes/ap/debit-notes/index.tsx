import { useState } from 'react';
import { Link } from '@tanstack/react-router';
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
          <div className="flex items-center gap-2">
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
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <div className="w-52">
            <Select
              label="Vendor"
              options={vendorOptions}
              value={vendorId}
              onChange={(e) => { setVendorId(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-44">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

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

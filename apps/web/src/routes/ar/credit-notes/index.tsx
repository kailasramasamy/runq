import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { FileMinus, Plus, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useCreditNotes } from '../../../hooks/queries/use-credit-notes';
import { useCustomers } from '../../../hooks/queries/use-customers';
import type { CreditNote, CreditNoteStatus } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Button,
  Badge,
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

const STATUS_VARIANT: Record<CreditNoteStatus, 'default' | 'info' | 'success' | 'outline'> = {
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

function CreditNoteCard({ cn }: { cn: CreditNote }) {
  return (
    <Link to="/ar/credit-notes/$creditNoteId" params={{ creditNoteId: cn.id }}>
      <div className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{cn.creditNoteNumber}</span>
          <Badge variant={STATUS_VARIANT[cn.status]} className="capitalize">{cn.status}</Badge>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">{(cn as any).customerName}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{cn.reason}</p>
        <div className="mt-2 flex items-center text-xs text-zinc-500 dark:text-zinc-400">
          <span>{cn.issueDate}</span>
          <span className="ml-auto font-mono">{formatINR(cn.amount)}</span>
        </div>
      </div>
    </Link>
  );
}

function CreditNoteRow({ cn }: { cn: CreditNote }) {
  const isCancelled = cn.status === 'cancelled';
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/ar/credit-notes/$creditNoteId"
          params={{ creditNoteId: cn.id }}
          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {cn.creditNoteNumber}
        </Link>
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">
        {(cn as any).customerName ?? cn.customerId.slice(0, 8) + '…'}
      </TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {cn.invoiceId ? cn.invoiceId.slice(0, 8) + '…' : '—'}
      </TableCell>
      <TableCell className="text-zinc-600 dark:text-zinc-400">{cn.issueDate}</TableCell>
      <TableCell align="right" numeric>{formatINR(cn.amount)}</TableCell>
      <TableCell
        className={`max-w-[200px] truncate text-zinc-500 dark:text-zinc-400 ${isCancelled ? 'line-through' : ''}`}
        title={cn.reason}
      >
        {cn.reason.length > 50 ? cn.reason.slice(0, 50) + '…' : cn.reason}
      </TableCell>
      <TableCell>
        <Badge
          variant={STATUS_VARIANT[cn.status]}
          className={`capitalize ${isCancelled ? 'line-through' : ''}`}
        >
          {cn.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

export function CreditNoteListPage() {
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: customersData } = useCustomers({ limit: 100 });
  const { data, isLoading } = useCreditNotes({
    customerId: customerId || undefined,
    status: (status || undefined) as CreditNoteStatus | undefined,
  });

  const customers = customersData?.data ?? [];
  const creditNotes = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const customerOptions = [
    { value: '', label: 'All Customers' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Credit Notes"
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Credit Notes' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('credit-notes.csv', ['CN #', 'Date', 'Customer ID', 'Invoice ID', 'Amount', 'Reason', 'Status'], creditNotes.map(cn => [cn.creditNoteNumber, cn.issueDate, cn.customerId.slice(0, 8), cn.invoiceId ?? '', cn.amount, cn.reason, cn.status]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Link to="/ar/credit-notes/new">
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-700">
                <Plus size={16} />
                New Credit Note
              </button>
            </Link>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 py-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="sm:w-52">
            <Select
              label="Customer"
              options={customerOptions}
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
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

      <div className="flex flex-col gap-2 md:hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            ))
          : creditNotes.length === 0
            ? <EmptyState icon={FileMinus} title="No credit notes found" description="Issue a credit note to adjust a customer's invoice or account balance." />
            : creditNotes.map((cn) => <CreditNoteCard key={cn.id} cn={cn} />)
        }
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <tr>
              <Th>CN #</Th>
              <Th>Customer</Th>
              <Th>Invoice</Th>
              <Th>Date</Th>
              <Th align="right">Amount</Th>
              <Th>Reason</Th>
              <Th>Status</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : creditNotes.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={FileMinus}
                    title="No credit notes found"
                    description="Issue a credit note to adjust a customer's invoice or account balance."
                  />
                </td>
              </tr>
            ) : (
              creditNotes.map((cn) => <CreditNoteRow key={cn.id} cn={cn} />)
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

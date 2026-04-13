import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDownToLine, Plus, Download, Search } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useReceipts } from '../../../hooks/queries/use-receipts';
import { useCustomers } from '../../../hooks/queries/use-customers';
import type { PaymentReceipt } from '@runq/types';
import { formatINR } from '../../../lib/utils';
import {
  PageHeader,
  Button,
  Card,
  CardContent,
  Select,
  DateInput,
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

type ReceiptWithCustomer = PaymentReceipt & { customerName?: string };

function ReceiptCard({ receipt }: { receipt: ReceiptWithCustomer }) {
  return (
    <Link to="/ar/receipts/$receiptId" params={{ receiptId: receipt.id }}>
      <div className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {receipt.customerName ?? receipt.customerId.slice(0, 8)}
          </span>
          <span className="capitalize text-xs text-zinc-500 dark:text-zinc-400">{receipt.paymentMethod.replace(/_/g, ' ')}</span>
        </div>
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{receipt.receiptDate}</span>
          {receipt.referenceNumber && <span className="ml-2 font-mono">{receipt.referenceNumber}</span>}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{receipt.id.slice(0, 8)}…</span>
          <span className="font-mono font-medium text-sm text-zinc-900 dark:text-zinc-100">{formatINR(receipt.amount)}</span>
        </div>
      </div>
    </Link>
  );
}

function ReceiptRow({ receipt }: { receipt: ReceiptWithCustomer }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/ar/receipts/$receiptId"
          params={{ receiptId: receipt.id }}
          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {receipt.id.slice(0, 8)}…
        </Link>
      </TableCell>
      <TableCell className="text-sm text-zinc-900 dark:text-zinc-100">
        {receipt.customerName ?? '—'}
      </TableCell>
      <TableCell className="text-zinc-600 dark:text-zinc-400">{receipt.receiptDate}</TableCell>
      <TableCell align="right" numeric>{formatINR(receipt.amount)}</TableCell>
      <TableCell className="capitalize text-zinc-600 dark:text-zinc-400">
        {receipt.paymentMethod.replace(/_/g, ' ')}
      </TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {receipt.referenceNumber ?? '—'}
      </TableCell>
      <TableCell>
        <Link
          to="/ar/receipts/$receiptId"
          params={{ receiptId: receipt.id }}
          className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          View
        </Link>
      </TableCell>
    </TableRow>
  );
}

export function ReceiptListPage() {
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: customersData } = useCustomers({ limit: 100 });
  const customersList = customersData?.data ?? [];

  const { data, isLoading } = useReceipts({
    customerId: customerId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
  });

  const receipts = (data?.data ?? []) as ReceiptWithCustomer[];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const customerOptions = [
    { value: '', label: 'All Customers' },
    ...customersList.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div>
      <PageHeader
        title="Receipts"
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Receipts' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('receipts.csv', ['Receipt ID', 'Date', 'Customer', 'Amount', 'Payment Method', 'Reference'], receipts.map(r => [r.id.slice(0, 8), r.receiptDate, r.customerName ?? '', String(r.amount), r.paymentMethod.replace(/_/g, ' '), r.referenceNumber ?? '']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Link to="/ar/receipts/new">
              <button className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-700">
                <Plus size={16} />
                Record Receipt
              </button>
            </Link>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 py-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="relative col-span-2 sm:w-52">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search customer, reference..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="block w-full rounded-md border border-zinc-300 bg-white py-2 pl-8 pr-3 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-indigo-400"
            />
          </div>
          <div className="sm:w-52">
            <Select
              label="Customer"
              options={customerOptions}
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
            />
          </div>
          <div className="sm:w-40">
            <DateInput
              label="From"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
          </div>
          <div className="sm:w-40">
            <DateInput
              label="To"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 md:hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            ))
          : receipts.length === 0
            ? <EmptyState icon={ArrowDownToLine} title="No receipts found" description="Record a payment received from a customer against their invoices." />
            : receipts.map((r) => <ReceiptCard key={r.id} receipt={r} />)
        }
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <tr>
              <Th>Receipt ID</Th>
              <Th>Customer</Th>
              <Th>Date</Th>
              <Th align="right">Amount</Th>
              <Th>Method</Th>
              <Th>Reference</Th>
              <Th />
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={8} cols={7} />
            ) : receipts.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={ArrowDownToLine}
                    title="No receipts found"
                    description="Record a payment received from a customer against their invoices."
                  />
                </td>
              </tr>
            ) : (
              receipts.map((r) => <ReceiptRow key={r.id} receipt={r} />)
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

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDownToLine, Plus, Download } from 'lucide-react';
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

function ReceiptRow({ receipt }: { receipt: PaymentReceipt }) {
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
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {receipt.customerId.slice(0, 8)}…
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
  const [customerId, setCustomerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: customersData } = useCustomers({ limit: 100 });
  const customers = customersData?.data ?? [];

  const { data, isLoading } = useReceipts({
    customerId: customerId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const receipts = data?.data ?? [];
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
        title="Receipts"
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Receipts' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('receipts.csv', ['Receipt ID', 'Date', 'Customer ID', 'Amount', 'Payment Method', 'Reference'], receipts.map(r => [r.id.slice(0, 8), r.receiptDate, r.customerId.slice(0, 8), r.amount, r.paymentMethod.replace(/_/g, ' '), r.referenceNumber]))}>
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
        <CardContent className="flex flex-wrap items-end gap-3 py-3">
          <div className="w-52">
            <Select
              label="Customer"
              options={customerOptions}
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-44">
            <DateInput
              label="From"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-44">
            <DateInput
              label="To"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

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

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowDownToLine, Plus, Download, Search, Link as LinkIcon, ChevronRight } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useReceipts } from '@/hooks/queries/use-receipts';
import { useCustomers } from '@/hooks/queries/use-customers';
import type { PaymentReceipt } from '@runq/types';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Input, Select, StatTile, PaymentMethodBadge, Avatar,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState, formatDate,
} from '@/components/ar/primitives';
import { useIsReadOnly } from '@/providers/auth-provider';

const METHOD_OPTIONS = [
  { value: '', label: 'All payment methods' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'rtgs', label: 'RTGS' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
];

const LIMIT = 25;

type ReceiptWithCustomer = PaymentReceipt & { customerName?: string };

export function ReceiptListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);

  const { data: customersData } = useCustomers({ limit: 100 });
  const customersList = customersData?.data ?? [];

  const { data, isLoading } = useReceipts({
    customerId: customerId || undefined,
    search: search || undefined,
  }, page);

  const allReceipts = (data?.data ?? []) as ReceiptWithCustomer[];
  const receipts = method ? allReceipts.filter((r) => r.paymentMethod === method) : allReceipts;
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const customerOptions = [
    { value: '', label: 'All customers' },
    ...customersList.map((c) => ({ value: c.id, label: c.name })),
  ];

  const totalAmount = receipts.reduce((a, r) => a + r.amount, 0);
  const byMethod = receipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.paymentMethod] = (acc[r.paymentMethod] || 0) + r.amount;
    return acc;
  }, {});

  function handleView(id: string) {
    navigate({ to: '/ar/receipts/$receiptId', params: { receiptId: id } });
  }

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Receipts' }]}
        title="Receipts"
        description="Customer payments — bank transfers, UPI, cheques, and gateway settlements."
        actions={
          <>
            <Button variant="outline" size="sm" icon={<LinkIcon size={13} />}>Match unallocated</Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() =>
                downloadCSV(
                  'receipts.csv',
                  ['Receipt ID', 'Date', 'Customer', 'Amount', 'Payment Method', 'Reference'],
                  receipts.map((r) => [
                    r.id.slice(0, 8), r.receiptDate, r.customerName ?? '',
                    String(r.amount), r.paymentMethod.replace(/_/g, ' '), r.referenceNumber ?? '',
                  ]),
                )
              }
            >
              Export
            </Button>
            {!readOnly && (
              <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/ar/receipts/new' })}>
                Record receipt
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Total received (in view)"
          value={formatINRShort(totalAmount)}
          sub={`${receipts.length} receipt${receipts.length === 1 ? '' : 's'}`}
          tone="pos"
        />
        <StatTile
          label="Bank transfers"
          value={formatINRShort(byMethod.bank_transfer ?? 0)}
          sub="NEFT"
        />
        <StatTile
          label="RTGS"
          value={formatINRShort(byMethod.rtgs ?? 0)}
          sub="High-value transfers"
        />
        <StatTile
          label="UPI"
          value={formatINRShort(byMethod.upi ?? 0)}
          sub="Instant payments"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search customer or reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          options={METHOD_OPTIONS}
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        />
        <div className="w-56">
          <Select
            options={customerOptions}
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{total} receipts</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Date</Th>
            <Th>Customer</Th>
            <Th>Method</Th>
            <Th>Reference</Th>
            <Th align="right">Amount</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[120px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : receipts.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyState
                  icon={<ArrowDownToLine size={18} />}
                  title="No receipts found"
                  description="Record a payment received from a customer against their invoices."
                  action={(
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/ar/receipts/new' })}>
                      Record receipt
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : receipts.map((r) => (
            <TableRow key={r.id} onClick={() => handleView(r.id)}>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(r.receiptDate)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar name={r.customerName ?? '?'} size={24} />
                  <span className="font-medium" style={{ color: 'var(--text-1)' }}>
                    {r.customerName ?? `${r.customerId.slice(0, 8)}…`}
                  </span>
                </div>
              </TableCell>
              <TableCell><PaymentMethodBadge method={r.paymentMethod} /></TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>
                {r.referenceNumber ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell align="right" numeric className="font-semibold" style={{ color: 'var(--pos)' }}>
                {formatINR(r.amount)}
              </TableCell>
              <TableCell align="right">
                <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-3">
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

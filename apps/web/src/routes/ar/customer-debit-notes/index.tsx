import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { FilePlus, Plus, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useCustomerDebitNotes } from '@/hooks/queries/use-customer-debit-notes';
import { useCustomers } from '@/hooks/queries/use-customers';
import type { CustomerDebitNote, CustomerDebitNoteStatus } from '@runq/types';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Select, StatTile, StatusBadge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState, formatDate,
} from '@/components/ar/primitives';
import { useIsReadOnly } from '@/providers/auth-provider';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'adjusted', label: 'Adjusted' },
  { value: 'cancelled', label: 'Cancelled' },
];

const LIMIT = 25;

type CustomerDebitNoteWithCustomerName = CustomerDebitNote & { customerName?: string };

export function CustomerDebitNoteListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: customersData } = useCustomers({ limit: 100 });
  const { data, isLoading } = useCustomerDebitNotes(
    {
      customerId: customerId || undefined,
      status: (status || undefined) as CustomerDebitNoteStatus | undefined,
    },
    page,
  );

  const customers = customersData?.data ?? [];
  const customerDebitNotes = (data?.data ?? []) as CustomerDebitNoteWithCustomerName[];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const customerOptions = [
    { value: '', label: 'All customers' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  // KPI calculations (against current page or all on view)
  const totalIssued = customerDebitNotes
    .filter((c) => c.status === 'issued' || c.status === 'adjusted')
    .reduce((a, c) => a + c.amount, 0);
  const issuedCount = customerDebitNotes.filter((c) => c.status === 'issued' || c.status === 'adjusted').length;
  const pendingCount = customerDebitNotes.filter((c) => c.status === 'issued').length;
  const draftCount = customerDebitNotes.filter((c) => c.status === 'draft').length;
  const avgAmount = customerDebitNotes.length > 0
    ? Math.round(customerDebitNotes.reduce((a, c) => a + c.amount, 0) / customerDebitNotes.length)
    : 0;

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Debit notes' }]}
        title="Debit notes"
        description="Additional charges raised on customers (post-invoice corrections, missed billing)."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() =>
                downloadCSV(
                  'customer-debit-notes.csv',
                  ['DN #', 'Date', 'Customer', 'Invoice ID', 'Amount', 'Reason', 'Status'],
                  customerDebitNotes.map((c) => [
                    c.debitNoteNumber, c.issueDate, c.customerName ?? c.customerId,
                    c.invoiceId ?? '', c.amount, c.reason, c.status,
                  ]),
                )
              }
            >
              Export
            </Button>
            {!readOnly && (
              <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ar/customer-debit-notes/new' })}>
                New debit note
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Issued (this view)"
          value={issuedCount}
          sub={formatINRShort(totalIssued)}
        />
        <StatTile
          label="Pending adjustment"
          value={pendingCount}
          sub="Not yet applied"
          tone="warn"
        />
        <StatTile label="Drafts" value={draftCount} sub="Awaiting issue" />
        <StatTile
          label="Avg. amount"
          value={formatINRShort(avgAmount)}
          sub="Per debit note"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            options={customerOptions}
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{total} debit notes</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Debit note #</Th>
            <Th>Customer</Th>
            <Th>Linked invoice</Th>
            <Th>Issued</Th>
            <Th>Reason</Th>
            <Th align="right">Amount</Th>
            <Th>Status</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[120px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : customerDebitNotes.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<FilePlus size={18} />}
                  title="No debit notes found"
                  description="Issue a debit note to adjust a customer's invoice or account balance."
                />
              </td>
            </tr>
          ) : customerDebitNotes.map((cdn) => (
            <TableRow
              key={cdn.id}
              onClick={() => navigate({ to: '/finance/ar/customer-debit-notes/$customerDebitNoteId', params: { customerDebitNoteId: cdn.id } })}
            >
              <TableCell>
                <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                  {cdn.debitNoteNumber}
                </span>
              </TableCell>
              <TableCell>
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>
                  {cdn.customerName ?? `${cdn.customerId.slice(0, 8)}…`}
                </span>
              </TableCell>
              <TableCell>
                {cdn.invoiceId ? (
                  <Link
                    to="/finance/ar/invoices/$invoiceId"
                    params={{ invoiceId: cdn.invoiceId }}
                    onClick={(e) => e.stopPropagation()}
                    className="num text-[11.5px] hover:underline"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {cdn.invoiceId.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>Standalone</span>
                )}
              </TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(cdn.issueDate)}</TableCell>
              <TableCell>
                <span className="text-[12px]" style={{ color: 'var(--text-2)' }} title={cdn.reason}>
                  {cdn.reason.length > 50 ? cdn.reason.slice(0, 50) + '…' : cdn.reason}
                </span>
              </TableCell>
              <TableCell align="right" numeric className="font-semibold">
                {formatINR(cdn.amount)}
              </TableCell>
              <TableCell><StatusBadge status={cdn.status} /></TableCell>
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

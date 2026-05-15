import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { FileMinus, Plus, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useCreditNotes } from '@/hooks/queries/use-credit-notes';
import { useCustomers } from '@/hooks/queries/use-customers';
import type { CreditNote, CreditNoteStatus } from '@runq/types';
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

type CreditNoteWithCustomerName = CreditNote & { customerName?: string };

export function CreditNoteListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: customersData } = useCustomers({ limit: 100 });
  const { data, isLoading } = useCreditNotes(
    {
      customerId: customerId || undefined,
      status: (status || undefined) as CreditNoteStatus | undefined,
    },
    page,
  );

  const customers = customersData?.data ?? [];
  const creditNotes = (data?.data ?? []) as CreditNoteWithCustomerName[];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const customerOptions = [
    { value: '', label: 'All customers' },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  // KPI calculations (against current page or all on view)
  const totalIssued = creditNotes
    .filter((c) => c.status === 'issued' || c.status === 'adjusted')
    .reduce((a, c) => a + c.amount, 0);
  const issuedCount = creditNotes.filter((c) => c.status === 'issued' || c.status === 'adjusted').length;
  const pendingCount = creditNotes.filter((c) => c.status === 'issued').length;
  const draftCount = creditNotes.filter((c) => c.status === 'draft').length;
  const avgAmount = creditNotes.length > 0
    ? Math.round(creditNotes.reduce((a, c) => a + c.amount, 0) / creditNotes.length)
    : 0;

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Credit notes' }]}
        title="Credit notes"
        description="Refunds, adjustments, and discounts issued against sales invoices."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() =>
                downloadCSV(
                  'credit-notes.csv',
                  ['CN #', 'Date', 'Customer', 'Invoice ID', 'Amount', 'Reason', 'Status'],
                  creditNotes.map((c) => [
                    c.creditNoteNumber, c.issueDate, c.customerName ?? c.customerId,
                    c.invoiceId ?? '', c.amount, c.reason, c.status,
                  ]),
                )
              }
            >
              Export
            </Button>
            {!readOnly && (
              <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ar/credit-notes/new' })}>
                New credit note
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
          sub="Per credit note"
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
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>{total} credit notes</span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Credit note #</Th>
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
          ) : creditNotes.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<FileMinus size={18} />}
                  title="No credit notes found"
                  description="Issue a credit note to adjust a customer's invoice or account balance."
                />
              </td>
            </tr>
          ) : creditNotes.map((cn) => (
            <TableRow
              key={cn.id}
              onClick={() => navigate({ to: '/finance/ar/credit-notes/$creditNoteId', params: { creditNoteId: cn.id } })}
            >
              <TableCell>
                <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                  {cn.creditNoteNumber}
                </span>
              </TableCell>
              <TableCell>
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>
                  {cn.customerName ?? `${cn.customerId.slice(0, 8)}…`}
                </span>
              </TableCell>
              <TableCell>
                {cn.invoiceId ? (
                  <Link
                    to="/finance/ar/invoices/$invoiceId"
                    params={{ invoiceId: cn.invoiceId }}
                    onClick={(e) => e.stopPropagation()}
                    className="num text-[11.5px] hover:underline"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {cn.invoiceId.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>Standalone</span>
                )}
              </TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(cn.issueDate)}</TableCell>
              <TableCell>
                <span className="text-[12px]" style={{ color: 'var(--text-2)' }} title={cn.reason}>
                  {cn.reason.length > 50 ? cn.reason.slice(0, 50) + '…' : cn.reason}
                </span>
              </TableCell>
              <TableCell align="right" numeric className="font-semibold">
                {formatINR(cn.amount)}
              </TableCell>
              <TableCell><StatusBadge status={cn.status} /></TableCell>
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

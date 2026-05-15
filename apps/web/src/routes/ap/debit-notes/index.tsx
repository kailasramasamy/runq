import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { FileWarning, Plus, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useDebitNotes } from '@/hooks/queries/use-debit-notes';
import { useVendors } from '@/hooks/queries/use-vendors';
import type { DebitNote } from '@runq/types';
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

export function DebitNoteListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [vendorId, setVendorId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: vendorData } = useVendors({ limit: 100 });
  const { data, isLoading } = useDebitNotes({
    vendorId: vendorId || undefined,
    status: status || undefined,
    page,
    limit: LIMIT,
  });

  const vendors = vendorData?.data ?? [];
  const debitNotes = (data?.data ?? []) as Array<DebitNote & { vendorName?: string; invoiceNumber?: string | null }>;
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const issuedTotal = debitNotes
    .filter((d) => d.status === 'issued' || d.status === 'adjusted')
    .reduce((a, d) => a + Number(d.amount), 0);
  const issuedCount = debitNotes.filter((d) => d.status === 'issued' || d.status === 'adjusted').length;
  const pendingCount = debitNotes.filter((d) => d.status === 'issued').length;
  const draftCount = debitNotes.filter((d) => d.status === 'draft').length;

  const vendorOptions = [
    { value: '', label: 'All vendors' },
    ...vendors.map((v) => ({ value: v.id, label: v.name })),
  ];

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Debit notes' }]}
        title="Debit notes"
        description="Vendor deductions and adjustments — record returns, short-supplies, and discounts."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() =>
                downloadCSV(
                  'debit-notes.csv',
                  ['DN #', 'Date', 'Vendor', 'Amount', 'Status'],
                  debitNotes.map((d) => [
                    d.debitNoteNumber, d.issueDate, d.vendorName ?? '',
                    String(d.amount), d.status,
                  ]),
                )
              }
            >
              Export
            </Button>
            {!readOnly && (
              <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ap/debit-notes/new' })}>
                New debit note
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Issued (in view)"
          value={issuedCount}
          sub={formatINRShort(issuedTotal)}
        />
        <StatTile
          label="Pending adjustment"
          value={pendingCount}
          sub="Not yet applied"
          tone={pendingCount > 0 ? 'warn' : 'neutral'}
        />
        <StatTile label="Drafts" value={draftCount} sub="Awaiting issue" />
        <StatTile
          label="Avg. amount"
          value={formatINRShort(debitNotes.length > 0 ? Math.round(debitNotes.reduce((a, d) => a + Number(d.amount), 0) / debitNotes.length) : 0)}
          sub="Per debit note"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            options={vendorOptions}
            value={vendorId}
            onChange={(e) => { setVendorId(e.target.value); setPage(1); }}
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
            <Th>Vendor</Th>
            <Th>Linked bill</Th>
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
          ) : debitNotes.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<FileWarning size={18} />}
                  title="No debit notes found"
                  description="Raise a debit note to capture vendor deductions or adjustments."
                />
              </td>
            </tr>
          ) : debitNotes.map((dn) => (
            <TableRow
              key={dn.id}
              onClick={() => navigate({ to: '/finance/ap/debit-notes/$debitNoteId', params: { debitNoteId: dn.id } })}
            >
              <TableCell>
                <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>
                  {dn.debitNoteNumber}
                </span>
              </TableCell>
              <TableCell>
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>
                  {dn.vendorName ?? `${dn.vendorId.slice(0, 8)}…`}
                </span>
              </TableCell>
              <TableCell>
                {dn.invoiceId ? (
                  <Link
                    to="/finance/ap/bills/$billId"
                    params={{ billId: dn.invoiceId }}
                    onClick={(e) => e.stopPropagation()}
                    className="num text-[11.5px] hover:underline"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {dn.invoiceNumber ?? `${dn.invoiceId.slice(0, 8)}…`}
                  </Link>
                ) : (
                  <span className="text-[11.5px]" style={{ color: 'var(--text-3)' }}>Standalone</span>
                )}
              </TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(dn.issueDate)}</TableCell>
              <TableCell>
                <span className="text-[12px]" style={{ color: 'var(--text-2)' }} title={dn.reason}>
                  {dn.reason.length > 50 ? dn.reason.slice(0, 50) + '…' : dn.reason}
                </span>
              </TableCell>
              <TableCell align="right" numeric className="font-semibold">{formatINR(Number(dn.amount))}</TableCell>
              <TableCell><StatusBadge status={dn.status} /></TableCell>
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

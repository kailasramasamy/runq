import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Upload, Download, Users, Search, ChevronRight, Trash2, MoreHorizontal } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useCustomers, useDeleteCustomer } from '@/hooks/queries/use-customers';
import { formatINR, formatINRShort } from '@/lib/utils';
import {
  PageHeader, Button, Badge, Input, Select, StatTile,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState, Avatar,
} from '@/components/ar/primitives';
import { ConfirmationDialog } from '@/components/ui';
import { useIsReadOnly } from '@/providers/auth-provider';

const LIMIT = 25;

const TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'b2b', label: 'B2B' },
  { value: 'b2c', label: 'B2C' },
  { value: 'payment_gateway', label: 'Payment gateway' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active only' },
  { value: 'inactive', label: 'Inactive only' },
];

export function CustomerListPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useCustomers({
    search: search || undefined,
    type: (typeFilter || undefined) as 'b2b' | 'b2c' | 'payment_gateway' | undefined,
    page,
    limit: LIMIT,
    // The customers list is the one place inactive accounts must be visible.
    // Other dropdowns / pickers don't pass these flags so they default to
    // active-only — inactive customers are effectively hidden across the app.
    includeInactive: true,
    active: statusFilter === 'active' ? 'true' : statusFilter === 'inactive' ? 'false' : undefined,
  });
  const deleteMutation = useDeleteCustomer();

  const customers = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const totalOutstanding = customers.reduce((a, c) => a + (c.outstandingAmount || 0), 0);
  const overdueCount = customers.filter((c) => (c.overdueAmount || 0) > 0).length;
  const activeCount = customers.filter((c) => c.isActive).length;

  function handleView(id: string) {
    navigate({ to: '/ar/customers/$customerId', params: { customerId: id } });
  }
  function handleDeleteConfirm() {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  }

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Customers' }]}
        title="Customers"
        description="Manage your customer relationships and outstanding balances."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() =>
                downloadCSV(
                  'customers.csv',
                  ['Name', 'Email', 'Phone', 'GSTIN', 'Outstanding', 'Status'],
                  customers.map((c) => [
                    c.name, c.email, c.phone, c.gstin, c.outstandingAmount, c.isActive ? 'Active' : 'Inactive',
                  ]),
                )
              }
            >
              Export CSV
            </Button>
            {!readOnly && (
              <>
                <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => navigate({ to: '/ar/customers/import' })}>
                  Import customers
                </Button>
                <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/ar/customers/new' })}>
                  New customer
                </Button>
              </>
            )}
          </>
        }
      />

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Total customers"
          value={total}
          sub={`${activeCount} active in view`}
        />
        <StatTile
          label="Outstanding (in view)"
          value={formatINRShort(totalOutstanding)}
          sub="Across listed accounts"
        />
        <StatTile
          label="Overdue accounts"
          value={overdueCount}
          sub="With balance past due"
          tone={overdueCount > 0 ? 'warn' : 'neutral'}
        />
        <StatTile
          label="Customers shown"
          value={customers.length}
          sub={`Page ${page} of ${totalPages}`}
        />
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search customers…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          options={TYPE_FILTER_OPTIONS}
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
        />
        <Select
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
        />
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
          {total} customer{total === 1 ? '' : 's'}
        </span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Contact</Th>
            <Th>Terms</Th>
            <Th align="right">Outstanding</Th>
            <Th>Status</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[140px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : customers.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<Users size={18} />}
                  title={search ? 'No customers match your search' : 'No customers yet'}
                  description={search ? 'Try a different search term.' : 'Add your first customer to get started.'}
                  action={!search && (
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/ar/customers/new' })}>
                      New customer
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : customers.map((c) => (
            <TableRow key={c.id} onClick={() => handleView(c.id)}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Avatar name={c.name} size={28} />
                  <div className="min-w-0">
                    <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{c.name}</div>
                    {c.gstin && (
                      <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{c.gstin}</div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={c.type === 'b2b' ? 'info' : c.type === 'payment_gateway' ? 'primary' : 'default'}>
                  {c.type === 'b2b' ? 'B2B' : c.type === 'payment_gateway' ? 'Gateway' : 'B2C'}
                </Badge>
              </TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>
                {c.contactPerson && <div className="text-[12.5px]">{c.contactPerson}</div>}
                {c.email && <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{c.email}</div>}
                {!c.contactPerson && !c.email && <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>Net {c.paymentTermsDays}d</TableCell>
              <TableCell align="right" numeric className="font-semibold">
                {(c.outstandingAmount ?? 0) > 0 ? formatINR(c.outstandingAmount) : <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell>
                <Badge variant={c.isActive ? 'success' : 'outline'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
              </TableCell>
              <TableCell align="right">
                <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => setDeleteId(c.id)}
                    aria-label="Delete customer"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => handleView(c.id)}
                    aria-label="View customer"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                  <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
                </div>
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

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Customer"
        description="This customer will be permanently deleted. Any linked invoices or receipts will remain but the customer record cannot be recovered."
        confirmLabel="Delete Customer"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

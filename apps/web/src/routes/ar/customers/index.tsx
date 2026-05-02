import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Search, Eye, Trash2, Users, Upload, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useCustomers, useDeleteCustomer } from '@/hooks/queries/use-customers';
import { formatINR } from '@/lib/utils';
import type { CustomerWithOutstanding } from '@runq/types';
import {
  PageHeader, Badge, Button, Input, Select,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  TableSkeleton, EmptyState, Pagination, ConfirmationDialog,
} from '@/components/ui';

const LIMIT = 20;

const TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'b2b', label: 'B2B' },
  { value: 'b2c', label: 'B2C' },
  { value: 'payment_gateway', label: 'Payment Gateway' },
];

function CustomerCard({
  customer,
  onView,
  onDelete,
}: {
  customer: CustomerWithOutstanding;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
      onClick={() => onView(customer.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{customer.name}</p>
            {customer.nickname && <Badge variant="info">{customer.nickname}</Badge>}
          </div>
          {customer.email && (
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{customer.email}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onView(customer.id)}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="View customer"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={() => onDelete(customer.id)}
            className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            aria-label="Delete customer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={customer.type === 'b2b' ? 'info' : 'primary'}>
          {customer.type === 'b2b' ? 'B2B' : 'PG'}
        </Badge>
        <Badge variant={customer.isActive ? 'success' : 'default'}>
          {customer.isActive ? 'Active' : 'Inactive'}
        </Badge>
        <span className="text-zinc-500 dark:text-zinc-400">Net {customer.paymentTermsDays}d</span>
        <span className="ml-auto font-mono font-medium text-zinc-900 dark:text-zinc-100">
          {formatINR(customer.outstandingAmount)}
        </span>
      </div>
    </div>
  );
}

function CustomerRow({
  customer,
  onView,
  onDelete,
}: {
  customer: CustomerWithOutstanding;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={() => onView(customer.id)}>
      <TableCell className="font-medium">{customer.name}</TableCell>
      <TableCell>
        {customer.nickname && <Badge variant="info">{customer.nickname}</Badge>}
      </TableCell>
      <TableCell>
        <Badge variant={customer.type === 'b2b' ? 'info' : 'primary'}>
          {customer.type === 'b2b' ? 'B2B' : 'Payment Gateway'}
        </Badge>
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">{customer.email ?? '—'}</TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">{customer.phone ?? '—'}</TableCell>
      <TableCell>Net {customer.paymentTermsDays}d</TableCell>
      <TableCell align="right" numeric className="font-mono text-sm">
        {formatINR(customer.outstandingAmount)}
      </TableCell>
      <TableCell>
        <Badge variant={customer.isActive ? 'success' : 'default'}>
          {customer.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onView(customer.id)}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="View customer"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={() => onDelete(customer.id)}
            className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            aria-label="Delete customer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CustomerListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useCustomers({
    search: search || undefined,
    type: typeFilter as 'b2b' | 'b2c' | 'payment_gateway' | undefined || undefined,
    page,
    limit: LIMIT,
  });
  const deleteMutation = useDeleteCustomer();

  const customers = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  function handleView(id: string) {
    navigate({ to: '/ar/customers/$customerId', params: { customerId: id } });
  }

  function handleDeleteConfirm() {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Customers' }]}
        title="Customers"
        description="Manage your customer relationships and outstanding balances."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('customers.csv', ['Name', 'Email', 'Phone', 'GSTIN', 'Outstanding', 'Status'], customers.map(c => [c.name, c.email, c.phone, c.gstin, c.outstandingAmount, c.isActive ? 'Active' : 'Inactive']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: '/ar/customers/import' })}>
              <Upload size={16} />
              Import Customers
            </Button>
            <Button onClick={() => navigate({ to: '/ar/customers/new' })}>
              <Plus size={16} />
              New Customer
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-72">
          <Input
            placeholder="Search customers…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        </div>
        <div className="col-span-2 sm:w-48">
          <Select
            options={TYPE_FILTER_OPTIONS}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Mobile card view */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No customers match your search' : 'No customers yet'}
            description={search ? 'Try a different search term.' : 'Add your first customer to get started.'}
            action={
              !search ? (
                <Button size="sm" onClick={() => navigate({ to: '/ar/customers/new' })}>
                  <Plus size={14} /> New Customer
                </Button>
              ) : undefined
            }
            helpHref={!search ? '/help/recipes/02-add-customer' : undefined}
          />
        ) : (
          customers.map((c) => (
            <CustomerCard key={c.id} customer={c} onView={handleView} onDelete={setDeleteId} />
          ))
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <tr>
              <Th>Name</Th>
              <Th>Nickname</Th>
              <Th>Type</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Terms</Th>
              <Th align="right">Outstanding</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={6} cols={9} />
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    icon={Users}
                    title={search ? 'No customers match your search' : 'No customers yet'}
                    description={
                      search
                        ? 'Try a different search term.'
                        : 'Add your first customer to get started.'
                    }
                    action={
                      !search ? (
                        <Button size="sm" onClick={() => navigate({ to: '/ar/customers/new' })}>
                          <Plus size={14} /> New Customer
                        </Button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <CustomerRow key={c.id} customer={c} onView={handleView} onDelete={setDeleteId} />
              ))
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
            limit={LIMIT}
            onPageChange={setPage}
          />
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

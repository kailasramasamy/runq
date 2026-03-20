import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Search, Eye, Trash2, Users } from 'lucide-react';
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
  { value: 'payment_gateway', label: 'Payment Gateway' },
];

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
        <Badge variant={customer.type === 'b2b' ? 'info' : 'primary'}>
          {customer.type === 'b2b' ? 'B2B' : 'Payment Gateway'}
        </Badge>
      </TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">{customer.email ?? '—'}</TableCell>
      <TableCell className="text-zinc-500 dark:text-zinc-400">{customer.phone ?? '—'}</TableCell>
      <TableCell>Net {customer.paymentTermsDays}d</TableCell>
      <TableCell numeric className="font-mono text-sm">
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
    type: typeFilter as 'b2b' | 'payment_gateway' | undefined || undefined,
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
          <Button onClick={() => navigate({ to: '/ar/customers/new' })}>
            <Plus size={16} />
            New Customer
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-72">
          <Input
            placeholder="Search customers…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        </div>
        <div className="w-48">
          <Select
            options={TYPE_FILTER_OPTIONS}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
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
            <TableSkeleton rows={6} cols={8} />
          ) : customers.length === 0 ? (
            <tr>
              <td colSpan={8}>
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

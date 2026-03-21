import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Search, Eye, Trash2, Users } from 'lucide-react';
import { useVendors, useDeleteVendor } from '@/hooks/queries/use-vendors';
import type { Vendor } from '@runq/types';
import {
  PageHeader, Badge, Button, Input, Select,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  TableSkeleton, EmptyState, Pagination, ConfirmationDialog,
} from '@/components/ui';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'service_provider', label: 'Service Provider' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

function formatCategory(cat: string | null): string {
  if (!cat) return '—';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const LIMIT = 20;

function VendorRow({
  vendor,
  onView,
  onDelete,
}: {
  vendor: Vendor;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={() => onView(vendor.id)}>
      <TableCell className="font-medium">{vendor.name}</TableCell>
      <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {vendor.gstin ?? '—'}
      </TableCell>
      <TableCell>{vendor.city ?? '—'}</TableCell>
      <TableCell>{vendor.state ?? '—'}</TableCell>
      <TableCell>{formatCategory(vendor.category)}</TableCell>
      <TableCell>Net {vendor.paymentTermsDays}d</TableCell>
      <TableCell>
        <Badge variant={vendor.isActive ? 'success' : 'default'}>
          {vendor.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onView(vendor.id)}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="View vendor"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={() => onDelete(vendor.id)}
            className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            aria-label="Delete vendor"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function VendorListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useVendors({ search: search || undefined, page, limit: LIMIT });
  const deleteMutation = useDeleteVendor();

  const allVendors = data?.data ?? [];
  const vendors = category ? allVendors.filter((v) => v.category === category) : allVendors;
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  function handleView(id: string) {
    navigate({ to: '/ap/vendors/$vendorId', params: { vendorId: id } });
  }

  function handleDeleteConfirm() {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Vendors' }]}
        title="Vendors"
        description="Manage your supplier and vendor relationships."
        actions={
          <Button onClick={() => navigate({ to: '/ap/vendors/new' })}>
            <Plus size={16} />
            New Vendor
          </Button>
        }
      />

      <div className="mb-4 flex items-end gap-3">
        <div className="w-72">
          <Input
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
          <Search size={15} className="pointer-events-none absolute mt-[-30px] ml-3 text-zinc-400" />
        </div>
        <div className="w-48">
          <Select
            label=""
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>GSTIN</Th>
            <Th>City</Th>
            <Th>State</Th>
            <Th>Category</Th>
            <Th>Terms</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : vendors.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <EmptyState
                  icon={Users}
                  title={search ? 'No vendors match your search' : 'No vendors yet'}
                  description={search ? 'Try a different search term.' : 'Add your first vendor to get started.'}
                  action={
                    !search ? (
                      <Button size="sm" onClick={() => navigate({ to: '/ap/vendors/new' })}>
                        <Plus size={14} /> New Vendor
                      </Button>
                    ) : undefined
                  }
                />
              </td>
            </tr>
          ) : (
            vendors.map((v) => (
              <VendorRow key={v.id} vendor={v} onView={handleView} onDelete={setDeleteId} />
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
        </div>
      )}

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Vendor"
        description="This vendor will be permanently deleted. Any linked invoices or payments will remain but the vendor record cannot be recovered."
        confirmLabel="Delete Vendor"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

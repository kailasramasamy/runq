import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Search, Eye, Trash2, Users, Upload, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('vendors.csv', ['Name', 'Email', 'Phone', 'GSTIN', 'Category', 'Payment Terms', 'Status'], vendors.map(v => [v.name, v.email ?? '', v.phone ?? '', v.gstin ?? '', formatCategory(v.category), `Net ${v.paymentTermsDays}d`, v.isActive ? 'Active' : 'Inactive']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: '/ap/vendors/import' })}>
              <Upload size={16} />
              Import Vendors
            </Button>
            <Button onClick={() => navigate({ to: '/ap/vendors/new' })}>
              <Plus size={16} />
              New Vendor
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="relative col-span-2 sm:w-72">
          <Input
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
          <Search size={15} className="pointer-events-none absolute mt-[-30px] ml-3 text-zinc-400" />
        </div>
        <div className="col-span-2 sm:w-48">
          <Select
            label=""
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : vendors.length === 0 ? (
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
        ) : (
          vendors.map((v) => (
            <div
              key={v.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => handleView(v.id)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{v.name}</span>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleView(v.id)}
                    className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    aria-label="View vendor"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteId(v.id)}
                    className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    aria-label="Delete vendor"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{v.email ?? '—'}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Badge variant={v.isActive ? 'success' : 'default'}>{v.isActive ? 'Active' : 'Inactive'}</Badge>
                {v.category && <Badge variant="outline">{formatCategory(v.category)}</Badge>}
                <span>Net {v.paymentTermsDays}d</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
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
      </div>

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

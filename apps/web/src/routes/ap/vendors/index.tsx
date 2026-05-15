import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Upload, Download, Building2, Search, ChevronRight, Trash2, MoreHorizontal } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useVendors, useDeleteVendor } from '@/hooks/queries/use-vendors';
import {
  PageHeader, Button, Badge, Input, Select, StatTile,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  Pagination, EmptyState, Avatar,
} from '@/components/ar/primitives';
import { ConfirmationDialog } from '@/components/ui';
import { useIsReadOnly } from '@/providers/auth-provider';

const LIMIT = 25;

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'raw_material', label: 'Raw material' },
  { value: 'service_provider', label: 'Service provider' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

function formatCategory(cat: string | null): string {
  if (!cat) return '—';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function VendorListPage() {
  const readOnly = useIsReadOnly();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useVendors({
    search: search || undefined,
    category: category || undefined,
    tag: tag || undefined,
    page,
    limit: LIMIT,
  });
  const deleteMutation = useDeleteVendor();

  const vendors = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  const activeCount = vendors.filter((v) => v.isActive).length;
  const withGstin = vendors.filter((v) => v.gstin).length;
  const categoryCount = new Set(vendors.map((v) => v.category).filter(Boolean)).size;

  function handleView(id: string) {
    navigate({ to: '/finance/ap/vendors/$vendorId', params: { vendorId: id } });
  }
  function handleDeleteConfirm() {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
  }

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'AP', href: '/ap' }, { label: 'Vendors' }]}
        title="Vendors"
        description="Manage your supplier and vendor relationships."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={() =>
                downloadCSV(
                  'vendors.csv',
                  ['Name', 'Email', 'Phone', 'GSTIN', 'Category', 'Payment Terms', 'Status'],
                  vendors.map((v) => [
                    v.name, v.email ?? '', v.phone ?? '', v.gstin ?? '',
                    formatCategory(v.category), `Net ${v.paymentTermsDays}d`,
                    v.isActive ? 'Active' : 'Inactive',
                  ]),
                )
              }
            >
              Export CSV
            </Button>
            {!readOnly && (
              <>
                <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => navigate({ to: '/finance/ap/vendors/import' })}>
                  Import vendors
                </Button>
                <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ap/vendors/new' })}>
                  New vendor
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total vendors" value={total} sub={`${activeCount} active in view`} />
        <StatTile label="With GSTIN" value={withGstin} sub="Tax-registered" />
        <StatTile label="Categories" value={categoryCount} sub="In view" />
        <StatTile label="Vendors shown" value={vendors.length} sub={`Page ${page} of ${totalPages}`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-72 max-w-full">
          <Input
            icon={<Search size={13} />}
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
        />
        <div className="w-48 max-w-full">
          <Input
            placeholder="Filter by tag…"
            value={tag}
            onChange={(e) => { setTag(e.target.value); setPage(1); }}
          />
        </div>
        {tag && (
          <button
            onClick={() => { setTag(''); setPage(1); }}
            className="text-[12px]"
            style={{ color: 'var(--text-3)' }}
          >
            Clear tag
          </button>
        )}
        <div className="flex-1" />
        <span className="num text-[12px]" style={{ color: 'var(--text-3)' }}>
          {total} vendor{total === 1 ? '' : 's'}
        </span>
      </div>

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Tags</Th>
            <Th>Category</Th>
            <Th>Contact</Th>
            <Th>Location</Th>
            <Th>Terms</Th>
            <Th>Invoice required</Th>
            <Th>Status</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 9 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[140px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : vendors.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <EmptyState
                  icon={<Building2 size={18} />}
                  title={search ? 'No vendors match your search' : 'No vendors yet'}
                  description={search ? 'Try a different search term.' : 'Add your first vendor to get started.'}
                  action={!search && (
                    <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ap/vendors/new' })}>
                      New vendor
                    </Button>
                  )}
                />
              </td>
            </tr>
          ) : vendors.map((v) => (
            <TableRow key={v.id} onClick={() => handleView(v.id)}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Avatar name={v.name} size={28} />
                  <div className="min-w-0">
                    <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{v.name}</div>
                    {v.gstin && (
                      <div className="num truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{v.gstin}</div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {v.tags && v.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {v.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setTag(t); setPage(1); }}
                        className="rounded px-1.5 py-0.5 text-[10.5px] font-medium hover:underline"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-3)' }}>—</span>
                )}
              </TableCell>
              <TableCell>
                {v.category ? (
                  <Badge variant="default">{formatCategory(v.category)}</Badge>
                ) : (
                  <span style={{ color: 'var(--text-3)' }}>—</span>
                )}
              </TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>
                {v.email && <div className="text-[12.5px]">{v.email}</div>}
                {v.phone && <div className="num text-[11px]" style={{ color: 'var(--text-3)' }}>{v.phone}</div>}
                {!v.email && !v.phone && <span style={{ color: 'var(--text-3)' }}>—</span>}
              </TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>
                {v.city && v.state ? `${v.city}, ${v.state}` : (v.city || v.state || <span style={{ color: 'var(--text-3)' }}>—</span>)}
              </TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>Net {v.paymentTermsDays}d</TableCell>
              <TableCell>
                <Badge variant={v.requiresInvoice ? 'warning' : 'outline'}>
                  {v.requiresInvoice ? 'Yes' : 'No'}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={v.isActive ? 'success' : 'outline'}>{v.isActive ? 'Active' : 'Inactive'}</Badge>
              </TableCell>
              <TableCell align="right">
                <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => setDeleteId(v.id)}
                    aria-label="Delete vendor"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    className="rounded p-1 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-3)' }}
                    onClick={() => handleView(v.id)}
                    aria-label="View vendor"
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
        title="Delete Vendor"
        description="This vendor will be permanently deleted. Any linked bills or payments will remain but the vendor record cannot be recovered."
        confirmLabel="Delete Vendor"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

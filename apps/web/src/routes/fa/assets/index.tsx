import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Package, Search } from 'lucide-react';
import { useFixedAssets, useAssetCategories } from '@/hooks/queries/use-fixed-assets';
import type { FixedAsset } from '@runq/types';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Badge, Button, Card, CardContent, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, Pagination,
} from '@/components/ui';

const STATUS_VARIANT: Record<string, React.ComponentProps<typeof Badge>['variant']> = {
  active: 'success',
  disposed: 'outline',
  written_off: 'warning',
  cwip: 'default',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'cwip', label: 'CWIP' },
  { value: 'written_off', label: 'Written Off' },
  { value: 'disposed', label: 'Disposed' },
];

const LIMIT = 25;

export function AssetListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);

  const filters: Record<string, string> = {};
  if (search) filters.search = search;
  if (status) filters.status = status;
  if (categoryId) filters.categoryId = categoryId;
  filters.page = String(page);
  filters.limit = String(LIMIT);

  const { data, isLoading } = useFixedAssets(filters);
  const { data: catsData } = useAssetCategories();

  const assets: FixedAsset[] = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...(catsData?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const hasFilters = !!(search || status || categoryId);

  return (
    <div>
      <PageHeader
        title="Asset Register"
        description="All fixed assets tracked by the company."
        breadcrumbs={[{ label: 'Fixed Assets', href: '/fa' }, { label: 'Asset Register' }]}
        actions={
          <Button size="sm" onClick={() => navigate({ to: '/fa/assets/new' })}>
            <Plus size={14} /> New Asset
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[200px] flex-1">
              <input
                type="text"
                placeholder="Search by code or name…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            </div>
            <div className="min-w-[160px]">
              <Combobox label="Status" options={STATUS_OPTIONS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
            </div>
            <div className="min-w-[180px]">
              <Combobox label="Category" options={categoryOptions} value={categoryId} onChange={(v) => { setCategoryId(v); setPage(1); }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : assets.length === 0 ? (
          <EmptyState icon={Package} title={hasFilters ? 'No assets match filters' : 'No assets yet'} description="Create your first fixed asset to get started." />
        ) : (
          assets.map((asset) => (
            <div
              key={asset.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => navigate({ to: `/fa/assets/${asset.id}` })}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-500">{asset.assetCode}</span>
                <Badge variant={STATUS_VARIANT[asset.status] ?? 'default'}>{asset.status}</Badge>
              </div>
              <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">{asset.name}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                <span>{asset.acquisitionDate}</span>
                <span className="font-mono font-medium">{formatINR(asset.acquisitionCost)}</span>
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
              <Th>Asset Code</Th>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Acquisition Date</Th>
              <Th align="right">Cost</Th>
              <Th>Status</Th>
              <Th align="right">WDV</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={6} cols={7} />
            ) : assets.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState icon={Package} title={hasFilters ? 'No assets match filters' : 'No assets yet'} description="Create your first fixed asset to get started." />
              </td></tr>
            ) : (
              assets.map((asset) => (
                <TableRow key={asset.id} className="cursor-pointer" onClick={() => navigate({ to: `/fa/assets/${asset.id}` })}>
                  <TableCell className="font-mono text-xs text-zinc-500">{asset.assetCode}</TableCell>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{(asset as any).categoryName ?? '—'}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{asset.acquisitionDate}</TableCell>
                  <TableCell align="right" numeric>{formatINR(asset.acquisitionCost)}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[asset.status] ?? 'default'}>{asset.status}</Badge></TableCell>
                  <TableCell align="right" numeric>{formatINR(asset.acquisitionCost)}</TableCell>
                </TableRow>
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
    </div>
  );
}

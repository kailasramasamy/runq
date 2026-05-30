import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, FlaskConical, Search } from 'lucide-react';
import { useBoms } from '@/hooks/queries/use-boms';
import { useItems } from '@/hooks/queries/use-items';
import {
  PageHeader, Button, Input, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, EmptyState,
} from '@/components/ui';

// brand: rose
const ACCENT = '#E11D48';

const FILTER_TABS: Array<{ key: string; label: string }> = [
  { key: '',      label: 'All' },
  { key: 'true',  label: 'Active' },
  { key: 'false', label: 'Inactive' },
];

export function BomListPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('');
  const [search, setSearch] = useState('');
  const [outputItemId, setOutputItemId] = useState('');
  const [page, setPage] = useState(1);

  const { data: itemsData } = useItems({ limit: 500, type: 'product' });
  const itemOptions = [
    { value: '', label: 'All output items' },
    ...(itemsData?.data?.map((i) => ({ value: i.id, label: i.name })) ?? []),
  ];

  const filters = {
    isActive: activeTab === '' ? undefined : activeTab === 'true',
    search: search || undefined,
    outputItemId: outputItemId || undefined,
    page,
    limit: 25,
  };

  const { data, isLoading, isError } = useBoms(filters);
  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Manufacturing', href: '/manufacturing' }, { label: 'BOMs' }]}
        title="Bills of Materials"
        description="Recipes that define inputs, quantities, and scrap for each finished good."
        actions={
          <Button onClick={() => navigate({ to: '/manufacturing/boms/new' })}>
            <Plus size={13} className="mr-1" />
            New BOM
          </Button>
        }
      />

      {/* Status filter tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className="rounded-full border px-3 py-1 text-[12px] font-medium transition-colors"
            style={{
              background: activeTab === tab.key ? ACCENT : 'var(--surface)',
              borderColor: activeTab === tab.key ? ACCENT : 'var(--border)',
              color: activeTab === tab.key ? '#fff' : 'var(--text-2)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_280px]">
        <Input
          placeholder="Search by BOM code or name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          icon={<Search size={14} />}
        />
        <Combobox
          options={itemOptions}
          value={outputItemId}
          onChange={(v) => { setOutputItemId(v); setPage(1); }}
          placeholder="Filter by output item…"
        />
      </div>

      {isLoading ? (
        <p className="px-2 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
      ) : isError ? (
        <p className="px-2 py-4 text-center text-[12px] text-red-500">Failed to load BOMs.</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No BOMs yet"
          description="Create your first Bill of Materials to define a recipe."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <tr>
                <Th>BOM Code</Th>
                <Th>Name</Th>
                <Th>Output item</Th>
                <Th align="right">Version</Th>
                <Th>Active</Th>
                <Th align="right">Lines</Th>
                <Th>Updated</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.map((bom) => (
                <TableRow
                  key={bom.id}
                  onClick={() =>
                    navigate({ to: '/manufacturing/boms/$bomId', params: { bomId: bom.id } })
                  }
                >
                  <TableCell>
                    <span className="num text-[12.5px] font-medium" style={{ color: ACCENT }}>
                      {bom.bomCode}
                    </span>
                  </TableCell>
                  <TableCell>{bom.name}</TableCell>
                  <TableCell>{bom.outputItemName}</TableCell>
                  <TableCell align="right" numeric>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono dark:bg-zinc-800">
                      v{bom.version}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={
                        bom.isActive
                          ? { background: 'rgba(225, 29, 72, 0.10)', color: '#e11d48' }
                          : { background: 'var(--surface-2)', color: 'var(--text-2)' }
                      }
                    >
                      {bom.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell align="right" numeric>{bom.lineCount}</TableCell>
                  <TableCell numeric style={{ color: 'var(--text-2)' }}>
                    {new Date(bom.updatedAt).toLocaleDateString('en-IN')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Pagination */}
          {data?.meta && data.meta.total > 25 && (
            <div className="mt-3 flex items-center justify-between text-[12px]" style={{ color: 'var(--text-2)' }}>
              <span>
                Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, data.meta.total)} of {data.meta.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * 25 >= data.meta.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { PageHeader, Input } from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import { useEmployees } from '@/hooks/queries/use-hr';
import { buildTree, matchSet } from './_org-chart-data';
import { OrgChartTree } from './_org-chart-tree';
import { OrgChartList } from './_org-chart-list';

/// Reporting-tree view. Derives from the standard employee list — no new
/// endpoint. Roots are anyone with no manager (the CEO, plus any orphans
/// during data backfills). Two layouts share one search + dataset: a visual
/// top-down tree and a compact indented list, toggled by the tab strip.

type View = 'tree' | 'list';

export function OrgChartPage() {
  const { data, isLoading } = useEmployees({ limit: 200 });
  const rows = useMemo(
    () => (data?.data ?? []).filter((e) => e.status === 'active'),
    [data],
  );
  const roots = useMemo(() => buildTree(rows), [rows]);

  const [view, setView] = useState<View>('tree');
  const [q, setQ] = useState('');
  const matches = useMemo(() => matchSet(roots, q), [roots, q]);

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Org chart' }]}
        title="Org chart"
        description={
          isLoading ? 'Loading…'
          : `${rows.length} active people · ${roots.length} top-level node${roots.length === 1 ? '' : 's'}`
        }
      />

      <Tabs<View>
        active={view}
        onChange={setView}
        tabs={[{ id: 'tree', label: 'Tree' }, { id: 'list', label: 'List' }]}
      />

      <div className="mb-4 max-w-md">
        <Input
          placeholder="Filter by name, code, or designation…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</div>
      ) : roots.length === 0 ? (
        <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          No employees yet.
        </div>
      ) : matches && matches.size === 0 ? (
        <div className="text-[12px]" style={{ color: 'var(--text-3)' }}>
          No one matches “{q}”.
        </div>
      ) : view === 'tree' ? (
        <OrgChartTree roots={roots} matches={matches} />
      ) : (
        <OrgChartList roots={roots} matches={matches} />
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronRight, ChevronDown, Users as UsersIcon, User as UserIcon,
  Crown,
} from 'lucide-react';
import { PageHeader, Input } from '@/components/ui';
import { useEmployees, type Employee } from '@/hooks/queries/use-hr';

/// Reporting-tree view. Derives from the standard employee list — no new
/// endpoint. Roots are anyone with no manager (the CEO, plus any orphans
/// during data backfills). Click a node to open that person's detail.

interface TreeNode {
  emp: Employee;
  children: TreeNode[];
  /// Pre-computed reachable count (including self) so the count chip
  /// doesn't recurse on every render.
  subtreeCount: number;
}

function buildTree(rows: Employee[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const e of rows) {
    byId.set(e.id, { emp: e, children: [], subtreeCount: 1 });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.emp.reportingToId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort siblings by joining date (oldest first reads as seniority).
  const sortChildren = (n: TreeNode) => {
    n.children.sort((a, b) => a.emp.joiningDate.localeCompare(b.emp.joiningDate));
    n.children.forEach(sortChildren);
  };
  roots.sort((a, b) => a.emp.joiningDate.localeCompare(b.emp.joiningDate));
  roots.forEach(sortChildren);

  // Post-order: subtreeCount = 1 + sum of children's subtreeCount.
  const countSubtree = (n: TreeNode): number => {
    n.subtreeCount = 1 + n.children.reduce((s, c) => s + countSubtree(c), 0);
    return n.subtreeCount;
  };
  roots.forEach(countSubtree);
  return roots;
}

/// Returns the set of node ids that match the search (themselves or any
/// descendant), so we can keep the tree pruned but contextful while filtering.
function matchSet(roots: TreeNode[], q: string): Set<string> | null {
  if (!q.trim()) return null;
  const needle = q.trim().toLowerCase();
  const out = new Set<string>();
  const walk = (n: TreeNode): boolean => {
    let hit = false;
    for (const c of n.children) if (walk(c)) hit = true;
    const e = n.emp;
    const name = `${e.firstName} ${e.lastName ?? ''}`.toLowerCase();
    const code = e.employeeCode.toLowerCase();
    const desig = (e.designationName ?? '').toLowerCase();
    if (name.includes(needle) || code.includes(needle) || desig.includes(needle)) {
      hit = true;
    }
    if (hit) out.add(n.emp.id);
    return hit;
  };
  roots.forEach(walk);
  return out;
}

export function OrgChartPage() {
  const { data, isLoading } = useEmployees({ limit: 200 });
  const rows = useMemo(() => (data?.data ?? []).filter((e) => e.status === 'active'), [data]);
  const roots = useMemo(() => buildTree(rows), [rows]);

  const [q, setQ] = useState('');
  const matches = useMemo(() => matchSet(roots, q), [roots, q]);

  // When searching, auto-expand every node along a hit path. Otherwise
  // start with just the first two levels open so the page isn't a wall.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    return s;
  });
  const isExpanded = (id: string) => matches ? matches.has(id) : expanded.has(id);
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Org chart' }]}
        title="Org chart"
        description={
          isLoading ? 'Loading…'
          : `${rows.length} active people · ${roots.length} top-level node${roots.length === 1 ? '' : 's'}`
        }
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
      ) : (
        <div
          className="rounded-xl border p-3"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <ul className="flex flex-col gap-1">
            {roots
              .filter((n) => !matches || matches.has(n.emp.id))
              .map((n) => (
                <NodeRow
                  key={n.emp.id}
                  node={n}
                  depth={0}
                  expandedIds={expanded}
                  matchedIds={matches}
                  onToggle={toggle}
                />
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NodeRow({
  node, depth, expandedIds, matchedIds, onToggle,
}: {
  node: TreeNode;
  depth: number;
  expandedIds: Set<string>;
  matchedIds: Set<string> | null;
  onToggle: (id: string) => void;
}) {
  const navigate = useNavigate();
  const hasChildren = node.children.length > 0;
  // When matching, force-open nodes on a hit path so context isn't hidden.
  const open = matchedIds ? matchedIds.has(node.emp.id) : expandedIds.has(node.emp.id);
  const visibleChildren = matchedIds
    ? node.children.filter((c) => matchedIds.has(c.emp.id))
    : node.children;
  const e = node.emp;
  const fullName = e.lastName ? `${e.firstName} ${e.lastName}` : e.firstName;

  return (
    <li>
      <div
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[color:var(--surface-2)]"
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(e.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-[color:var(--surface)]"
          style={{ color: 'var(--text-3)', visibility: hasChildren ? 'visible' : 'hidden' }}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {/* Crown for root nodes — visual hint for "top of the tree". */}
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            background: depth === 0 ? 'var(--accent-soft)' : 'var(--surface-2)',
            color: depth === 0 ? 'var(--accent-text)' : 'var(--text-2)',
          }}
        >
          {depth === 0 ? <Crown size={13} /> : <UserIcon size={12} />}
        </div>

        <button
          type="button"
          onClick={() => navigate({ to: '/hr/employees/$employeeId', params: { employeeId: e.id } })}
          className="min-w-0 flex-1 text-left"
        >
          <div className="truncate text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
            {fullName}
          </div>
          <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
            {[e.designationName, e.departmentName, e.employeeCode].filter(Boolean).join(' · ')}
          </div>
        </button>

        {hasChildren && (
          <div
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
            title={`${node.subtreeCount - 1} reports (direct + indirect)`}
          >
            <UsersIcon size={10} />
            {node.subtreeCount - 1}
          </div>
        )}
      </div>

      {open && visibleChildren.length > 0 && (
        <ul className="flex flex-col gap-1">
          {visibleChildren.map((c) => (
            <NodeRow
              key={c.emp.id}
              node={c}
              depth={depth + 1}
              expandedIds={expandedIds}
              matchedIds={matchedIds}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

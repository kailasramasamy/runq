import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronRight, ChevronDown, Users as UsersIcon, User as UserIcon, Crown,
} from 'lucide-react';
import type { TreeNode } from './_org-chart-data';
import { fullName } from './_org-chart-data';

/// Indented collapsible list view of the reporting tree. Compact and
/// scannable — the companion to the visual top-down tree, and the better
/// choice for very large or deep org structures.

export function OrgChartList({ roots, matches }: {
  roots: TreeNode[];
  matches: Set<string> | null;
}) {
  // Start collapsed; the user opens what they need. During search the match
  // set drives visibility instead, so this manual state is ignored.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
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
            {fullName(e)}
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

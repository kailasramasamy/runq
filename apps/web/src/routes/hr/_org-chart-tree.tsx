import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, Crown, Plus, Minus, Maximize2 } from 'lucide-react';
import { EmployeeAvatar } from '@/components/hr/employee-avatar';
import type { TreeNode } from './_org-chart-data';
import { fullName } from './_org-chart-data';

/// Top-down org chart — the classic boxes-and-connector-lines layout every
/// HR tool ships. Connectors are pure CSS (see `.org-tree` in app.css); this
/// file owns the cards, zoom, expand/collapse, and drag-to-pan.
///
/// Opens collapsed: only the top person and their direct reports show, every
/// deeper branch expands on demand. Keeps a large org readable instead of
/// dumping every node at once. Expand-all / collapse-all flip the whole tree.

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.1;

/// Ids of every node that has children — the set "expand all" opens.
function collectExpandable(nodes: TreeNode[], out: Set<string>): Set<string> {
  for (const n of nodes) {
    if (n.children.length > 0) {
      out.add(n.emp.id);
      collectExpandable(n.children, out);
    }
  }
  return out;
}

/// Drag-to-pan on the scroll viewport. Engages only on empty canvas — any
/// button (a card or a collapse toggle) is left alone, so its click fires
/// reliably instead of being swallowed by pointer capture.
function useDragPan(ref: React.RefObject<HTMLDivElement | null>) {
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || (e.target as HTMLElement).closest('button')) return;
      drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
      el.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || !drag.current) return;
      el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
      el.scrollTop = drag.current.st - (e.clientY - drag.current.y);
    },
    onPointerUp: () => { drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
  };
}

export function OrgChartTree({ roots, matches }: {
  roots: TreeNode[];
  matches: Set<string> | null;
}) {
  const [zoom, setZoom] = useState(1);
  // Expanded node ids — a node's children render only when it's expanded.
  // Seeded with the roots so the chart opens on the top person + their
  // direct reports, every deeper branch collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(roots.map((r) => r.emp.id)),
  );
  const expandableIds = useMemo(
    () => collectExpandable(roots, new Set<string>()),
    [roots],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const pan = useDragPan(scrollRef);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const bumpZoom = (delta: number) =>
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));

  const visibleRoots = roots.filter((n) => !matches || matches.has(n.emp.id));

  return (
    <div
      className="relative rounded-xl border"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Expand / collapse cluster — top-left. */}
      <div
        className="absolute left-3 top-3 z-10 flex items-center rounded-lg border p-0.5"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <BarBtn onClick={() => setExpanded(new Set(expandableIds))}>Expand all</BarBtn>
        <span className="h-4 w-px" style={{ background: 'var(--border)' }} />
        <BarBtn onClick={() => setExpanded(new Set())}>Collapse all</BarBtn>
      </div>

      {/* Zoom cluster — top-right. */}
      <div
        className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border p-1"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <ZoomBtn label="Zoom out" onClick={() => bumpZoom(-ZOOM_STEP)}><Minus size={14} /></ZoomBtn>
        <span className="num w-9 text-center text-[11px]" style={{ color: 'var(--text-3)' }}>
          {Math.round(zoom * 100)}%
        </span>
        <ZoomBtn label="Zoom in" onClick={() => bumpZoom(ZOOM_STEP)}><Plus size={14} /></ZoomBtn>
        <ZoomBtn label="Reset zoom" onClick={() => setZoom(1)}><Maximize2 size={13} /></ZoomBtn>
      </div>

      <div
        ref={scrollRef}
        className="org-tree-viewport overflow-auto"
        style={{ maxHeight: '72vh' }}
        {...pan}
      >
        <div
          className="flex min-w-min justify-center p-10"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
          <ul className="org-tree">
            {visibleRoots.map((n) => (
              <TreeCard
                key={n.emp.id}
                node={n}
                expanded={expanded}
                matchedIds={matches}
                onToggle={toggle}
                isRoot
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function BarBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2.5 py-1 text-[11px] font-medium hover:bg-[color:var(--surface-2)]"
      style={{ color: 'var(--text-2)' }}
    >
      {children}
    </button>
  );
}

function ZoomBtn({ label, onClick, children }: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded hover:bg-[color:var(--surface-2)]"
      style={{ color: 'var(--text-2)' }}
    >
      {children}
    </button>
  );
}

function TreeCard({ node, expanded, matchedIds, onToggle, isRoot = false }: {
  node: TreeNode;
  expanded: Set<string>;
  matchedIds: Set<string> | null;
  onToggle: (id: string) => void;
  isRoot?: boolean;
}) {
  const navigate = useNavigate();
  const e = node.emp;
  const hasChildren = node.children.length > 0;
  // Search forces every node on a hit path open; otherwise the expanded set
  // decides. `childNodes` is also pruned to the hit path while searching.
  const open = matchedIds ? true : expanded.has(e.id);
  const childNodes = matchedIds
    ? node.children.filter((c) => matchedIds.has(c.emp.id))
    : node.children;
  const showChildren = open && childNodes.length > 0;

  return (
    <li>
      <div className="org-node">
        <button
          type="button"
          onClick={() => navigate({ to: '/hr/employees/$employeeId', params: { employeeId: e.id } })}
          className="org-card"
          style={{ borderColor: isRoot ? 'var(--accent)' : 'var(--border)' }}
        >
          <EmployeeAvatar employeeId={e.id} name={fullName(e)} photoKey={e.photoUrl} size={40} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              {isRoot && <Crown size={11} style={{ color: 'var(--accent-text)' }} />}
              <span className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                {fullName(e)}
              </span>
            </span>
            <span className="block truncate text-[11px]" style={{ color: 'var(--text-2)' }}>
              {e.designationName ?? e.employeeCode}
            </span>
            {e.departmentName && (
              <span className="block truncate text-[10.5px]" style={{ color: 'var(--text-3)' }}>
                {e.departmentName}
              </span>
            )}
          </span>
        </button>

        {/* Collapse toggle straddles the connector below the card. Hidden
            during search, where the match set already drives visibility. */}
        {hasChildren && !matchedIds && (
          <button
            type="button"
            onClick={() => onToggle(e.id)}
            className="org-toggle"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
            aria-label={open ? 'Collapse reports' : 'Expand reports'}
            title={`${node.children.length} direct report${node.children.length === 1 ? '' : 's'}`}
          >
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span className="num text-[10px] font-semibold">{node.children.length}</span>
          </button>
        )}
      </div>

      {showChildren && (
        <ul>
          {childNodes.map((c) => (
            <TreeCard
              key={c.emp.id}
              node={c}
              expanded={expanded}
              matchedIds={matchedIds}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

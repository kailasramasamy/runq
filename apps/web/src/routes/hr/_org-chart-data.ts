import type { Employee } from '@/hooks/queries/use-hr';

/// Shared reporting-tree logic for the HR org chart. Both the top-down tree
/// and the indented list derive from the same Employee list — no new
/// endpoint. Co-located with the route as a non-route helper module.

export interface TreeNode {
  emp: Employee;
  children: TreeNode[];
  /// Pre-computed reachable count (including self) so report-count chips
  /// don't recurse on every render.
  subtreeCount: number;
}

/// Builds the reporting forest. Roots are anyone with no resolvable manager
/// (the CEO, plus any orphans during data backfills). Siblings sort by
/// joining date — oldest first reads as seniority.
export function buildTree(rows: Employee[]): TreeNode[] {
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
/// descendant), so a view stays pruned but contextful while filtering.
/// Null means "no active search".
export function matchSet(roots: TreeNode[], q: string): Set<string> | null {
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

/// Display name — lastName is nullable in the schema.
export function fullName(e: Employee): string {
  return e.lastName ? `${e.firstName} ${e.lastName}` : e.firstName;
}

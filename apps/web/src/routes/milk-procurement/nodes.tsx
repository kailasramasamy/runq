import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import {
  useNodes, useOperators, useAssignmentsByNode,
  type NodeType, type MpNode, type MpEffectiveAssignment,
} from '@/hooks/queries/use-milk-procurement';
import { NODE_TYPE_META } from './_node-shared';

const ALL_TYPES: NodeType[] = ['vmcc', 'cc', 'pp'];

const SOURCE_NOTE: Record<MpEffectiveAssignment['source'], string> = {
  own: 'Set here',
  node: 'Inherited from VMCC',
  parent: 'Inherited from CC',
  tenant: 'Inherited from default',
};

/**
 * The chart a node actually prices with. A VMCC pours one milk type through one
 * reading axis, so it has exactly one meaningful slot — show that. A CC doesn't
 * collect; what matters there is which charts it hands down, so show only the
 * ones set on it. PPs never price milk.
 */
function RateChartCell({ node, slots }: { node: MpNode; slots: MpEffectiveAssignment[] }) {
  if (node.nodeType === 'pp') return <span className="text-zinc-400">—</span>;

  if (node.nodeType === 'cc') {
    const own = slots.filter((s) => s.source === 'own');
    if (own.length === 0) {
      return <span className="text-xs text-zinc-500">Its VMCCs use the defaults</span>;
    }
    return (
      <div className="space-y-0.5">
        {own.map((s) => (
          <div key={`${s.milkType}|${s.pricingFamily}`} className="text-xs">
            <span className="text-zinc-900 dark:text-zinc-100">{s.chartName}</span>
            <span className="ml-1 text-zinc-500">· passed to its VMCCs</span>
          </div>
        ))}
      </div>
    );
  }

  // Every chart that can price this VMCC's milk type, labelled by reading axis.
  // Deliberately not narrowed to measurementMode: that describes how the VMCC
  // tests its own farmers' pours, but a bulk VMCC has no farmers and is billed
  // off the CC's fat/SNF receipt instead — so a lone "CLR" here would name a
  // chart that never pays it.
  const mine = slots
    .filter((s) => s.milkType === node.defaultMilkType)
    .sort((a) => (a.pricingFamily === 'fat_snf' ? -1 : 1));
  if (mine.length === 0) {
    return <span className="text-xs text-amber-600 dark:text-amber-500">No chart</span>;
  }
  return (
    <div className="space-y-0.5">
      {mine.map((s) => (
        <div key={s.pricingFamily} className="text-xs">
          <span className="text-zinc-500">{s.pricingFamily === 'clr' ? 'CLR' : 'FAT/SNF'}</span>
          <span className="mx-1 text-zinc-900 dark:text-zinc-100">{s.chartName}</span>
          <span className="text-zinc-500">
            · {SOURCE_NOTE[s.source]}{!s.chartActive && ' · inactive'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MpNodesPage() {
  const navigate = useNavigate();
  const { type } = useSearch({ strict: false }) as { type?: string };
  // Tab lives in the URL (?type=vmcc) so it survives leaving to a node detail
  // and returning. Empty/unknown → the "all" tab.
  const typeFilter: '' | NodeType =
    type === 'vmcc' || type === 'cc' || type === 'pp' ? type : '';
  const setTypeFilter = (t: '' | NodeType) =>
    navigate({ to: '/milk-procurement/nodes', search: t ? { type: t } : {}, replace: true });
  const { data, isLoading } = useNodes({ limit: 300 });
  const { data: opsData } = useOperators({ limit: 200 });
  // One call for the whole table — per-row lookups would be N round-trips.
  const { data: slotsData } = useAssignmentsByNode();
  const slotsByNode = slotsData?.data ?? {};
  // Fetch every node once; the tab filters client-side so tab counts are exact.
  const allNodes = data?.data ?? [];
  const nodes = typeFilter ? allNodes.filter((n) => n.nodeType === typeFilter) : allNodes;
  const typeCount = (t: NodeType) => allNodes.filter((n) => n.nodeType === t).length;
  // Active operator count per node.
  const opCount = new Map<string, number>();
  for (const o of opsData?.data ?? []) if (o.isActive) opCount.set(o.nodeId, (opCount.get(o.nodeId) ?? 0) + 1);

  const addNode = (t: NodeType) => navigate({ to: '/milk-procurement/nodes/new/$type', params: { type: t } });

  return (
    <div>
      <PageHeader
        title="Network"
        description="VMCC, chilling centres, and processing plants."
        fullWidth
        actions={
          typeFilter ? (
            <Button onClick={() => addNode(typeFilter)}><Plus className="h-4 w-4" />Add {NODE_TYPE_META[typeFilter].label}</Button>
          ) : (
            <div className="flex gap-2">
              {ALL_TYPES.map((t) => (
                <Button key={t} variant="secondary" onClick={() => addNode(t)}><Plus className="h-4 w-4" />{NODE_TYPE_META[t].label}</Button>
              ))}
            </div>
          )
        }
      />

      <Tabs
        active={typeFilter || 'all'}
        onChange={(id) => setTypeFilter(id === 'all' ? '' : (id as NodeType))}
        tabs={[
          { id: 'all', label: 'All', count: allNodes.length },
          { id: 'vmcc', label: 'VMCC', count: typeCount('vmcc') },
          { id: 'cc', label: 'Chilling Centres', count: typeCount('cc') },
          { id: 'pp', label: 'Processing Plants', count: typeCount('pp') },
        ]}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Node</Th><Th>Type</Th><Th>Rate chart</Th><Th align="right">Operators</Th><Th>BMC</Th><Th>Payout</Th><Th>Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : nodes.length === 0 ? (
                <TableEmpty colSpan={7} message="No nodes yet — add your first VMCC." />
              ) : (
                nodes.map((n) => (
                  <TableRow
                    key={n.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: '/milk-procurement/nodes/$id', params: { id: n.id } })}
                  >
                    <TableCell>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{n.name}</div>
                      <div className="text-xs text-zinc-500">{n.code}</div>
                    </TableCell>
                    <TableCell><Badge>{n.nodeType.toUpperCase()}</Badge></TableCell>
                    <TableCell><RateChartCell node={n} slots={slotsByNode[n.id] ?? []} /></TableCell>
                    <TableCell className="text-right text-zinc-500">{opCount.get(n.id) ?? 0}</TableCell>
                    <TableCell>{n.hasBmc ? 'Yes' : '—'}</TableCell>
                    <TableCell className="text-zinc-500">{n.payoutMode ?? 'default'}</TableCell>
                    <TableCell>{n.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

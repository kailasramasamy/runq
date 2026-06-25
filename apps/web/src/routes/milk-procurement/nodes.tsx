import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Badge,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import {
  useNodes, useOperators, type NodeType,
} from '@/hooks/queries/use-milk-procurement';
import { NODE_TYPE_META } from './_node-shared';

const ALL_TYPES: NodeType[] = ['vmcc', 'cc', 'pp'];

export function MpNodesPage() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState<'' | NodeType>('');
  const { data, isLoading } = useNodes({ limit: 300 });
  const { data: opsData } = useOperators({ limit: 200 });
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
                <Th>Code</Th><Th>Name</Th><Th>Type</Th><Th align="right">Operators</Th><Th>BMC</Th><Th>Payout</Th><Th>Status</Th>
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
                    <TableCell className="font-medium">{n.code}</TableCell>
                    <TableCell>{n.name}</TableCell>
                    <TableCell><Badge>{n.nodeType.toUpperCase()}</Badge></TableCell>
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

import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Power, Plus, Copy, Trash2 } from 'lucide-react';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import {
  useNode, useDeactivateNode, useOperators, useDeactivateOperator, useDeleteOperator,
  milkTypeLabel, type MpNode, type MpOperator,
} from '@/hooks/queries/use-milk-procurement';
import { NODE_TYPE_META } from './_node-shared';

export function MpNodeDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useNode(id);
  const node = data?.data ?? null;
  const deactivate = useDeactivateNode();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  if (isLoading) return <PageHeader title="Loading…" fullWidth />;
  if (!node) return <PageHeader title="Node not found" fullWidth />;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/milk-procurement/nodes' })} className="mb-2">
        <ArrowLeft className="h-4 w-4" />Network
      </Button>
      <PageHeader
        title={node.name}
        titleBadge={<Badge>{node.code} · {NODE_TYPE_META[node.nodeType].label}</Badge>}
        fullWidth
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate({ to: '/milk-procurement/nodes/$id/edit', params: { id } })}>
              <Pencil className="h-4 w-4" />Edit
            </Button>
            {node.isActive && (
              <Button variant="ghost" onClick={() => setConfirmDeactivate(true)}><Power className="h-4 w-4" />Deactivate</Button>
            )}
          </div>
        }
      />

      <NodeSummary node={node} />
      <OperatorsSection nodeId={id} />

      <ConfirmationDialog
        open={confirmDeactivate}
        title="Deactivate node?"
        description="It will be hidden from active lists. Existing records are unaffected."
        confirmLabel="Deactivate"
        variant="danger"
        loading={deactivate.isPending}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() => deactivate.mutate({ id, nodeType: node.nodeType }, {
          onSuccess: () => { toast('Node deactivated', 'success'); setConfirmDeactivate(false); },
          onError: () => toast('Failed to deactivate', 'error'),
        })}
      />
    </div>
  );
}

function NodeSummary({ node }: { node: MpNode }) {
  const rows: [string, string][] = [
    ['Status', node.isActive ? 'Active' : 'Inactive'],
    ['BMC', node.hasBmc ? 'Yes' : '—'],
    ['Capacity', node.capacityLitres ? `${node.capacityLitres} L` : '—'],
    ['Payout', node.payoutMode ?? 'Tenant default'],
  ];
  if (node.nodeType === 'cc') rows.push(['Overnight pooling', node.overnightPooling ? 'Yes' : '—']);
  if (node.nodeType === 'vmcc') {
    rows.push(['Milk testing', node.measurementMode === 'lactometer' ? 'Lactometer (CLR)' : 'Analyzer']);
    rows.push(['Shifts', node.collectionShifts === 'both' ? 'AM + PM' : node.collectionShifts.toUpperCase()]);
    rows.push(['Milk types', node.allowedMilkTypes?.map(milkTypeLabel).join(', ') || 'All']);
  }
  return (
    <Card className="mb-4">
      <CardHeader>Configuration</CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-zinc-500">{k}</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function OperatorsSection({ nodeId }: { nodeId: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useOperators({ nodeId, limit: 100 });
  const operators = data?.data ?? [];
  const deactivate = useDeactivateOperator();
  const del = useDeleteOperator();
  const [endId, setEndId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const addOperator = () => navigate({ to: '/milk-procurement/nodes/$id/operators/new', params: { id: nodeId } });
  const newTerm = (o: MpOperator) =>
    navigate({ to: '/milk-procurement/nodes/$id/operators/new', params: { id: nodeId }, search: { from: o.id } });

  return (
    <Card>
      <CardHeader
        title="Operators"
        action={<Button size="sm" onClick={addOperator}><Plus className="h-4 w-4" />Add operator</Button>}
      />
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <Th>Person</Th><Th>Role</Th><Th>Comp</Th><Th align="right">Rate/Salary</Th><Th align="right">Rent</Th><Th>Status</Th><Th align="right">Actions</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={3} cols={7} />
            ) : operators.length === 0 ? (
              <TableEmpty colSpan={7} message="No operators yet — add the responsible person." />
            ) : (
              operators.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-zinc-600 dark:text-zinc-300">
                    {o.name || o.phone ? <span>{o.name ?? '—'}{o.phone ? ` · ${o.phone}` : ''}</span> : '—'}
                  </TableCell>
                  <TableCell>{o.role}</TableCell>
                  <TableCell className="text-xs">{o.compType.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-right">{o.ratePerLitre ?? o.monthlySalary ?? '—'}</TableCell>
                  <TableCell className="text-right">{o.rentAmount ?? '—'}</TableCell>
                  <TableCell>{o.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => newTerm(o)} title="New effective term"><Copy className="h-4 w-4" /></Button>
                    {o.isActive && (
                      <Button variant="ghost" size="sm" onClick={() => setEndId(o.id)} title="End term"><Power className="h-4 w-4" /></Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(o.id)} title="Delete operator"><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <ConfirmationDialog
        open={!!endId}
        title="End operator term?"
        description="Ends this comp term. Past commission calculations are unaffected."
        confirmLabel="End term"
        variant="danger"
        loading={deactivate.isPending}
        onClose={() => setEndId(null)}
        onConfirm={() => endId && deactivate.mutate(endId, {
          onSuccess: () => { toast('Operator term ended', 'success'); setEndId(null); },
          onError: () => toast('Failed to end term', 'error'),
        })}
      />

      <ConfirmationDialog
        open={!!deleteId}
        title="Delete operator?"
        description="Permanently removes this operator. Use this only for ones added by mistake — an operator with payout history can't be deleted (end the term instead)."
        confirmLabel="Delete"
        variant="danger"
        loading={del.isPending}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && del.mutate(deleteId, {
          onSuccess: () => { toast('Operator deleted', 'success'); setDeleteId(null); },
          onError: (e) => toast(e instanceof Error ? e.message : 'Failed to delete', 'error'),
        })}
      />
    </Card>
  );
}

import { useState } from 'react';
import { useNavigate, useParams, Link } from '@tanstack/react-router';
import { ChevronRight, Pencil, Power, Plus, Copy, Trash2 } from 'lucide-react';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import {
  useNode, useNodes, useDeactivateNode, useOperators, useDeactivateOperator, useDeleteOperator,
  type MpNode, type MpOperator, type MilkType,
} from '@/hooks/queries/use-milk-procurement';
import { NODE_TYPE_META } from './_node-shared';
import { VMCC_TABS, VmccDashboard } from './node-dashboard-vmcc';
import { CC_TABS, CcDashboard } from './node-dashboard-cc';
import { PP_TABS, PpDashboard } from './node-dashboard-pp';
import { QualityBandsEditor } from './_quality-bands-editor';
import { RateChartAssignmentsCard } from './_rate-chart-assignments-card';
import { NodeConfigForm } from './node-form';
import { SELECTABLE_MILK_TYPES } from './_node-shared';

const SETUP_TAB = { id: 'setup', label: 'Setup' };
/** A VMCC declares what it accepts; a CC doesn't, so it offers every type its
 *  VMCCs might collect. Legacy nodes with no list also fall back to all. */
function assignableMilkTypes(node: MpNode): MilkType[] {
  const allowed = node.allowedMilkTypes ?? [];
  return node.nodeType === 'vmcc' && allowed.length > 0
    ? (allowed as MilkType[])
    : SELECTABLE_MILK_TYPES;
}

function tabsForType(t: MpNode['nodeType']) {
  const base = t === 'vmcc' ? VMCC_TABS : t === 'cc' ? CC_TABS : PP_TABS;
  return [...base, SETUP_TAB];
}
function DashboardForType({ node, tab }: { node: MpNode; tab: string }) {
  if (node.nodeType === 'vmcc') return <VmccDashboard node={node} tab={tab} />;
  if (node.nodeType === 'cc') return <CcDashboard node={node} tab={tab} />;
  return <PpDashboard node={node} tab={tab} />;
}

export function MpNodeDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useNode(id);
  const { data: allNodesRes } = useNodes({ limit: 500 });
  const node = data?.data ?? null;
  const deactivate = useDeactivateNode();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [tab, setTab] = useState('overview');

  if (isLoading) return <PageHeader title="Loading…" fullWidth />;
  if (!node) return <PageHeader title="Node not found" fullWidth />;

  return (
    <div>
      <NodeBreadcrumb node={node} allNodes={allNodesRes?.data ?? []} />
      <PageHeader
        title={node.name}
        titleBadge={<Badge>{node.code} · {NODE_TYPE_META[node.nodeType].label}</Badge>}
        fullWidth
        actions={
          <div className="flex gap-2">
            {/* Config is edited inline on the Setup tab — this just takes you there. */}
            <Button variant="secondary" onClick={() => setTab('setup')}>
              <Pencil className="h-4 w-4" />Edit
            </Button>
            {node.isActive && (
              <Button variant="ghost" onClick={() => setConfirmDeactivate(true)}><Power className="h-4 w-4" />Deactivate</Button>
            )}
          </div>
        }
      />

      <Tabs active={tab} onChange={setTab} tabs={tabsForType(node.nodeType)} />
      {tab === 'setup' ? (
        <SetupPanel node={node} />
      ) : (
        <DashboardForType node={node} tab={tab} />
      )}

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

/**
 * The Setup tab, split into its own sub-tabs so the page isn't one long scroll:
 * Configuration, Operators, Rate charts (priced node types only), Quality bands.
 */
function SetupPanel({ node }: { node: MpNode }) {
  const priced = node.nodeType !== 'pp';
  const tabs = [
    { id: 'config', label: 'Configuration' },
    { id: 'operators', label: 'Operators' },
    ...(priced ? [{ id: 'charts', label: 'Rate charts' }] : []),
    { id: 'bands', label: 'Quality bands' },
  ];
  const [sub, setSub] = useState('config');

  return (
    <div>
      <Tabs active={sub} onChange={setSub} tabs={tabs} />
      {sub === 'config' && (
        <NodeConfigForm nodeType={node.nodeType} node={node} title="Configuration" onSaved={() => {}} />
      )}
      {sub === 'operators' && <OperatorsSection nodeId={node.id} />}
      {sub === 'charts' && priced && (
        // CCs set the charts their VMCCs inherit; a VMCC overrides its own.
        <RateChartAssignmentsCard
          scopeType="node"
          scopeId={node.id}
          milkTypes={assignableMilkTypes(node)}
          title="Rate charts"
          subtitle={node.nodeType === 'cc'
            ? 'Charts set here price every VMCC under this centre, unless the VMCC or farmer overrides them. Leave a slot inheriting to follow the tenant default.'
            : 'Charts set here price this VMCC, unless a farmer overrides them. Leave a slot inheriting to follow the CC, then the tenant default.'}
        />
      )}
      {sub === 'bands' && <QualityBandsEditor nodeId={node.id} title="Quality bands (node override)" />}
    </div>
  );
}

/** Clickable ancestor trail (Network ▸ PP ▸ CC ▸ this node) so you can walk up
 * the collection chain; children are reachable via the dashboard rows below. */
function NodeBreadcrumb({ node, allNodes }: { node: MpNode; allNodes: MpNode[] }) {
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const chain: MpNode[] = [];
  let cur = node.parentNodeId ? byId.get(node.parentNodeId) : undefined;
  let guard = 0;
  while (cur && guard++ < 5) {
    chain.unshift(cur);
    cur = cur.parentNodeId ? byId.get(cur.parentNodeId) : undefined;
  }
  return (
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-sm text-zinc-500">
      {/* Return to the tab this node lives in, not the default "all". */}
      <Link to="/milk-procurement/nodes" search={{ type: node.nodeType }} className="hover:underline">Network</Link>
      {chain.map((n) => (
        <span key={n.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
          <Link to="/milk-procurement/nodes/$id" params={{ id: n.id }} className="hover:underline">{n.name}</Link>
        </span>
      ))}
      <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{node.name}</span>
    </nav>
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
  const editOperator = (o: MpOperator) =>
    navigate({ to: '/milk-procurement/nodes/$id/operators/new', params: { id: nodeId }, search: { edit: o.id } });

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
                    <Button variant="ghost" size="sm" onClick={() => editOperator(o)} title="Edit — corrects this term in place (before it's billed)"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => newTerm(o)} title="New effective term — supersede with a rate change from a date"><Copy className="h-4 w-4" /></Button>
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

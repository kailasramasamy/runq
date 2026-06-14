import { useState } from 'react';
import { Plus, Power, Pencil } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Badge, Modal, Input, Combobox, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, useToast,
} from '@/components/ui';
import { TableSkeleton } from '@/components/ui';
import {
  useNodes, useCreateNode, useUpdateNode, useDeactivateNode, type NodeType, type MpNode,
} from '@/hooks/queries/use-milk-procurement';

const NODE_TYPES = [
  { value: 'vmcc', label: 'VMCC' },
  { value: 'cc', label: 'Chilling Centre' },
  { value: 'pp', label: 'Processing Plant' },
];
const PAYOUT_MODES = [
  { value: '', label: 'Tenant default' },
  { value: 'direct_to_farmer', label: 'Direct to farmer' },
  { value: 'via_vmcc', label: 'Via VMCC' },
];

export function MpNodesPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editNode, setEditNode] = useState<MpNode | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const { data, isLoading } = useNodes({ nodeType: (typeFilter || undefined) as NodeType | undefined, limit: 200 });
  const deactivate = useDeactivateNode();
  const { toast } = useToast();
  const nodes = data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Network"
        description="VMCC, chilling centres, and processing plants."
        fullWidth
        actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Add node</Button>}
      />

      <div className="mb-3 w-56">
        <Combobox value={typeFilter} onChange={setTypeFilter} placeholder="All types"
          options={[{ value: '', label: 'All types' }, ...NODE_TYPES]} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Code</Th><Th>Name</Th><Th>Type</Th><Th>BMC</Th><Th>Payout</Th><Th>Status</Th><Th align="right">Actions</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : nodes.length === 0 ? (
                <TableEmpty colSpan={7} message="No nodes yet — add your first VMCC." />
              ) : (
                nodes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.code}</TableCell>
                    <TableCell>{n.name}</TableCell>
                    <TableCell><Badge>{n.nodeType.toUpperCase()}</Badge></TableCell>
                    <TableCell>{n.hasBmc ? 'Yes' : '—'}</TableCell>
                    <TableCell className="text-zinc-500">{n.payoutMode ?? 'default'}</TableCell>
                    <TableCell>{n.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditNode(n)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {n.isActive && (
                        <Button variant="ghost" size="sm" onClick={() => setDeactivateId(n.id)} title="Deactivate">
                          <Power className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showCreate && <CreateNodeModal nodes={nodes} onClose={() => setShowCreate(false)} />}
      {editNode && <EditNodeModal node={editNode} nodes={nodes} onClose={() => setEditNode(null)} />}

      <ConfirmationDialog
        open={!!deactivateId}
        title="Deactivate node?"
        description="It will be hidden from active lists. Existing records are unaffected."
        confirmLabel="Deactivate"
        variant="danger"
        loading={deactivate.isPending}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => {
          if (!deactivateId) return;
          deactivate.mutate(deactivateId, {
            onSuccess: () => { toast('Node deactivated', 'success'); setDeactivateId(null); },
            onError: () => toast('Failed to deactivate', 'error'),
          });
        }}
      />
    </div>
  );
}

function CreateNodeModal({ nodes, onClose }: { nodes: MpNode[]; onClose: () => void }) {
  const create = useCreateNode();
  const { toast } = useToast();
  const [f, setF] = useState({
    code: '', name: '', nodeType: 'vmcc', parentNodeId: '', hasBmc: false, capacityLitres: '', payoutMode: '',
  });
  const parentOptions = [
    { value: '', label: 'None' },
    ...nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name} (${n.nodeType.toUpperCase()})` })),
  ];

  const submit = () => {
    create.mutate(
      {
        code: f.code,
        name: f.name,
        nodeType: f.nodeType as NodeType,
        parentNodeId: f.parentNodeId || null,
        hasBmc: f.hasBmc,
        capacityLitres: f.capacityLitres ? Number(f.capacityLitres) : null,
        payoutMode: (f.payoutMode || null) as 'direct_to_farmer' | 'via_vmcc' | null,
      },
      {
        onSuccess: () => { toast('Node created', 'success'); onClose(); },
        onError: () => toast('Failed to create node', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title="Add node">
      <div className="space-y-3">
        <Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
        <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <Combobox label="Type" value={f.nodeType} onChange={(v) => setF({ ...f, nodeType: v })} options={NODE_TYPES} required />
        <Combobox label="Parent node" value={f.parentNodeId} onChange={(v) => setF({ ...f, parentNodeId: v })} options={parentOptions} placeholder="None" />
        <Input label="BMC capacity (L)" type="number" value={f.capacityLitres} onChange={(e) => setF({ ...f, capacityLitres: e.target.value })} />
        <Combobox label="Payout mode" value={f.payoutMode} onChange={(v) => setF({ ...f, payoutMode: v })} options={PAYOUT_MODES} />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={f.hasBmc} onChange={(e) => setF({ ...f, hasBmc: e.target.checked })} />
          Has integrated BMC (bulk-milk cooler)
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending} disabled={!f.code || !f.name}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditNodeModal({ node, nodes, onClose }: { node: MpNode; nodes: MpNode[]; onClose: () => void }) {
  const update = useUpdateNode();
  const { toast } = useToast();
  const [f, setF] = useState({
    name: node.name,
    nodeType: node.nodeType as string,
    parentNodeId: node.parentNodeId ?? '',
    hasBmc: node.hasBmc,
    capacityLitres: node.capacityLitres ?? '',
    payoutMode: node.payoutMode ?? '',
  });
  const parentOptions = [
    { value: '', label: 'None' },
    ...nodes.filter((n) => n.id !== node.id).map((n) => ({ value: n.id, label: `${n.code} · ${n.name} (${n.nodeType.toUpperCase()})` })),
  ];

  const submit = () => {
    update.mutate(
      {
        id: node.id,
        data: {
          name: f.name,
          nodeType: f.nodeType as NodeType,
          parentNodeId: f.parentNodeId || null,
          hasBmc: f.hasBmc,
          capacityLitres: f.capacityLitres ? Number(f.capacityLitres) : null,
          payoutMode: (f.payoutMode || null) as 'direct_to_farmer' | 'via_vmcc' | null,
        },
      },
      {
        onSuccess: () => { toast('Node updated', 'success'); onClose(); },
        onError: () => toast('Failed to update node', 'error'),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${node.code}`}>
      <div className="space-y-3">
        <Input label="Code" value={node.code} disabled />
        <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <Combobox label="Type" value={f.nodeType} onChange={(v) => setF({ ...f, nodeType: v })} options={NODE_TYPES} required />
        <Combobox label="Parent node" value={f.parentNodeId} onChange={(v) => setF({ ...f, parentNodeId: v })} options={parentOptions} placeholder="None" />
        <Input label="BMC capacity (L)" type="number" value={String(f.capacityLitres)} onChange={(e) => setF({ ...f, capacityLitres: e.target.value })} />
        <Combobox label="Payout mode" value={f.payoutMode} onChange={(v) => setF({ ...f, payoutMode: v })} options={PAYOUT_MODES} />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={f.hasBmc} onChange={(e) => setF({ ...f, hasBmc: e.target.checked })} />
          Has integrated BMC (bulk-milk cooler)
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending} disabled={!f.name}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

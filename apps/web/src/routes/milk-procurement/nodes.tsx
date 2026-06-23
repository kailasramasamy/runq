import { useState, useEffect } from 'react';
import { Plus, Power, Pencil } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Badge, Modal, Input, Combobox, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, useToast,
} from '@/components/ui';
import { TableSkeleton } from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import {
  useNodes, useCreateNode, useUpdateNode, useDeactivateNode,
  useOperators, useCreateOperator,
  milkTypeLabel,
  type NodeType, type MeasurementMode, type MilkType, type MpNode, type MpOperator,
} from '@/hooks/queries/use-milk-procurement';
import type { CreateNodeOperatorInput } from '@runq/validators';

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
const COMP_TYPES = [
  { value: 'per_litre_commission', label: 'Per-litre commission' },
  { value: 'fixed_salary', label: 'Fixed salary' },
];
const MEASUREMENT_MODES = [
  { value: 'analyzer', label: 'Analyzer (fat/SNF)' },
  { value: 'lactometer', label: 'Lactometer (CLR only)' },
];

// The four types operators can actually select; 'cow' is legacy-only.
const SELECTABLE_MILK_TYPES: MilkType[] = ['cow_a1', 'cow_a2', 'buffalo', 'mixed'];

/** Checkbox group + default picker for VMCC milk-type configuration. */
function VmccMilkTypeFields({
  allowed, defaultType, onAllowedChange, onDefaultChange,
}: {
  allowed: MilkType[]; defaultType: string;
  onAllowedChange: (v: MilkType[]) => void; onDefaultChange: (v: string) => void;
}) {
  const toggle = (t: MilkType) => {
    const next = allowed.includes(t) ? allowed.filter((x) => x !== t) : [...allowed, t];
    onAllowedChange(next);
    // Reset default if it was just unchecked.
    if (!next.includes(defaultType as MilkType)) onDefaultChange('');
  };
  const defaultOptions = allowed.length > 0
    ? allowed.map((t) => ({ value: t, label: milkTypeLabel(t) }))
    : SELECTABLE_MILK_TYPES.map((t) => ({ value: t, label: milkTypeLabel(t) }));

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
      <p className="text-sm font-medium">Accepted milk types</p>
      <p className="text-xs text-zinc-500">Leave all unchecked to allow all types (legacy behaviour).</p>
      <div className="grid grid-cols-2 gap-1">
        {SELECTABLE_MILK_TYPES.map((t) => (
          <label key={t} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={allowed.includes(t)} onChange={() => toggle(t)} />
            {milkTypeLabel(t)}
          </label>
        ))}
      </div>
      <Combobox label="Default milk type" value={defaultType} onChange={onDefaultChange}
        options={[{ value: '', label: 'First accepted' }, ...defaultOptions]} placeholder="First accepted" />
    </div>
  );
}

// ── responsible-person (operator) form ───────────────────────────────────────
type PersonForm = {
  name: string; phone: string; dob: string;
  compType: string; ratePerLitre: string; monthlySalary: string; rentAmount: string;
};
const EMPTY_PERSON: PersonForm = {
  name: '', phone: '', dob: '', compType: 'per_litre_commission',
  ratePerLitre: '', monthlySalary: '', rentAmount: '',
};

/** Operator payload to upsert after the node saves — null when no person given. */
function operatorPayload(nodeId: string, p: PersonForm): CreateNodeOperatorInput | null {
  if (!p.name && !p.phone) return null;
  // The operator schema requires the matching comp amount for the comp type;
  // default to 0 so a person can be saved before a rate/salary is decided.
  return {
    nodeId, name: p.name || null, role: 'operator',
    loginPhone: p.phone || null, loginDob: p.dob || null,
    compType: p.compType as 'per_litre_commission' | 'fixed_salary',
    ratePerLitre: p.compType === 'per_litre_commission' ? Number(p.ratePerLitre || 0) : null,
    monthlySalary: p.compType === 'fixed_salary' ? Number(p.monthlySalary || 0) : null,
    rentAmount: p.rentAmount ? Number(p.rentAmount) : null,
    effectiveFrom: new Date().toISOString().slice(0, 10),
  };
}

function PersonFields({ p, setP }: { p: PersonForm; setP: (p: PersonForm) => void }) {
  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
      <p className="text-sm font-medium">Responsible person (Dhenu app operator)</p>
      <p className="text-xs text-zinc-500">Mobile + DOB are the Dhenu app login.</p>
      <Input label="Name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Mobile" type="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} />
        <Input label="Date of birth" type="date" value={p.dob} onChange={(e) => setP({ ...p, dob: e.target.value })} />
      </div>
      <Combobox label="Compensation" value={p.compType} onChange={(v) => setP({ ...p, compType: v })} options={COMP_TYPES} />
      {p.compType === 'per_litre_commission' ? (
        <Input label="Rate per litre (₹)" type="number" value={p.ratePerLitre}
          onChange={(e) => setP({ ...p, ratePerLitre: e.target.value })} />
      ) : (
        <Input label="Salary per cycle (₹)" type="number" value={p.monthlySalary}
          onChange={(e) => setP({ ...p, monthlySalary: e.target.value })} />
      )}
      <Input label="Rent (₹, optional)" type="number" value={p.rentAmount}
        onChange={(e) => setP({ ...p, rentAmount: e.target.value })} />
    </div>
  );
}

export function MpNodesPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editNode, setEditNode] = useState<MpNode | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const { data, isLoading } = useNodes({ limit: 300 });
  const { data: opsData } = useOperators({ limit: 200 });
  const deactivate = useDeactivateNode();
  const { toast } = useToast();
  // Fetch every node once; the tab filters client-side so tab counts are exact
  // and the parent-node picker in the modals still sees all tiers.
  const allNodes = data?.data ?? [];
  const nodes = typeFilter ? allNodes.filter((n) => n.nodeType === typeFilter) : allNodes;
  const typeCount = (t: string) => allNodes.filter((n) => n.nodeType === t).length;
  // Active operator per node — the responsible person shown in the table.
  const opByNode = new Map<string, MpOperator>();
  for (const o of opsData?.data ?? []) if (o.isActive) opByNode.set(o.nodeId, o);

  return (
    <div>
      <PageHeader
        title="Network"
        description="VMCC, chilling centres, and processing plants."
        fullWidth
        actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Add node</Button>}
      />

      <Tabs
        active={typeFilter || 'all'}
        onChange={(id) => setTypeFilter(id === 'all' ? '' : id)}
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
                <Th>Code</Th><Th>Name</Th><Th>Type</Th><Th>Responsible</Th><Th>BMC</Th><Th>Payout</Th><Th>Status</Th><Th align="right">Actions</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={8} />
              ) : nodes.length === 0 ? (
                <TableEmpty colSpan={8} message="No nodes yet — add your first VMCC." />
              ) : (
                nodes.map((n) => {
                  const op = opByNode.get(n.id);
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="font-medium">{n.code}</TableCell>
                      <TableCell>{n.name}</TableCell>
                      <TableCell><Badge>{n.nodeType.toUpperCase()}</Badge></TableCell>
                      <TableCell className="text-zinc-500">
                        {op?.name || op?.phone ? (
                          <span>{op.name ?? '—'}{op.phone ? ` · ${op.phone}` : ''}</span>
                        ) : '—'}
                      </TableCell>
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
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showCreate && <CreateNodeModal nodes={allNodes} onClose={() => setShowCreate(false)} />}
      {editNode && <EditNodeModal node={editNode} nodes={allNodes} operator={opByNode.get(editNode.id) ?? null} onClose={() => setEditNode(null)} />}

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
  const createOp = useCreateOperator();
  const { toast } = useToast();
  const [f, setF] = useState({
    code: '', name: '', nodeType: 'vmcc', parentNodeId: '', hasBmc: false,
    overnightPooling: false,
    measurementMode: 'analyzer', capacityLitres: '', payoutMode: '',
  });
  const [allowedMilkTypes, setAllowedMilkTypes] = useState<MilkType[]>([]);
  const [defaultMilkType, setDefaultMilkType] = useState('');
  const [p, setP] = useState<PersonForm>(EMPTY_PERSON);
  const parentOptions = [
    { value: '', label: 'None' },
    ...nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name} (${n.nodeType.toUpperCase()})` })),
  ];

  const submit = () => {
    const isVmcc = f.nodeType === 'vmcc';
    create.mutate(
      {
        code: f.code, name: f.name, nodeType: f.nodeType as NodeType,
        parentNodeId: f.parentNodeId || null, hasBmc: f.hasBmc,
        overnightPooling: f.nodeType === 'cc' ? f.overnightPooling : false,
        measurementMode: (isVmcc ? f.measurementMode : 'analyzer') as MeasurementMode,
        capacityLitres: f.capacityLitres ? Number(f.capacityLitres) : null,
        payoutMode: (f.payoutMode || null) as 'direct_to_farmer' | 'via_vmcc' | null,
        allowedMilkTypes: isVmcc && allowedMilkTypes.length > 0 ? allowedMilkTypes : null,
        defaultMilkType: isVmcc && defaultMilkType ? defaultMilkType as MilkType : null,
      },
      {
        onSuccess: (res) => finishNodeSave(res.data.id, p, createOp, toast, onClose, 'Node created'),
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
        {f.nodeType === 'cc' && (
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={f.overnightPooling} onChange={(e) => setF({ ...f, overnightPooling: e.target.checked })} />
            Overnight pooling (dispatch = previous-day PM + today AM)
          </label>
        )}
        {f.nodeType === 'vmcc' && (
          <>
            <Combobox label="Milk testing" value={f.measurementMode} onChange={(v) => setF({ ...f, measurementMode: v })} options={MEASUREMENT_MODES} />
            <VmccMilkTypeFields
              allowed={allowedMilkTypes} defaultType={defaultMilkType}
              onAllowedChange={setAllowedMilkTypes} onDefaultChange={setDefaultMilkType}
            />
          </>
        )}
        <PersonFields p={p} setP={setP} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending || createOp.isPending} disabled={!f.code || !f.name}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditNodeModal({ node, nodes, operator, onClose }:
  { node: MpNode; nodes: MpNode[]; operator: MpOperator | null; onClose: () => void }) {
  const update = useUpdateNode();
  const createOp = useCreateOperator();
  const { toast } = useToast();
  const [f, setF] = useState({
    name: node.name, nodeType: node.nodeType as string, parentNodeId: node.parentNodeId ?? '',
    hasBmc: node.hasBmc, overnightPooling: node.overnightPooling,
    measurementMode: node.measurementMode ?? 'analyzer',
    capacityLitres: node.capacityLitres ?? '', payoutMode: node.payoutMode ?? '',
  });
  // Initialise from node's existing milk-type config (null = all).
  const [allowedMilkTypes, setAllowedMilkTypes] = useState<MilkType[]>(
    (node.allowedMilkTypes ?? []).filter((t) => SELECTABLE_MILK_TYPES.includes(t)),
  );
  const [defaultMilkType, setDefaultMilkType] = useState(node.defaultMilkType ?? '');
  const [p, setP] = useState<PersonForm>(EMPTY_PERSON);
  // Prefill the responsible person from the node's active operator, including
  // the login DOB so it round-trips on edit.
  useEffect(() => {
    if (!operator) return;
    setP({
      name: operator.name ?? '', phone: operator.phone ?? '', dob: operator.dob ?? '',
      compType: operator.compType,
      ratePerLitre: operator.ratePerLitre ?? '', monthlySalary: operator.monthlySalary ?? '',
      rentAmount: operator.rentAmount ?? '',
    });
  }, [operator]);
  const parentOptions = [
    { value: '', label: 'None' },
    ...nodes.filter((n) => n.id !== node.id).map((n) => ({ value: n.id, label: `${n.code} · ${n.name} (${n.nodeType.toUpperCase()})` })),
  ];

  const submit = () => {
    const isVmcc = f.nodeType === 'vmcc';
    update.mutate(
      {
        id: node.id,
        data: {
          name: f.name, nodeType: f.nodeType as NodeType, parentNodeId: f.parentNodeId || null,
          hasBmc: f.hasBmc,
          overnightPooling: f.nodeType === 'cc' ? f.overnightPooling : false,
          measurementMode: isVmcc ? (f.measurementMode as MeasurementMode) : undefined,
          capacityLitres: f.capacityLitres ? Number(f.capacityLitres) : null,
          payoutMode: (f.payoutMode || null) as 'direct_to_farmer' | 'via_vmcc' | null,
          allowedMilkTypes: isVmcc && allowedMilkTypes.length > 0 ? allowedMilkTypes : null,
          defaultMilkType: isVmcc && defaultMilkType ? defaultMilkType as MilkType : null,
        },
      },
      {
        onSuccess: () => finishNodeSave(node.id, p, createOp, toast, onClose, 'Node updated'),
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
        {f.nodeType === 'cc' && (
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={f.overnightPooling} onChange={(e) => setF({ ...f, overnightPooling: e.target.checked })} />
            Overnight pooling (dispatch = previous-day PM + today AM)
          </label>
        )}
        {f.nodeType === 'vmcc' && (
          <>
            <Combobox label="Milk testing" value={f.measurementMode} onChange={(v) => setF({ ...f, measurementMode: v as MeasurementMode })} options={MEASUREMENT_MODES} />
            <VmccMilkTypeFields
              allowed={allowedMilkTypes} defaultType={defaultMilkType}
              onAllowedChange={setAllowedMilkTypes} onDefaultChange={setDefaultMilkType}
            />
          </>
        )}
        <PersonFields p={p} setP={setP} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending || createOp.isPending} disabled={!f.name}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

/** After a node saves, upsert its responsible-person operator (if any), then close. */
function finishNodeSave(
  nodeId: string, p: PersonForm, createOp: ReturnType<typeof useCreateOperator>,
  toast: (m: string, k: 'success' | 'error') => void, onClose: () => void, okMsg: string,
) {
  const op = operatorPayload(nodeId, p);
  if (!op) { toast(okMsg, 'success'); onClose(); return; }
  createOp.mutate(op, {
    onSuccess: () => { toast(okMsg, 'success'); onClose(); },
    onError: () => toast('Node saved, but failed to save responsible person', 'error'),
  });
}

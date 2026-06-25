import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Input, Combobox, useToast,
} from '@/components/ui';
import {
  useNode, useCreateNode, useUpdateNode, useNodes,
  type NodeType, type MeasurementMode, type MilkType, type MpNode,
  type CreateNodeBody, type UpdateNodeBody,
} from '@/hooks/queries/use-milk-procurement';
import {
  NODE_TYPE_META, PAYOUT_MODES, MEASUREMENT_MODES, COLLECTION_SHIFTS, SELECTABLE_MILK_TYPES,
  VmccMilkTypeFields,
} from './_node-shared';

const NODE_TYPES: NodeType[] = ['vmcc', 'cc', 'pp'];

/** Create (/nodes/new/$type) and edit (/nodes/$id/edit) share this page. */
export function MpNodeFormPage() {
  const params = useParams({ strict: false }) as { id?: string; type?: string };
  const editId = params.id;
  const { data: nodeData, isLoading } = useNode(editId ?? '');
  const node = nodeData?.data ?? null;
  const nodeType = (editId ? node?.nodeType : params.type) as NodeType | undefined;

  if (editId && isLoading) return <PageHeader title="Loading…" fullWidth />;
  if (!nodeType || !NODE_TYPES.includes(nodeType)) {
    return <PageHeader title="Unknown node type" description="Pick a node type from the Network page." fullWidth />;
  }
  return <NodeForm key={node?.id ?? nodeType} nodeType={nodeType} node={node} />;
}

function NodeForm({ nodeType, node }: { nodeType: NodeType; node: MpNode | null }) {
  const isEdit = !!node;
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateNode(nodeType);
  const update = useUpdateNode(nodeType);
  const { data: nodesData } = useNodes({ limit: 300 });
  const allNodes = nodesData?.data ?? [];

  const [f, setF] = useState({
    code: node?.code ?? '', name: node?.name ?? '',
    parentNodeId: node?.parentNodeId ?? '',
    capacityLitres: node?.capacityLitres ?? '', payoutMode: node?.payoutMode ?? '',
    hasBmc: node?.hasBmc ?? false, overnightPooling: node?.overnightPooling ?? false,
    measurementMode: node?.measurementMode ?? 'analyzer',
    collectionShifts: node?.collectionShifts ?? 'both',
  });
  const [allowedMilkTypes, setAllowedMilkTypes] = useState<MilkType[]>(
    (node?.allowedMilkTypes ?? []).filter((t) => SELECTABLE_MILK_TYPES.includes(t)),
  );
  const [defaultMilkType, setDefaultMilkType] = useState(node?.defaultMilkType ?? '');

  const parentOptions = [
    { value: '', label: 'None' },
    ...allNodes.filter((n) => n.id !== node?.id)
      .map((n) => ({ value: n.id, label: `${n.code} · ${n.name} (${n.nodeType.toUpperCase()})` })),
  ];
  const back = () => navigate({ to: '/milk-procurement/nodes' });

  const submit = () => {
    const body = buildBody(nodeType, f, allowedMilkTypes, defaultMilkType);
    if (isEdit) {
      const { code: _c, ...patch } = body;
      update.mutate({ id: node.id, data: patch as UpdateNodeBody }, {
        onSuccess: () => { toast('Node updated', 'success'); navigate({ to: '/milk-procurement/nodes/$id', params: { id: node.id } }); },
        onError: () => toast('Failed to update node', 'error'),
      });
    } else {
      create.mutate(body as CreateNodeBody, {
        onSuccess: (res) => { toast('Node created', 'success'); navigate({ to: '/milk-procurement/nodes/$id', params: { id: res.data.id } }); },
        onError: () => toast('Failed to create node', 'error'),
      });
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={back} className="mb-2"><ArrowLeft className="h-4 w-4" />Network</Button>
      <PageHeader title={isEdit ? `Edit ${node.code}` : `Add ${NODE_TYPE_META[nodeType].label}`} fullWidth />
      <Card>
        <CardContent className="max-w-xl space-y-3">
          <Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} disabled={isEdit} required />
          <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <Combobox label="Parent node" value={f.parentNodeId} onChange={(v) => setF({ ...f, parentNodeId: v })} options={parentOptions} placeholder="None" />
          <Input label="Capacity (L)" type="number" value={String(f.capacityLitres)} onChange={(e) => setF({ ...f, capacityLitres: e.target.value })} />
          <Combobox label="Payout mode" value={f.payoutMode} onChange={(v) => setF({ ...f, payoutMode: v })} options={PAYOUT_MODES} />

          {nodeType !== 'pp' && (
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={f.hasBmc} onChange={(e) => setF({ ...f, hasBmc: e.target.checked })} />
              Has integrated BMC (bulk-milk cooler)
            </label>
          )}
          {nodeType === 'cc' && (
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={f.overnightPooling} onChange={(e) => setF({ ...f, overnightPooling: e.target.checked })} />
              Overnight pooling (dispatch = previous-day PM + today AM)
            </label>
          )}
          {nodeType === 'vmcc' && (
            <>
              <Combobox label="Milk testing" value={f.measurementMode} onChange={(v) => setF({ ...f, measurementMode: v as MeasurementMode })} options={MEASUREMENT_MODES} />
              <Combobox label="Collects shifts" value={f.collectionShifts} onChange={(v) => setF({ ...f, collectionShifts: v as 'both' | 'am' | 'pm' })} options={COLLECTION_SHIFTS} />
              <VmccMilkTypeFields allowed={allowedMilkTypes} defaultType={defaultMilkType}
                onAllowedChange={setAllowedMilkTypes} onDefaultChange={setDefaultMilkType} />
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={back}>Cancel</Button>
            <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!f.code || !f.name}>
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type FormState = {
  code: string; name: string; parentNodeId: string; capacityLitres: string | number;
  payoutMode: string; hasBmc: boolean; overnightPooling: boolean;
  measurementMode: string; collectionShifts: string;
};

/** Assemble the type-specific request body (only the fields that type accepts). */
function buildBody(nodeType: NodeType, f: FormState, allowedMilkTypes: MilkType[], defaultMilkType: string) {
  const base = {
    code: f.code, name: f.name,
    parentNodeId: f.parentNodeId || null,
    capacityLitres: f.capacityLitres ? Number(f.capacityLitres) : null,
    payoutMode: (f.payoutMode || null) as 'direct_to_farmer' | 'via_vmcc' | null,
  };
  if (nodeType === 'vmcc') {
    return {
      ...base, hasBmc: f.hasBmc,
      measurementMode: f.measurementMode as MeasurementMode,
      collectionShifts: f.collectionShifts as 'both' | 'am' | 'pm',
      allowedMilkTypes: allowedMilkTypes.length > 0 ? allowedMilkTypes : null,
      defaultMilkType: defaultMilkType ? (defaultMilkType as MilkType) : null,
    };
  }
  if (nodeType === 'cc') return { ...base, hasBmc: f.hasBmc, overnightPooling: f.overnightPooling };
  return base;
}

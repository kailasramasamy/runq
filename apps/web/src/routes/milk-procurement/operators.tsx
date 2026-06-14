import { useState } from 'react';
import { Plus, Copy, Power } from 'lucide-react';
import {
  PageHeader, Card, CardContent, CardHeader, Button, Badge, Modal, Input, Combobox, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, StatsCard, useToast,
} from '@/components/ui';
import {
  useNodes, useOperators, useCreateOperator, useDeactivateOperator, useOperatorCommission,
  type MpOperator,
} from '@/hooks/queries/use-milk-procurement';

type OperatorForm = {
  nodeId: string; role: string; compType: string; ratePerLitre: string;
  monthlySalary: string; rentAmount: string; effectiveFrom: string;
};

const COMP_TYPES = [
  { value: 'per_litre_commission', label: 'Per-litre commission' },
  { value: 'fixed_salary', label: 'Fixed salary' },
];
const ROLES = [{ value: 'operator', label: 'Operator' }, { value: 'owner', label: 'Owner' }];

export function MpOperatorsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [dupInitial, setDupInitial] = useState<OperatorForm | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const { data, isLoading } = useOperators({ limit: 200 });
  const { data: nodesData } = useNodes({ limit: 300 });
  const deactivate = useDeactivateOperator();
  const { toast } = useToast();
  const nodes = nodesData?.data ?? [];
  const operators = data?.data ?? [];
  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? id.slice(0, 8);
  const today = new Date().toISOString().slice(0, 10);
  const duplicate = (o: MpOperator) => setDupInitial({
    nodeId: o.nodeId, role: o.role, compType: o.compType,
    ratePerLitre: o.ratePerLitre ?? '', monthlySalary: o.monthlySalary ?? '',
    rentAmount: o.rentAmount ?? '', effectiveFrom: today,
  });

  return (
    <div>
      <PageHeader
        title="Operators"
        description="Comp terms for node staff. Commission is computed from pour volume; payouts run through AP/HR."
        fullWidth
        actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Add operator</Button>}
      />

      <CommissionCard nodes={nodes} />

      <Card className="mt-4">
        <CardHeader>Operators</CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><Th>Node</Th><Th>Role</Th><Th>Comp</Th><Th align="right">Rate/Salary</Th><Th align="right">Rent</Th><Th>Status</Th><Th align="right">Actions</Th></TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={7} />
              ) : operators.length === 0 ? (
                <TableEmpty colSpan={7} message="No operators yet." />
              ) : (
                operators.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{nodeName(o.nodeId)}</TableCell>
                    <TableCell>{o.role}</TableCell>
                    <TableCell className="text-xs">{o.compType.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-right">{o.ratePerLitre ?? o.monthlySalary ?? '—'}</TableCell>
                    <TableCell className="text-right">{o.rentAmount ?? '—'}</TableCell>
                    <TableCell>{o.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => duplicate(o)} title="Duplicate (new effective term)"><Copy className="h-4 w-4" /></Button>
                      {o.isActive && (
                        <Button variant="ghost" size="sm" onClick={() => setDeactivateId(o.id)} title="Deactivate"><Power className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showCreate && <CreateOperatorModal nodes={nodes} onClose={() => setShowCreate(false)} />}
      {dupInitial && <CreateOperatorModal nodes={nodes} initial={dupInitial} onClose={() => setDupInitial(null)} />}

      <ConfirmationDialog
        open={!!deactivateId}
        title="Deactivate operator term?"
        description="Ends this comp term. Past commission calculations are unaffected."
        confirmLabel="Deactivate"
        variant="danger"
        loading={deactivate.isPending}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => {
          if (!deactivateId) return;
          deactivate.mutate(deactivateId, {
            onSuccess: () => { toast('Operator deactivated', 'success'); setDeactivateId(null); },
            onError: () => toast('Failed to deactivate', 'error'),
          });
        }}
      />
    </div>
  );
}

function CommissionCard({ nodes }: { nodes: { id: string; code: string; name: string }[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState({ nodeId: '', from: today, to: today });
  const { data } = useOperatorCommission(q);
  const comp = data?.data;

  return (
    <Card>
      <CardHeader>Commission calculator</CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1"><Combobox label="Node" value={q.nodeId} onChange={(v) => setQ({ ...q, nodeId: v })}
            options={nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))} placeholder="Select node…" /></div>
          <div className="w-40"><Input label="From" type="date" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} /></div>
          <div className="w-40"><Input label="To" type="date" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} /></div>
        </div>
        {comp && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatsCard title="Node volume (L)" value={comp.nodeQty} formatValue={(v) => `${v.toFixed(1)} L`} />
            {comp.operators.map((o) => (
              <StatsCard key={o.id} title={`${o.role} payable`} value={o.total} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateOperatorModal({ nodes, initial, onClose }: { nodes: { id: string; code: string; name: string }[]; initial?: OperatorForm; onClose: () => void }) {
  const create = useCreateOperator();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<OperatorForm>(initial ?? { nodeId: '', role: 'operator', compType: 'per_litre_commission', ratePerLitre: '', monthlySalary: '', rentAmount: '', effectiveFrom: today });

  const submit = () => {
    create.mutate(
      {
        nodeId: f.nodeId, role: f.role as 'operator' | 'owner', compType: f.compType as 'per_litre_commission' | 'fixed_salary',
        ratePerLitre: f.compType === 'per_litre_commission' && f.ratePerLitre ? Number(f.ratePerLitre) : null,
        monthlySalary: f.compType === 'fixed_salary' && f.monthlySalary ? Number(f.monthlySalary) : null,
        rentAmount: f.rentAmount ? Number(f.rentAmount) : null,
        effectiveFrom: f.effectiveFrom,
      },
      { onSuccess: () => { toast('Operator added', 'success'); onClose(); }, onError: () => toast('Failed to add operator', 'error') },
    );
  };

  return (
    <Modal open onClose={onClose} title={initial ? 'Duplicate operator (new term)' : 'Add operator'}>
      <div className="space-y-3">
        <Combobox label="Node" value={f.nodeId} onChange={(v) => setF({ ...f, nodeId: v })}
          options={nodes.map((n) => ({ value: n.id, label: `${n.code} · ${n.name}` }))} placeholder="Select node…" required />
        <div className="grid grid-cols-2 gap-2">
          <Combobox label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES} />
          <Combobox label="Comp type" value={f.compType} onChange={(v) => setF({ ...f, compType: v })} options={COMP_TYPES} />
        </div>
        {f.compType === 'per_litre_commission' ? (
          <Input label="Rate per litre (₹)" type="number" value={f.ratePerLitre} onChange={(e) => setF({ ...f, ratePerLitre: e.target.value })} />
        ) : (
          <Input label="Monthly salary (₹)" type="number" value={f.monthlySalary} onChange={(e) => setF({ ...f, monthlySalary: e.target.value })} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input label="Rent (₹, optional)" type="number" value={f.rentAmount} onChange={(e) => setF({ ...f, rentAmount: e.target.value })} />
          <Input label="Effective from" type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending} disabled={!f.nodeId}>Add</Button>
        </div>
      </div>
    </Modal>
  );
}

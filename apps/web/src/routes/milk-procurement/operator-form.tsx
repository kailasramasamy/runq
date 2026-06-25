import { useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Input, Combobox, useToast,
} from '@/components/ui';
import {
  useNode, useOperators, useCreateOperator, type MpOperator,
} from '@/hooks/queries/use-milk-procurement';
import { COMP_TYPES, ROLES } from './_node-shared';

type OperatorForm = {
  name: string; role: string; compType: string; ratePerLitre: string;
  monthlySalary: string; rentAmount: string; effectiveFrom: string;
  loginPhone: string; loginDob: string;
};

/** Dedicated "add operator" page for a node (/nodes/$id/operators/new). */
export function MpOperatorFormPage() {
  const { id: nodeId } = useParams({ strict: false }) as { id: string };
  const { from } = useSearch({ strict: false }) as { from?: string };
  const { data: nodeData } = useNode(nodeId);
  const { data: opsData } = useOperators({ nodeId, limit: 100 });
  const source = from ? opsData?.data.find((o) => o.id === from) : undefined;
  const nodeName = nodeData?.data?.name ?? '';
  // key on the source so the prefilled form mounts once the operator loads.
  return <OperatorForm key={source?.id ?? 'blank'} nodeId={nodeId} nodeName={nodeName} source={source} />;
}

function OperatorForm({ nodeId, nodeName, source }: { nodeId: string; nodeName: string; source?: MpOperator }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateOperator();
  const today = new Date().toISOString().slice(0, 10);
  const back = () => navigate({ to: '/milk-procurement/nodes/$id', params: { id: nodeId } });

  const [f, setF] = useState<OperatorForm>({
    name: source?.name ?? '', role: source?.role ?? 'operator',
    compType: source?.compType ?? 'per_litre_commission',
    ratePerLitre: source?.ratePerLitre ?? '', monthlySalary: source?.monthlySalary ?? '',
    rentAmount: source?.rentAmount ?? '', effectiveFrom: today,
    loginPhone: source?.phone ?? '', loginDob: source?.dob ?? '',
  });

  const submit = () => {
    create.mutate(
      {
        nodeId, name: f.name || null, role: f.role as 'operator' | 'owner',
        compType: f.compType as 'per_litre_commission' | 'fixed_salary',
        ratePerLitre: f.compType === 'per_litre_commission' && f.ratePerLitre ? Number(f.ratePerLitre) : null,
        monthlySalary: f.compType === 'fixed_salary' && f.monthlySalary ? Number(f.monthlySalary) : null,
        rentAmount: f.rentAmount ? Number(f.rentAmount) : null,
        effectiveFrom: f.effectiveFrom,
        loginPhone: f.loginPhone || null, loginDob: f.loginDob || null,
      },
      {
        onSuccess: () => { toast(source ? 'New term added' : 'Operator added', 'success'); back(); },
        onError: () => toast('Failed to add operator', 'error'),
      },
    );
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={back} className="mb-2"><ArrowLeft className="h-4 w-4" />{nodeName || 'Node'}</Button>
      <PageHeader title={source ? 'New operator term' : 'Add operator'} description={nodeName} fullWidth />
      <Card>
        <CardContent className="max-w-xl space-y-3">
          <Input label="Person name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
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
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="mb-2 text-xs font-medium text-zinc-500">App login (optional) — lets this operator sign in to Dhenu</p>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Phone" value={f.loginPhone} onChange={(e) => setF({ ...f, loginPhone: e.target.value })} />
              <Input label="Date of birth" type="date" value={f.loginDob} onChange={(e) => setF({ ...f, loginDob: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={back}>Cancel</Button>
            <Button onClick={submit} loading={create.isPending}>Add</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

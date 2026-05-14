import { useState } from 'react';
import { Plus, Trash2, Coins, Sparkles } from 'lucide-react';
import {
  PageHeader, Button, Input, Select,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, Badge, useToast, ConfirmationDialog, Modal,
} from '@/components/ui';
import { EmptyState } from '@/components/ar/primitives';
import {
  useSalaryComponents, useCreateSalaryComponent, useDeleteSalaryComponent, useSeedDefaultComponents,
  type ComponentType, type CalcType,
} from '@/hooks/queries/use-hr-payroll';
import { useIsReadOnly } from '@/providers/auth-provider';

const TYPE_OPTS: Array<{ value: ComponentType; label: string }> = [
  { value: 'earning', label: 'Earning' },
  { value: 'deduction', label: 'Deduction' },
  { value: 'reimbursement', label: 'Reimbursement' },
  { value: 'statutory', label: 'Statutory' },
];
const CALC_OPTS: Array<{ value: CalcType; label: string }> = [
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'percent_of_basic', label: '% of Basic' },
  { value: 'percent_of_ctc', label: '% of CTC' },
];
const TYPE_VARIANT: Record<ComponentType, any> = {
  earning: 'success', deduction: 'warning', reimbursement: 'info', statutory: 'default',
};

export function SalaryComponentsPage() {
  const readOnly = useIsReadOnly();
  const { toast } = useToast();
  const { data, isLoading } = useSalaryComponents();
  const create = useCreateSalaryComponent();
  const remove = useDeleteSalaryComponent();
  const seedDefaults = useSeedDefaultComponents();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<ComponentType>('earning');
  const [calcType, setCalcType] = useState<CalcType>('fixed');
  const [defaultValue, setDefaultValue] = useState('');
  const [isPf, setIsPf] = useState(false);
  const [isEsi, setIsEsi] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const components = data?.data ?? [];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      name: name.trim(), code: code.trim().toUpperCase(), type, calcType,
      defaultValue: Number(defaultValue || 0), isPfApplicable: isPf, isEsiApplicable: isEsi,
    }, {
      onSuccess: () => {
        setName(''); setCode(''); setDefaultValue(''); setIsPf(false); setIsEsi(false);
        setShowAdd(false);
        toast('Component created', 'success');
      },
      onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Salary components' }]}
        title="Salary components"
        description="Reusable building blocks for salary structures (Basic, HRA, DA, PF, ESI, TDS…)."
        actions={!readOnly && (
          <div className="flex items-center gap-2">
            {components.length === 0 && (
              <Button variant="outline" size="sm" onClick={() => seedDefaults.mutate(undefined, {
                onSuccess: (r) => toast(r.data.skipped ? 'Already seeded' : `Seeded ${r.data.count} components`, 'success'),
                onError: (e: any) => toast(e?.message ?? 'Failed', 'error'),
              })} disabled={seedDefaults.isPending}>
                <Sparkles size={13} /> Seed defaults
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={13} /> New component</Button>
          </div>
        )}
      />

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="Add salary component" size="lg">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              <Input label="Code *" maxLength={20} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
              <Select label="Type" options={TYPE_OPTS} value={type} onChange={(e) => setType(e.target.value as ComponentType)} />
              <Select label="Calculation" options={CALC_OPTS} value={calcType} onChange={(e) => setCalcType(e.target.value as CalcType)} />
              <Input label="Default value" type="number" step="0.01" min="0" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[13px]" style={{ color: 'var(--text-2)' }}>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={isPf} onChange={(e) => setIsPf(e.target.checked)} /> PF applicable</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={isEsi} onChange={(e) => setIsEsi(e.target.checked)} /> ESI applicable</label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Adding…' : 'Add'}</Button>
            </div>
          </form>
        </Modal>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Calc</Th>
            <Th align="right">Default</Th>
            <Th>Flags</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</td></tr>
          ) : components.length === 0 ? (
            <tr><td colSpan={7}><EmptyState icon={<Coins size={18} />} title="No components" description="Seed defaults or add manually." /></td></tr>
          ) : components.map((c) => (
            <TableRow key={c.id}>
              <TableCell><span className="num font-medium" style={{ color: 'var(--text-1)' }}>{c.code}</span></TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{c.name}</TableCell>
              <TableCell><Badge variant={TYPE_VARIANT[c.type]}>{c.type}</Badge></TableCell>
              <TableCell style={{ color: 'var(--text-2)' }}>{c.calcType.replace(/_/g, ' ')}</TableCell>
              <TableCell align="right" className="num" style={{ color: 'var(--text-2)' }}>{Number(c.defaultValue)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {c.isPfApplicable && <Badge variant="info">PF</Badge>}
                  {c.isEsiApplicable && <Badge variant="info">ESI</Badge>}
                  {c.isTaxable && <Badge variant="outline">Taxable</Badge>}
                </div>
              </TableCell>
              <TableCell align="right">
                {!readOnly && (
                  <button className="rounded p-1 hover:bg-[var(--surface-2)]" style={{ color: 'var(--text-3)' }} onClick={() => setDeleteId(c.id)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmationDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, {
            onSuccess: () => { setDeleteId(null); toast('Deleted', 'success'); },
            onError: (e: any) => { setDeleteId(null); toast(e?.message ?? 'Failed', 'error'); },
          });
        }}
        title="Delete component?"
        description="Cannot delete if used by any structure."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}

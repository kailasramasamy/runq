import { useState } from 'react';
import { Plus, Trash2, X, Power } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Th,
  TableSkeleton,
  useToast,
  ConfirmationDialog,
} from '@/components/ui';
import {
  useApprovalWorkflows,
  useCreateApprovalWorkflow,
  useToggleWorkflow,
  useDeleteWorkflow,
} from '@/hooks/queries/use-workflows';

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'Select type...' },
  { value: 'purchase_invoice', label: 'Bill' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment', label: 'Payment' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'journal_entry', label: 'Journal Entry' },
  { value: 'purchase_requisition', label: 'Purchase Requisition' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'Select role...' },
  { value: 'owner', label: 'Owner' },
  { value: 'accountant', label: 'Accountant' },
];

interface RuleRow {
  stepOrder: number;
  approverRole: string;
  minAmount: string;
  maxAmount: string;
}

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateApprovalWorkflow();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState('');
  const [rules, setRules] = useState<RuleRow[]>([
    { stepOrder: 1, approverRole: '', minAmount: '', maxAmount: '' },
  ]);

  function addRule() {
    setRules((prev) => [
      ...prev,
      { stepOrder: prev.length + 1, approverRole: '', minAmount: '', maxAmount: '' },
    ]);
  }

  function removeRule(idx: number) {
    setRules((prev) => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, stepOrder: i + 1 })));
  }

  function updateRule(idx: number, field: keyof RuleRow, value: string) {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        name,
        entityType,
        rules: rules.map((r) => ({
          stepOrder: r.stepOrder,
          approverRole: r.approverRole,
          minAmount: r.minAmount ? Number(r.minAmount) : null,
          maxAmount: r.maxAmount ? Number(r.maxAmount) : null,
        })),
      });
      toast('Workflow created', 'success');
      onClose();
    } catch {
      toast('Failed to create workflow', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Approval Workflow</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="High-value bill approval" />
          <Select label="Entity Type" value={entityType} onChange={(e) => setEntityType(e.target.value)} options={ENTITY_TYPE_OPTIONS} required />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Rules</label>
            <Button type="button" variant="ghost" size="sm" onClick={addRule}><Plus size={14} /> Add Step</Button>
          </div>
          <div className="space-y-2">
            {rules.map((rule, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400">
                  {rule.stepOrder}
                </span>
                <Select label="Role" value={rule.approverRole} onChange={(e) => updateRule(idx, 'approverRole', e.target.value)} options={ROLE_OPTIONS} required />
                <Input label="Min Amount" type="number" value={rule.minAmount} onChange={(e) => updateRule(idx, 'minAmount', e.target.value)} placeholder="0" />
                <Input label="Max Amount" type="number" value={rule.maxAmount} onChange={(e) => updateRule(idx, 'maxAmount', e.target.value)} placeholder="No limit" />
                {rules.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(idx)} className="text-red-500">
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Create Workflow</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Workflows Page ──────────────────────────────────────────────────────────

export function WorkflowsPage() {
  const { data, isLoading } = useApprovalWorkflows();
  const toggle = useToggleWorkflow();
  const del = useDeleteWorkflow();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const workflows = data?.data ?? [];

  async function handleToggle(id: string) {
    try {
      await toggle.mutateAsync(id);
      toast('Workflow updated', 'success');
    } catch {
      toast('Failed to update workflow', 'error');
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await del.mutateAsync(deleteId);
      toast('Workflow deleted', 'success');
      setDeleteId(null);
    } catch {
      toast('Failed to delete workflow', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Approval Workflows"
        breadcrumbs={[{ label: 'Workflows' }, { label: 'Approval Rules' }]}
        description="Configure multi-step approval workflows for transactions."
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} />
            New Workflow
          </Button>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Name</Th>
                <Th>Entity Type</Th>
                <Th>Rules</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={5} />
              ) : workflows.length === 0 ? (
                <TableEmpty colSpan={5} message="No workflows configured yet." />
              ) : (
                workflows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell>
                      <Badge variant="info">{w.entityType}</Badge>
                    </TableCell>
                    <TableCell>{w.rules?.length ?? 0} step(s)</TableCell>
                    <TableCell>
                      <Badge variant={w.isActive ? 'success' : 'default'}>
                        {w.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={toggle.isPending}
                          onClick={() => handleToggle(w.id)}
                          title={w.isActive ? 'Deactivate' : 'Activate'}
                        >
                          <Power size={14} className={w.isActive ? 'text-green-600' : 'text-zinc-400'} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteId(w.id)}
                          title="Delete"
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Workflow"
        description="This will permanently delete the workflow and all its rules. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={del.isPending}
      />
    </div>
  );
}

import { useState } from 'react';
import { Plus, Trash2, X, Download, Send, CheckCircle, Banknote } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, Textarea, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useExpenseClaims, useCreateExpenseClaim, useSubmitClaim, useApproveClaim, useReimburseClaim,
  type ExpenseClaim, type ClaimStatus, type ExpenseCategory,
} from '@/hooks/queries/use-expense-claims';

type BadgeVariant = 'default' | 'info' | 'success' | 'danger' | 'outline' | 'primary' | 'warning' | 'cyan';

const STATUS_BADGE: Record<ClaimStatus, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  submitted: { variant: 'info', label: 'Submitted' },
  approved: { variant: 'success', label: 'Approved' },
  rejected: { variant: 'danger', label: 'Rejected' },
  reimbursed: { variant: 'cyan', label: 'Reimbursed' },
};

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'Travel', label: 'Travel' },
  { value: 'Meals', label: 'Meals' },
  { value: 'Accommodation', label: 'Accommodation' },
  { value: 'Supplies', label: 'Supplies' },
  { value: 'Communication', label: 'Communication' },
  { value: 'Transport', label: 'Transport' },
  { value: 'Other', label: 'Other' },
];

interface LineItemRow { expenseDate: string; category: ExpenseCategory; description: string; amount: string }

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateExpenseClaim();
  const { toast } = useToast();

  const [claimDate, setClaimDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<LineItemRow[]>([
    { expenseDate: new Date().toISOString().slice(0, 10), category: 'Other', description: '', amount: '' },
  ]);

  function addItem() {
    setItems((p) => [...p, { expenseDate: new Date().toISOString().slice(0, 10), category: 'Other', description: '', amount: '' }]);
  }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, f: keyof LineItemRow, v: string) {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [f]: v } : it)));
  }

  const total = items.reduce((s, it) => s + Number(it.amount || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        claimDate,
        description,
        lineItems: items.map((it) => ({
          expenseDate: it.expenseDate,
          category: it.category,
          description: it.description,
          amount: Number(it.amount),
        })),
      });
      toast('Expense claim created', 'success');
      onClose();
    } catch {
      toast('Failed to create expense claim', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Expense Claim</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DateInput label="Claim Date" value={claimDate} onChange={setClaimDate} required />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Trip to client site, etc." />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Expenses</label>
            <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus size={14} /> Add Expense</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <DateInput label="Date" value={item.expenseDate} onChange={(v) => updateItem(idx, 'expenseDate', v)} required />
                <Select label="Category" value={item.category} onChange={(e) => updateItem(idx, 'category', e.target.value)}>
                  {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
                <Input label="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required placeholder="What was the expense?" />
                <Input label="Amount" type="number" value={item.amount} onChange={(e) => updateItem(idx, 'amount', e.target.value)} required placeholder="0.00" />
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={14} /></Button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Total: {formatINR(total)}</p>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Create Claim</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function DetailView({ claim, onClose }: { claim: ExpenseClaim; onClose: () => void }) {
  const submit = useSubmitClaim();
  const approve = useApproveClaim();
  const reimburse = useReimburseClaim();
  const { toast } = useToast();
  const statusInfo = STATUS_BADGE[claim.status];

  async function handleAction(action: 'submit' | 'approve' | 'reimburse') {
    const fn = action === 'submit' ? submit : action === 'approve' ? approve : reimburse;
    const label = action === 'submit' ? 'Submitted' : action === 'approve' ? 'Approved' : 'Reimbursed';
    try { await fn.mutateAsync(claim.id); toast(`Claim ${label.toLowerCase()}`, 'success'); onClose(); }
    catch { toast(`Failed to ${action} claim`, 'error'); }
  }

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {claim.claimNumber} <Badge variant={statusInfo.variant} className="ml-2">{statusInfo.label}</Badge>
        </h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"><X size={14} /></button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-zinc-500">Claim Date</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{claim.claimDate}</p></div>
        <div><p className="text-xs text-zinc-500">Description</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{claim.description}</p></div>
        <div><p className="text-xs text-zinc-500">Total</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{formatINR(claim.totalAmount)}</p></div>
      </div>
      <Table>
        <TableHeader><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th align="right">Amount</Th></tr></TableHeader>
        <TableBody>
          {(claim.lineItems ?? []).map((li, i) => (
            <TableRow key={i}><TableCell>{li.expenseDate}</TableCell><TableCell><Badge variant="outline">{li.category}</Badge></TableCell><TableCell>{li.description}</TableCell><TableCell align="right" numeric>{formatINR(li.amount)}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-3 flex gap-2">
        {claim.status === 'draft' && (
          <Button size="sm" onClick={() => handleAction('submit')} loading={submit.isPending}><Send size={14} /> Submit</Button>
        )}
        {claim.status === 'submitted' && (
          <Button size="sm" onClick={() => handleAction('approve')} loading={approve.isPending}><CheckCircle size={14} /> Approve</Button>
        )}
        {claim.status === 'approved' && (
          <Button size="sm" onClick={() => handleAction('reimburse')} loading={reimburse.isPending}><Banknote size={14} /> Reimburse</Button>
        )}
      </div>
    </div>
  );
}

// ─── Expense Claims Page ─────────────────────────────────────────────────────

export function ExpenseClaimsPage() {
  const { data, isLoading } = useExpenseClaims();
  const { toast } = useToast();
  const submitClaim = useSubmitClaim();
  const approveClaim = useApproveClaim();
  const reimburseClaim = useReimburseClaim();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const claims = data?.data ?? [];
  const selected = selectedId ? claims.find((c) => c.id === selectedId) : null;

  async function quickAction(id: string, action: 'submit' | 'approve' | 'reimburse') {
    const fn = action === 'submit' ? submitClaim : action === 'approve' ? approveClaim : reimburseClaim;
    try { await fn.mutateAsync(id); toast(`Claim ${action}ed`, 'success'); }
    catch { toast(`Failed to ${action}`, 'error'); }
  }

  return (
    <div>
      <PageHeader
        title="Expense Claims"
        breadcrumbs={[{ label: 'HR' }, { label: 'Expense Claims' }]}
        description="Submit, approve, and reimburse employee expense claims."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('expense-claims.csv', ['Claim#', 'Date', 'Description', 'Amount', 'Status'], claims.map(c => [c.claimNumber, c.claimDate, c.description, String(c.totalAmount), c.status]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate((v) => !v)}><Plus size={14} /> New Claim</Button>
          </div>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}
      {selected && <DetailView claim={selected} onClose={() => setSelectedId(null)} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr><Th>Claim#</Th><Th>Date</Th><Th>Description</Th><Th align="right">Amount</Th><Th>Status</Th><Th align="right">Actions</Th></tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : claims.length === 0 ? (
                <TableEmpty colSpan={6} message="No expense claims yet." />
              ) : (
                claims.map((c) => {
                  const si = STATUS_BADGE[c.status];
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelectedId(c.id)}>
                      <TableCell className="font-mono text-xs">{c.claimNumber}</TableCell>
                      <TableCell className="text-zinc-500">{c.claimDate}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium">{c.description}</TableCell>
                      <TableCell align="right" numeric>{formatINR(c.totalAmount)}</TableCell>
                      <TableCell><Badge variant={si.variant}>{si.label}</Badge></TableCell>
                      <TableCell align="right">
                        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          {c.status === 'draft' && (
                            <Button variant="outline" size="sm" onClick={() => quickAction(c.id, 'submit')}><Send size={14} /> Submit</Button>
                          )}
                          {c.status === 'submitted' && (
                            <Button variant="outline" size="sm" onClick={() => quickAction(c.id, 'approve')}><CheckCircle size={14} /> Approve</Button>
                          )}
                          {c.status === 'approved' && (
                            <Button variant="outline" size="sm" onClick={() => quickAction(c.id, 'reimburse')}><Banknote size={14} /> Reimburse</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

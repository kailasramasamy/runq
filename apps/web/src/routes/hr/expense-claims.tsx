import React, { useState } from 'react';
import { Plus, Trash2, X, Download, Send, CheckCircle, Banknote } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, Textarea, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useExpenseClaims, useExpenseClaim, useCreateExpenseClaim, useSubmitClaim, useApproveClaim, useReimburseClaim, useDeleteExpenseClaim,
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
        items: items.map((it) => ({
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
    <div className="mb-4 max-w-3xl rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Expense Claim</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DateInput label="Claim Date" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} required />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Trip to client site, etc." />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Expenses</label>
            <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus size={14} /> Add Expense</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-[8rem_1fr_1fr_7rem]">
                  <DateInput label="Date" value={item.expenseDate} onChange={(e) => updateItem(idx, 'expenseDate', e.target.value)} required />
                  <Select label="Category" value={item.category} onChange={(e) => updateItem(idx, 'category', e.target.value)} options={CATEGORY_OPTIONS} />
                  <Input label="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required placeholder="What was the expense?" />
                  <Input label="Amount" type="number" value={item.amount} onChange={(e) => updateItem(idx, 'amount', e.target.value)} required placeholder="0.00" />
                </div>
                {items.length > 1 && (
                  <div className="mt-1 flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={14} /></Button>
                  </div>
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

// ─── Detail View (table row) ────────────────────────────────────────────────

function InlineDetail({ claimId }: { claimId: string }) {
  const { data, isLoading } = useExpenseClaim(claimId);
  const items = data?.data?.items ?? data?.data?.lineItems ?? [];

  return (
    <tr>
      <td colSpan={6} className="bg-zinc-50 px-6 py-3 dark:bg-zinc-800/50">
        {isLoading ? (
          <div className="flex gap-3 py-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-8 flex-1 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="py-2 text-sm text-zinc-400">No expense items recorded</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((li, i) => (
              <div key={i} className="flex items-center gap-4 rounded border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                <span className="text-zinc-500 w-24 shrink-0">{li.expenseDate}</span>
                <Badge variant="outline">{li.category}</Badge>
                <span className="flex-1 text-zinc-900 dark:text-zinc-100">{li.description}</span>
                <span className="font-mono font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatINR(li.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Detail View (mobile card) ──────────────────────────────────────────────

function MobileDetail({ claimId }: { claimId: string }) {
  const { data, isLoading } = useExpenseClaim(claimId);
  const items = data?.data?.items ?? data?.data?.lineItems ?? [];

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="py-2 text-sm text-zinc-400">No expense items recorded</p>
      ) : (
        <div className="space-y-2">
          {items.map((li, i) => (
            <div key={i} className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{li.description}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                    <span>{li.expenseDate}</span>
                    <Badge variant="outline">{li.category}</Badge>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">{formatINR(li.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
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
  const deleteClaim = useDeleteExpenseClaim();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const claims = data?.data ?? [];
  const selected = selectedId ? claims.find((c) => c.id === selectedId) : null;

  async function quickAction(id: string, action: 'submit' | 'approve' | 'reimburse') {
    const fn = action === 'submit' ? submitClaim : action === 'approve' ? approveClaim : reimburseClaim;
    try { await fn.mutateAsync(id); toast(`Claim ${action}ed`, 'success'); }
    catch { toast(`Failed to ${action}`, 'error'); }
  }

  async function handleDelete(id: string, claimNumber: string) {
    // Money-moved gate lives on the server (refuses 'reimbursed'); confirm
    // here so the user can't blow a claim away by mis-clicking the trash.
    if (!window.confirm(`Delete claim ${claimNumber}? This removes the claim and its line items permanently.`)) return;
    try { await deleteClaim.mutateAsync(id); toast('Claim deleted', 'success'); }
    catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete';
      toast(msg, 'error');
    }
  }

  return (
    <div>
      <PageHeader fullWidth
        title="Expense Claims"
        breadcrumbs={[{ label: 'Expenses' }, { label: 'Claims' }]}
        description="Submit, approve, and reimburse employee expense claims."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('expense-claims.csv', ['Claim#', 'Date', 'Description', 'Amount', 'Status'], claims.map(c => [c.claimNumber, c.claimDate, c.description, String(c.totalAmount), c.status]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate((v) => !v)}><Plus size={14} /> New Claim</Button>
          </div>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      {/* Mobile card view */}
      <div className="flex flex-col gap-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))
        ) : claims.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No expense claims yet.</p>
        ) : (
          claims.map((c) => {
            const si = STATUS_BADGE[c.status];
            const isExpanded = selectedId === c.id;
            return (
              <div key={c.id}>
                <div
                  className={`cursor-pointer rounded-lg border bg-white p-3 active:bg-zinc-50 dark:bg-zinc-900 dark:active:bg-zinc-800 ${isExpanded ? 'border-indigo-300 dark:border-indigo-700' : 'border-zinc-200 dark:border-zinc-700'}`}
                  onClick={() => setSelectedId(isExpanded ? null : c.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{c.description}</p>
                      <p className="font-mono text-xs text-zinc-500">{c.claimNumber}</p>
                    </div>
                    <Badge variant={si.variant}>{si.label}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{c.claimDate}</span>
                    <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{formatINR(c.totalAmount)}</span>
                  </div>
                  {c.status !== 'reimbursed' && (
                    <div className="mt-2 flex flex-wrap justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {c.status === 'draft' && (
                        <Button variant="outline" size="sm" onClick={() => quickAction(c.id, 'submit')}><Send size={14} /> Submit</Button>
                      )}
                      {c.status === 'submitted' && (
                        <Button variant="outline" size="sm" onClick={() => quickAction(c.id, 'approve')}><CheckCircle size={14} /> Approve</Button>
                      )}
                      {c.status === 'approved' && (
                        <Button variant="outline" size="sm" onClick={() => quickAction(c.id, 'reimburse')}><Banknote size={14} /> Reimburse</Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        onClick={() => handleDelete(c.id, c.claimNumber)}
                        loading={deleteClaim.isPending}
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    </div>
                  )}
                </div>
                {isExpanded && <MobileDetail claimId={c.id} />}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block">
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
                    const isExpanded = selectedId === c.id;
                    return (
                      <React.Fragment key={c.id}>
                        <TableRow className={`cursor-pointer ${isExpanded ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}`} onClick={() => setSelectedId(isExpanded ? null : c.id)}>
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
                              {c.status !== 'reimbursed' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                  onClick={() => handleDelete(c.id, c.claimNumber)}
                                  loading={deleteClaim.isPending}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && <InlineDetail claimId={c.id} />}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

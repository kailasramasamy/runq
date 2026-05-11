import { useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import { useAssetCategories, useCreateAssetCategory } from '@/hooks/queries/use-fixed-assets';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import type { AssetCategory } from '@runq/types';
import {
  PageHeader, Button, Card, CardHeader, CardContent, Input, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, useToast,
} from '@/components/ui';

// ─── Inline new category form ─────────────────────────────────────────────────

function NewCategoryForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const createMutation = useCreateAssetCategory();
  const { data: accountsData } = useGLAccounts();

  const allAccounts = accountsData?.data ?? [];
  const assetAccounts = allAccounts
    .filter((a) => a.type === 'asset' && a.isActive)
    .map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` }));
  const expenseAccounts = allAccounts
    .filter((a) => a.type === 'expense' && a.isActive)
    .map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` }));

  const methodOptions = [
    { value: 'slm', label: 'SLM — Straight Line' },
    { value: 'wdv', label: 'WDV — Written Down Value' },
  ];

  const [name, setName] = useState('');
  const [depMethodCompaniesAct, setDepMethodCompaniesAct] = useState('slm');
  const [depRateCompaniesAct, setDepRateCompaniesAct] = useState('');
  const [usefulLifeYears, setUsefulLifeYears] = useState('');
  const [depMethodItAct, setDepMethodItAct] = useState('wdv');
  const [depRateItAct, setDepRateItAct] = useState('');
  const [assetAccountCode, setAssetAccountCode] = useState('');
  const [depExpenseAccountCode, setDepExpenseAccountCode] = useState('');
  const [accumDepAccountCode, setAccumDepAccountCode] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !depRateCompaniesAct || !depRateItAct || !assetAccountCode || !depExpenseAccountCode || !accumDepAccountCode) {
      setError('Name, both depreciation rates, and all three GL accounts are required.');
      return;
    }
    createMutation.mutate(
      {
        name: name.trim(),
        depMethodCompaniesAct: depMethodCompaniesAct as 'slm' | 'wdv',
        depRateCompaniesAct: parseFloat(depRateCompaniesAct),
        usefulLifeYears: usefulLifeYears ? parseInt(usefulLifeYears, 10) : undefined,
        depMethodItAct: depMethodItAct as 'slm' | 'wdv',
        depRateItAct: parseFloat(depRateItAct),
        assetAccountCode,
        depExpenseAccountCode,
        accumDepAccountCode,
      },
      {
        onSuccess: () => { toast('Category created', 'success'); onClose(); },
        onError: (err: any) => setError(err?.message ?? 'Failed to create category'),
      },
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader title="New Asset Category" />
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plant & Machinery" />
          <div className="grid grid-cols-2 gap-3">
            <Combobox label="Companies Act Method" options={methodOptions} value={depMethodCompaniesAct} onChange={setDepMethodCompaniesAct} />
            <Input label="Rate %" type="number" min="0" step="0.01" value={depRateCompaniesAct} onChange={(e) => setDepRateCompaniesAct(e.target.value)} placeholder="e.g. 10" />
          </div>
          <Input label="Useful Life (years)" type="number" min="1" value={usefulLifeYears} onChange={(e) => setUsefulLifeYears(e.target.value)} placeholder="e.g. 15" />
          <div className="grid grid-cols-2 gap-3">
            <Combobox label="IT Act Method" options={methodOptions} value={depMethodItAct} onChange={setDepMethodItAct} />
            <Input label="Rate %" type="number" min="0" step="0.01" value={depRateItAct} onChange={(e) => setDepRateItAct(e.target.value)} placeholder="e.g. 15" />
          </div>
          <Combobox label="Asset GL Account" required options={assetAccounts} value={assetAccountCode} onChange={setAssetAccountCode} placeholder="Select asset account…" />
          <Combobox label="Depreciation Expense Account" required options={expenseAccounts} value={depExpenseAccountCode} onChange={setDepExpenseAccountCode} placeholder="Select expense account…" />
          <Combobox label="Accumulated Dep. Account" required options={assetAccounts} value={accumDepAccountCode} onChange={setAccumDepAccountCode} placeholder="Select contra account…" />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="sm" loading={createMutation.isPending}>Save Category</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AssetCategoriesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = useAssetCategories();
  const categories: AssetCategory[] = data?.data ?? [];

  return (
    <div>
      <PageHeader fullWidth
        title="Asset Categories"
        description="Define depreciation rules for each asset type."
        breadcrumbs={[{ label: 'Fixed Assets', href: '/fa' }, { label: 'Categories' }]}
        actions={
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} /> New Category
          </Button>
        }
      />

      {showForm && (
        <div className="max-w-xl">
          <NewCategoryForm onClose={() => setShowForm(false)} />
        </div>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Name</Th>
            <Th>Companies Act</Th>
            <Th>IT Act</Th>
            <Th>Useful Life</Th>
            <Th>GL Accounts</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : categories.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <EmptyState icon={Tag} title="No categories yet" description="Create a category to define depreciation rules." />
              </td>
            </tr>
          ) : (
            categories.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.name}</TableCell>
                <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                  {cat.depMethodCompaniesAct?.toUpperCase()} {cat.depRateCompaniesAct != null ? `@ ${cat.depRateCompaniesAct}%` : ''}
                </TableCell>
                <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                  {cat.depMethodItAct?.toUpperCase()} {cat.depRateItAct != null ? `@ ${cat.depRateItAct}%` : ''}
                </TableCell>
                <TableCell>{cat.usefulLifeYears != null ? `${cat.usefulLifeYears} yrs` : '—'}</TableCell>
                <TableCell className="text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5">
                  <div>Asset: {cat.assetAccountCode}</div>
                  <div>Dep. Exp: {cat.depExpenseAccountCode}</div>
                  <div>Accum: {cat.accumDepAccountCode}</div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

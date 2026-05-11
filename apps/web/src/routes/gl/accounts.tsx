import { useState, useMemo } from 'react';
import { BookOpen, Plus, Pencil, X, Download, Search } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import { useGLAccounts, useCreateAccount, useUpdateAccount } from '@/hooks/queries/use-gl';
import type { Account, AccountType } from '@runq/types';
import {
  PageHeader, Badge, TableSkeleton, EmptyState, Button, Input, Select, Textarea,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, useToast,
} from '@/components/ui';

const TYPE_VARIANT: Record<AccountType, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  asset: 'info',
  liability: 'warning',
  equity: 'success',
  revenue: 'default',
  expense: 'danger',
};

const TYPE_OPTIONS = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

function indentLevel(code: string): number {
  if (code.length <= 1) return 0;
  const lastTwo = code.slice(-2);
  if (lastTwo === '00') return code.length === 4 ? 0 : 1;
  return 2;
}

function AccountRow({ account, onEdit }: { account: Account; onEdit: (a: Account) => void }) {
  const indent = indentLevel(account.code);
  return (
    <TableRow className={!account.isActive ? 'opacity-50' : ''}>
      <TableCell className="font-mono text-sm">{account.code}</TableCell>
      <TableCell>
        <span style={{ paddingLeft: `${indent * 20}px` }} className="block">
          {account.name}
          {!account.isActive && <span className="ml-2 text-xs text-zinc-400">(inactive)</span>}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={TYPE_VARIANT[account.type]}>{account.type}</Badge>
      </TableCell>
      <TableCell className="text-zinc-400 text-xs max-w-xs truncate">{account.description ?? ''}</TableCell>
      <TableCell>
        {!account.isSystemAccount && (
          <button
            onClick={() => onEdit(account)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <Pencil size={14} />
          </button>
        )}
      </TableCell>
    </TableRow>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

function Modal({ open, onClose, children, title }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createMutation = useCreateAccount();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [description, setDescription] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      { code, name, type: type as AccountType, description: description || undefined },
      {
        onSuccess: () => {
          toast('Account created', 'success');
          setCode(''); setName(''); setType('expense'); setDescription('');
          onClose();
        },
        onError: () => toast('Failed to create account', 'error'),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="New Account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Code" required placeholder="e.g. 5010" value={code} onChange={(e) => setCode(e.target.value)} />
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} options={TYPE_OPTIONS} />
        </div>
        <Input label="Name" required placeholder="e.g. Marketing Expense" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea label="Description" placeholder="Optional description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>Cancel</Button>
          <Button size="sm" type="submit" loading={createMutation.isPending}>Create Account</Button>
        </div>
      </form>
    </Modal>
  );
}

function EditAccountModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const updateMutation = useUpdateAccount();
  const { toast } = useToast();
  const [name, setName] = useState(account?.name ?? '');
  const [description, setDescription] = useState(account?.description ?? '');
  const [isActive, setIsActive] = useState(account?.isActive ?? true);

  if (!account) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      { id: account!.id, data: { name, description: description || null, isActive } },
      {
        onSuccess: () => { toast('Account updated', 'success'); onClose(); },
        onError: () => toast('Failed to update account', 'error'),
      },
    );
  }

  return (
    <Modal open={!!account} onClose={onClose} title={`Edit ${account.code}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea label="Description" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-300 peer-checked:bg-blue-600 rounded-full peer-focus:ring-2 peer-focus:ring-blue-300 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Active</span>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>Cancel</Button>
          <Button size="sm" type="submit" loading={updateMutation.isPending}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ChartOfAccountsPage() {
  const { data, isLoading } = useGLAccounts();
  const accountList = data?.data ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const TYPE_CHIPS: { type: AccountType; label: string; range: string }[] = [
    { type: 'asset', label: 'Assets', range: '1000–1999' },
    { type: 'liability', label: 'Liabilities', range: '2000–2999' },
    { type: 'equity', label: 'Equity', range: '3000–3999' },
    { type: 'revenue', label: 'Revenue', range: '4000–4999' },
    { type: 'expense', label: 'Expenses', range: '5000–5999' },
  ];

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of accountList) {
      counts[a.type] = (counts[a.type] ?? 0) + 1;
    }
    return counts;
  }, [accountList]);

  const filtered = useMemo(() => {
    let list = accountList;
    if (typeFilter) {
      list = list.filter((a) => a.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q),
      );
    }
    return list;
  }, [accountList, search, typeFilter]);

  return (
    <div>
      <PageHeader fullWidth
        breadcrumbs={[{ label: 'General Ledger', href: '/gl' }, { label: 'Chart of Accounts' }]}
        title="Chart of Accounts"
        description="Indian COA based on Schedule III of Companies Act."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('chart-of-accounts.csv', ['Code', 'Name', 'Type', 'Status'], accountList.map(a => [a.code, a.name, a.type, a.isActive ? 'Active' : 'Inactive']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Account
            </Button>
          </div>
        }
      />

      {/* Type chips */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => setTypeFilter(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            typeFilter === null
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/20 dark:text-indigo-300'
              : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600'
          }`}
        >
          All <span className="ml-1 text-zinc-400">{accountList.length}</span>
        </button>
        {TYPE_CHIPS.map((chip) => (
          <button
            key={chip.type}
            onClick={() => setTypeFilter(typeFilter === chip.type ? null : chip.type)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              typeFilter === chip.type
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/20 dark:text-indigo-300'
                : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600'
            }`}
          >
            {chip.label} <span className="ml-1 font-mono text-zinc-400">{chip.range}</span>
            <span className="ml-1 text-zinc-400">({typeCounts[chip.type] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 max-w-sm">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, name, or type…"
            className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>
      </div>

      {isLoading ? (
        <>
          <div className="space-y-2 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
            ))}
          </div>
          <div className="hidden md:block">
            <table className="w-full"><tbody><TableSkeleton rows={10} /></tbody></table>
          </div>
        </>
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title={search ? 'No matching accounts' : 'No accounts found'} description={search ? 'Try a different search term.' : 'Seed the chart of accounts to get started.'} />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((account) => (
              <div
                key={account.id}
                className={`cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800 ${!account.isActive ? 'opacity-50' : ''}`}
                onClick={() => !account.isSystemAccount && setEditAccount(account)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-zinc-400">{account.code}</p>
                    <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">{account.name}</p>
                    {account.description && (
                      <p className="text-xs text-zinc-400 truncate mt-0.5">{account.description}</p>
                    )}
                  </div>
                  <Badge variant={TYPE_VARIANT[account.type]}>{account.type}</Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <Th>Code</Th>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((account) => (
                  <AccountRow key={account.id} account={account} onEdit={setEditAccount} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <CreateAccountModal open={showCreate} onClose={() => setShowCreate(false)} />
      <EditAccountModal account={editAccount} onClose={() => setEditAccount(null)} />
    </div>
  );
}

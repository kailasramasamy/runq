import { useState } from 'react';
import { BookOpen, Plus, Pencil, X } from 'lucide-react';
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
        <div className="grid grid-cols-2 gap-4">
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

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'General Ledger', href: '/gl' }, { label: 'Chart of Accounts' }]}
        title="Chart of Accounts"
        description="Indian COA based on Schedule III of Companies Act."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Account
          </Button>
        }
      />

      {isLoading ? (
        <table className="w-full"><tbody><TableSkeleton rows={10} /></tbody></table>
      ) : accountList.length === 0 ? (
        <EmptyState icon={BookOpen} title="No accounts found" description="Seed the chart of accounts to get started." />
      ) : (
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
            {accountList.map((account) => (
              <AccountRow key={account.id} account={account} onEdit={setEditAccount} />
            ))}
          </TableBody>
        </Table>
      )}

      <CreateAccountModal open={showCreate} onClose={() => setShowCreate(false)} />
      <EditAccountModal account={editAccount} onClose={() => setEditAccount(null)} />
    </div>
  );
}

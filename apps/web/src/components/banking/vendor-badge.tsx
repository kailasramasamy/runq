import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Store, User, Plus } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useVendors } from '@/hooks/queries/use-vendors';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import { api } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import type { Vendor } from '@runq/types';

interface PartyBadgeProps {
  transactionId: string;
  type: 'credit' | 'debit';
  reconStatus: string;
}

/**
 * Shows "Assign Vendor" for debits or "Assign Customer" for credits
 * when no vendor/customer is assigned yet.
 */
export function VendorBadge({ transactionId, type }: PartyBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isDebit = type === 'debit';
  const label = isDebit ? 'Assign Vendor' : 'Assign Customer';
  const Icon = isDebit ? Store : User;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="cursor-pointer"
      >
        <Badge variant="default" title={isDebit ? 'Assign a vendor' : 'Assign a customer'}>
          <Icon className="mr-1 inline h-3 w-3" />
          {label}
        </Badge>
      </button>
      {open && (
        isDebit
          ? <VendorDropdown transactionId={transactionId} onDone={() => setOpen(false)} />
          : <CustomerDropdown transactionId={transactionId} onDone={() => setOpen(false)} />
      )}
    </div>
  );
}

// ── Vendor Dropdown ─────────────────────────────────────────────────

function VendorDropdown({ transactionId, onDone }: { transactionId: string; onDone: () => void }) {
  const { data } = useVendors({ limit: 200 });
  const qc = useQueryClient();
  const vendors = data?.data ?? [];
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return vendors;
    const q = search.toLowerCase();
    return vendors.filter((v) => v.name.toLowerCase().includes(q));
  }, [vendors, search]);

  async function handleSelect(vendorId: string) {
    setLoading(true);
    await api.put(`/banking/accounts/transactions/${transactionId}/vendor`, { vendorId });
    qc.invalidateQueries({ queryKey: ['bank-transactions'] });
    setLoading(false);
    onDone();
  }

  async function handleCreated(vendor: Vendor) {
    qc.invalidateQueries({ queryKey: ['vendors'] });
    await handleSelect(vendor.id);
  }

  if (showCreate) {
    return (
      <div className="absolute z-[9999] top-full mt-1 right-0 w-72 rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <CreateVendorInline defaultName={search} onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
      </div>
    );
  }

  return (
    <div className="absolute z-[9999] top-full mt-1 right-0 w-64 rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      <SearchInput ref={inputRef} value={search} onChange={setSearch} placeholder="Search vendors…" />
      <ul className="max-h-60 overflow-auto py-1">
        {loading && <li className="px-3 py-2 text-xs text-zinc-400">Assigning…</li>}
        {!loading && filtered.map((v) => (
          <li key={v.id} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(v.id)}
            className="cursor-pointer px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
            <span className="text-zinc-900 dark:text-zinc-100">{v.name}</span>
            {v.category && <span className="ml-2 text-xs text-zinc-400">{v.category}</span>}
          </li>
        ))}
        {!loading && filtered.length === 0 && <li className="px-3 py-2 text-xs text-zinc-400">No matching vendors</li>}
      </ul>
      {!loading && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowCreate(true)}
            className="flex w-full items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
            <Plus className="h-3.5 w-3.5" />Create new vendor{search ? `: "${search}"` : ''}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Customer Dropdown ───────────────────────────────────────────────

function CustomerDropdown({ transactionId, onDone }: { transactionId: string; onDone: () => void }) {
  const { data } = useCustomers({ limit: 200 });
  const qc = useQueryClient();
  const customerList = data?.data ?? [];
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return customerList;
    const q = search.toLowerCase();
    return customerList.filter((c) => c.name.toLowerCase().includes(q));
  }, [customerList, search]);

  async function handleSelect(customerId: string) {
    setLoading(true);
    await api.put(`/banking/accounts/transactions/${transactionId}/customer`, { customerId });
    qc.invalidateQueries({ queryKey: ['bank-transactions'] });
    setLoading(false);
    onDone();
  }

  return (
    <div className="absolute z-[9999] top-full mt-1 right-0 w-64 rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      <SearchInput ref={inputRef} value={search} onChange={setSearch} placeholder="Search customers…" />
      <ul className="max-h-60 overflow-auto py-1">
        {loading && <li className="px-3 py-2 text-xs text-zinc-400">Assigning…</li>}
        {!loading && filtered.map((c) => (
          <li key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelect(c.id)}
            className="cursor-pointer px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
            <span className="text-zinc-900 dark:text-zinc-100">{c.name}</span>
          </li>
        ))}
        {!loading && filtered.length === 0 && <li className="px-3 py-2 text-xs text-zinc-400">No matching customers</li>}
      </ul>
    </div>
  );
}

// ── Shared components ───────────────────────────────────────────────

import { forwardRef } from 'react';

const SearchInput = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; placeholder: string }>(
  ({ value, onChange, placeholder }, ref) => (
    <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
      <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <input ref={ref} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        onMouseDown={(e) => e.stopPropagation()} />
    </div>
  ),
);

// ── Inline Create Vendor ────────────────────────────────────────────

const EXPENSE_CODES = [
  { code: '5001', label: 'Raw Material Purchases' },
  { code: '5002', label: 'General Expense' },
  { code: '5201', label: 'Salary & Wages' },
  { code: '5207', label: 'Contract Labour' },
  { code: '5301', label: 'Rent Expense' },
  { code: '5302', label: 'Electricity & Water' },
  { code: '5700', label: 'Transport & Logistics' },
];

function CreateVendorInline({
  defaultName, onCreated, onCancel,
}: { defaultName: string; onCreated: (vendor: Vendor) => void; onCancel: () => void }) {
  const [name, setName] = useState(defaultName);
  const [expenseCode, setExpenseCode] = useState('5001');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: glData } = useGLAccounts();
  const glAccounts = glData?.data ?? [];

  const expenseOptions = useMemo(() => {
    const expenses = glAccounts.filter((a) => a.type === 'expense' && !a.code.endsWith('00'));
    return expenses.length > 0 ? expenses.map((a) => ({ code: a.code, label: a.name })) : EXPENSE_CODES;
  }, [glAccounts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const res = await api.post<{ data: Vendor }>('/ap/vendors', {
      name: name.trim(), expenseAccountCode: expenseCode, category: category || undefined,
    });
    setSaving(false);
    onCreated(res.data);
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">New Vendor</span>
        <button type="button" onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Name *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
          className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Expense Account</label>
        <select value={expenseCode} onChange={(e) => setExpenseCode(e.target.value)}
          className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
          {expenseOptions.map((o) => <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Category</label>
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. farmer, transport"
          className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
      </div>
      <button type="submit" disabled={!name.trim() || saving}
        className="w-full rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
        {saving ? 'Creating…' : 'Create & Assign'}
      </button>
    </form>
  );
}

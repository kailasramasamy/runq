import { useState, useRef, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useGLAccounts } from '@/hooks/queries/use-gl';
import { api } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';

interface CategoryBadgeProps {
  transactionId: string;
  accountName: string | null;
  accountCode: string | null;
  confidence: number | null;
}

function getVariant(confidence: number | null): 'default' | 'success' | 'info' | 'warning' {
  if (confidence === null) return 'default';
  if (confidence >= 0.9) return 'success';
  if (confidence >= 0.7) return 'info';
  return 'warning';
}

export function CategoryBadge({ transactionId, accountName, confidence }: CategoryBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const label = accountName ?? 'Uncategorized';
  const variant = accountName ? getVariant(confidence) : 'warning';
  const title = confidence != null
    ? `${(confidence * 100).toFixed(0)}% confidence — click to change`
    : 'Click to categorize & reconcile';

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen(!open)} className="cursor-pointer">
        <Badge variant={variant} title={title}>{label}</Badge>
      </button>
      {open && <CategoryDropdown transactionId={transactionId} onDone={() => setOpen(false)} />}
    </div>
  );
}

function CategoryDropdown({ transactionId, onDone }: { transactionId: string; onDone: () => void }) {
  const { data } = useGLAccounts();
  const qc = useQueryClient();
  const accounts = data?.data ?? [];
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus search input when dropdown opens
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
    );
  }, [accounts, search]);

  async function handleSelect(glAccountId: string) {
    await api.put(`/banking/accounts/transactions/${transactionId}/category`, {
      glAccountId,
      reconcile: true,
      learn: true,
    });
    qc.invalidateQueries({ queryKey: ['bank-transactions'] });
    onDone();
  }

  return (
    <div className="absolute z-[9999] top-full mt-1 left-0 w-72 rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      {/* Search input */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search GL accounts…"
          className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
      {/* Account list */}
      <ul className="max-h-60 overflow-auto py-1">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-xs text-zinc-400">No matching accounts</li>
        )}
        {filtered.map((a) => (
          <li
            key={a.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(a.id)}
            className="cursor-pointer px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
          >
            <span className="font-mono text-xs text-zinc-400 mr-2">{a.code}</span>
            <span className="text-zinc-900 dark:text-zinc-100">{a.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

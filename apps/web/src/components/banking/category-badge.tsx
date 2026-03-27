import { useState, useRef, useEffect } from 'react';
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
  const variant = accountName ? getVariant(confidence) : 'default';
  const title = confidence != null
    ? `${(confidence * 100).toFixed(0)}% confidence — click to change`
    : 'Click to categorize';

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

  async function handleSelect(glAccountId: string) {
    await api.put(`/banking/transactions/${transactionId}/category`, { glAccountId });
    qc.invalidateQueries({ queryKey: ['bank-transactions'] });
    onDone();
  }

  return (
    <ul className="absolute z-[9999] bottom-full mb-1 left-0 max-h-60 w-64 overflow-auto rounded-md border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      {accounts.map((a) => (
        <li
          key={a.id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleSelect(a.id)}
          className="cursor-pointer px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
        >
          <span className="font-mono text-xs text-zinc-400 mr-2">{a.code}</span>
          {a.name}
        </li>
      ))}
    </ul>
  );
}

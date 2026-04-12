import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Store } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useVendors } from '@/hooks/queries/use-vendors';
import { api } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';

interface VendorBadgeProps {
  transactionId: string;
  type: 'credit' | 'debit';
  reconStatus: string;
}

/**
 * Shows an "Assign Vendor" button for unreconciled debit transactions.
 * Hidden for credits and already-reconciled transactions.
 */
export function VendorBadge({ transactionId, type, reconStatus }: VendorBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (type !== 'debit' || reconStatus !== 'unreconciled') return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="cursor-pointer"
      >
        <Badge variant="default" title="Assign a vendor to auto-create bill & payment">
          <Store className="mr-1 inline h-3 w-3" />
          Assign Vendor
        </Badge>
      </button>
      {open && <VendorDropdown transactionId={transactionId} onDone={() => setOpen(false)} />}
    </div>
  );
}

function VendorDropdown({ transactionId, onDone }: { transactionId: string; onDone: () => void }) {
  const { data } = useVendors({ limit: 200 });
  const qc = useQueryClient();
  const vendors = data?.data ?? [];
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  return (
    <div className="absolute z-[9999] top-full mt-1 right-0 w-64 rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors…"
          className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
      <ul className="max-h-60 overflow-auto py-1">
        {loading && (
          <li className="px-3 py-2 text-xs text-zinc-400">Assigning…</li>
        )}
        {!loading && filtered.length === 0 && (
          <li className="px-3 py-2 text-xs text-zinc-400">No matching vendors</li>
        )}
        {!loading && filtered.map((v) => (
          <li
            key={v.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(v.id)}
            className="cursor-pointer px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
          >
            <span className="text-zinc-900 dark:text-zinc-100">{v.name}</span>
            {v.category && (
              <span className="ml-2 text-xs text-zinc-400">{v.category}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

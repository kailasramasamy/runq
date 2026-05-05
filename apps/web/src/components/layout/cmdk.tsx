import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Search, Sparkles, FileText, CreditCard, Landmark, Receipt, BarChart3,
  ArrowRight, LayoutDashboard, Users, ShieldCheck, Building2, FileInput,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCustomers } from '../../hooks/queries/use-customers';
import { useInvoices } from '../../hooks/queries/use-invoices';

type CmdItem = {
  id: string;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  to?: string;
  prompt?: string;
  section: 'actions' | 'navigate' | 'ask' | 'records';
};

const ITEMS: CmdItem[] = [
  // Quick actions
  { id: 'a-inv', label: 'New invoice', icon: FileText, to: '/ar/invoices/new', section: 'actions' },
  { id: 'a-pay', label: 'Record payment', icon: CreditCard, to: '/ap/payments/new', section: 'actions' },
  { id: 'a-rec', label: 'Reconcile bank', icon: Landmark, to: '/banking', section: 'actions' },
  { id: 'a-bill', label: 'New bill', icon: FileInput, to: '/ap/bills/new', section: 'actions' },
  { id: 'a-rep', label: 'Run report', icon: BarChart3, to: '/reports', section: 'actions' },
  { id: 'a-rcp', label: 'Record receipt', icon: Receipt, to: '/ar/receipts/new', section: 'actions' },
  // Navigate
  { id: 'n-dash', label: 'Go to Dashboard', icon: LayoutDashboard, to: '/', section: 'navigate' },
  { id: 'n-bills', label: 'Go to Bills', icon: FileInput, to: '/ap/bills', section: 'navigate' },
  { id: 'n-inv', label: 'Go to Invoices', icon: FileText, to: '/ar/invoices', section: 'navigate' },
  { id: 'n-vend', label: 'Go to Vendors', icon: Building2, to: '/ap/vendors', section: 'navigate' },
  { id: 'n-cust', label: 'Go to Customers', icon: Users, to: '/ar/customers', section: 'navigate' },
  { id: 'n-bank', label: 'Go to Banking', icon: Landmark, to: '/banking', section: 'navigate' },
  { id: 'n-gst', label: 'Go to GST filing', icon: ShieldCheck, to: '/gst', section: 'navigate' },
  // Ask runQ
  { id: 'q-ar', label: 'Why is my AR up this month?', icon: Sparkles, prompt: 'Why is my AR up this month?', section: 'ask' },
  { id: 'q-cash', label: 'Forecast cash for the next 60 days', icon: Sparkles, prompt: 'Forecast cash for the next 60 days', section: 'ask' },
  { id: 'q-late', label: 'Which customers are paying late?', icon: Sparkles, prompt: 'Which customers are paying late?', section: 'ask' },
];

const SECTION_LABELS: Record<CmdItem['section'], string> = {
  records: 'Results',
  actions: 'Quick actions',
  navigate: 'Navigate',
  ask: 'Ask runQ',
};

const SECTION_ORDER: CmdItem['section'][] = ['records', 'actions', 'navigate', 'ask'];

function useDebounced<T>(value: T, delay = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced live search across customers + invoices
  const q = query.trim();
  const debouncedQ = useDebounced(q, 200);
  const enabledSearch = open && debouncedQ.length >= 2;
  const customers = useCustomers(enabledSearch ? { search: debouncedQ, limit: 5 } : undefined);
  const invoices = useInvoices(enabledSearch ? { search: debouncedQ, limit: 5 } : undefined);

  const recordItems = useMemo<CmdItem[]>(() => {
    if (!enabledSearch) return [];
    const out: CmdItem[] = [];
    (customers.data?.data ?? []).forEach((c) => {
      out.push({
        id: `r-c-${c.id}`,
        label: c.name,
        sublabel: `Customer${c.gstin ? ` · ${c.gstin}` : ''}`,
        icon: Users,
        to: `/ar/customers/${c.id}`,
        section: 'records',
      });
    });
    (invoices.data?.data ?? []).forEach((inv) => {
      out.push({
        id: `r-i-${inv.id}`,
        label: inv.invoiceNumber,
        sublabel: `Invoice · ${inv.customerName}`,
        icon: FileText,
        to: `/ar/invoices/${inv.id}`,
        section: 'records',
      });
    });
    return out;
  }, [enabledSearch, customers.data, invoices.data]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    const staticFiltered = !ql
      ? ITEMS
      : ITEMS.filter((i) => i.label.toLowerCase().includes(ql) || i.section.includes(ql));
    return [...recordItems, ...staticFiltered];
  }, [q, recordItems]);

  const grouped = useMemo(() => {
    const g: Record<CmdItem['section'], CmdItem[]> = { records: [], actions: [], navigate: [], ask: [] };
    filtered.forEach((i) => g[i.section].push(i));
    return g;
  }, [filtered]);

  function activate(item: CmdItem) {
    onClose();
    if (item.to) navigate({ to: item.to as '/' });
    else if (item.prompt) {
      // Stub: in production, dispatch to agent. For now, log.
      console.log('[Ask runQ]', item.prompt);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[selected];
      if (item) activate(item);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  let runningIdx = 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 animate-fade-in backdrop-blur-[6px]"
        style={{ background: 'color-mix(in oklab, black 30%, transparent)' }}
        onClick={onClose}
      />
      <div
        className="relative z-10 flex w-[640px] max-w-[92vw] animate-scale-in flex-col overflow-hidden rounded-xl border"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)',
        }}
        onKeyDown={onKeyDown}
      >
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-soft)' }}
        >
          <Search size={16} style={{ color: 'var(--text-3)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Type a command or ask runQ a question…"
            className="flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: 'var(--text-1)' }}
          />
          <kbd
            className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
          >
            ESC
          </kbd>
        </div>
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
              No matches.
            </div>
          ) : (
            SECTION_ORDER.map((sec) => {
              const list = grouped[sec];
              if (!list.length) return null;
              return (
                <div key={sec} className="mb-2">
                  <div
                    className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em]"
                    style={{ color: 'var(--text-3)' }}
                  >
                    {SECTION_LABELS[sec]}
                  </div>
                  {list.map((item) => {
                    const idx = runningIdx++;
                    const isSel = idx === selected;
                    const Icon = item.icon;
                    const isAsk = sec === 'ask';
                    return (
                      <button
                        key={item.id}
                        onMouseEnter={() => setSelected(idx)}
                        onClick={() => activate(item)}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px]"
                        style={{
                          background: isSel ? 'var(--surface-2)' : 'transparent',
                          color: isAsk ? 'var(--accent-text)' : 'var(--text-1)',
                        }}
                      >
                        <Icon size={15} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{item.label}</span>
                          {item.sublabel && (
                            <span className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                              {item.sublabel}
                            </span>
                          )}
                        </span>
                        {isSel && <ArrowRight size={13} style={{ color: 'var(--text-3)' }} />}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <div
          className="flex items-center justify-between border-t px-4 py-2 text-[11px]"
          style={{ borderColor: 'var(--border-soft)', color: 'var(--text-3)' }}
        >
          <span>↑ ↓ navigate · ↵ select · esc close</span>
          <span className="num">{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}

/** Hook: bind ⌘K / Ctrl+K globally and expose [open, setOpen]. */
export function useCommandPalette(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return [open, setOpen];
}

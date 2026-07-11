import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FilePlus2, Inbox } from 'lucide-react';

interface MenuItem {
  icon: ReactNode;
  label: string;
  description: string;
  to: '/finance/ar/invoices/new' | '/finance/ar/customer-orders';
}

const ITEMS: MenuItem[] = [
  {
    icon: <Inbox size={16} />,
    label: 'Generate from order',
    description: 'Create an invoice from an inbound customer order.',
    to: '/finance/ar/customer-orders',
  },
  {
    icon: <FilePlus2 size={16} />,
    label: 'Blank invoice',
    description: 'Start from scratch with the new invoice form.',
    to: '/finance/ar/invoices/new',
  },
];

/**
 * Wraps a custom trigger and pops a 2-option chooser:
 *   1. Generate from order (Customer orders)
 *   2. Blank invoice (new invoice form)
 *
 * Usage:
 *   <NewInvoiceMenu>
 *     {(open) => <button onClick={open}>New invoice</button>}
 *   </NewInvoiceMenu>
 */
export function NewInvoiceMenu({
  align = 'end',
  children,
}: {
  align?: 'start' | 'end';
  children: (open: () => void) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      {children(() => setIsOpen((v) => !v))}
      {isOpen && (
        <div
          role="menu"
          className="absolute top-full z-30 mt-1.5 w-[280px] animate-scale-in overflow-hidden rounded-lg border"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)',
            [align === 'end' ? 'right' : 'left']: 0,
          }}
        >
          {ITEMS.map((item, i) => (
            <button
              key={item.to}
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                navigate({ to: item.to });
              }}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-2)]"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)',
              }}
            >
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium" style={{ color: 'var(--text-1)' }}>
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                  {item.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

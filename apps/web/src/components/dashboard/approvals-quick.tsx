import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  FileText, CreditCard, Receipt, RefreshCw, FileInput, BarChart3,
  ListChecks, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatINR } from '../../lib/utils';
import { Card2, CardTitle } from './primitives';
import { usePurchaseInvoices, useApproveInvoice } from '../../hooks/queries/use-purchase-invoices';
import type { PurchaseInvoice } from '@runq/types';
import { NewInvoiceMenu } from '../ar/new-invoice-menu';

type ApprovalRow = PurchaseInvoice & { vendorName?: string | null };

type QA = { label: string; icon: LucideIcon; to?: string; key?: 'new-invoice' };
const QUICK_ACTIONS: QA[] = [
  { label: 'New invoice', icon: FileText, key: 'new-invoice' },
  { label: 'Record payment', icon: CreditCard, to: '/finance/ap/payments/new' },
  { label: 'Add expense', icon: Receipt, to: '/finance/expenses/new' },
  { label: 'Reconcile', icon: RefreshCw, to: '/finance/banking' },
  { label: 'New bill', icon: FileInput, to: '/finance/ap/bills/new' },
  { label: 'Run report', icon: BarChart3, to: '/finance/reports' },
];

function dueLabel(dueDate: string): string {
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  return `${days}d`;
}

export function ApprovalsAndQuickActions() {
  const navigate = useNavigate();
  const list = usePurchaseInvoices({ status: 'matched' }, 1, 4);
  const approve = useApproveInvoice();
  const [acting, setActing] = useState<string | null>(null);

  const items = (list.data?.data ?? []) as ApprovalRow[];
  const total = list.data?.meta?.total ?? items.length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card2>
        <CardTitle
          icon={<ListChecks size={14} />}
          action={
            <span
              className="num rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
            >
              {total}
            </span>
          }
        >
          Approvals queue
        </CardTitle>

        {list.isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded"
                style={{ background: 'var(--surface-2)' }}
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div
            className="rounded-md py-6 text-center text-[12px]"
            style={{ color: 'var(--text-3)' }}
          >
            All caught up — no bills awaiting approval.
          </div>
        ) : (
          <div className="space-y-0">
            {items.map((a, i) => (
              <div
                key={a.id}
                className="flex items-center gap-3 py-2.5"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="num text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                      {a.invoiceNumber}
                    </span>
                    <span className="num text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {dueLabel(a.dueDate)}
                    </span>
                  </div>
                  <div
                    className="mt-0.5 truncate text-[12px]"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {a.vendorName ?? 'Unknown vendor'}
                  </div>
                </div>
                <div
                  className="num shrink-0 text-[13px] font-semibold"
                  style={{ color: 'var(--text-1)' }}
                >
                  {formatINR(Number(a.totalAmount) || 0)}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    disabled={acting === a.id}
                    onClick={async () => {
                      setActing(a.id);
                      try {
                        await approve.mutateAsync({ id: a.id });
                      } finally {
                        setActing(null);
                      }
                    }}
                    className="rounded-md px-2 py-1 text-[11px] font-medium hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                  >
                    {acting === a.id ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => navigate({ to: '/finance/ap/bills' })}
                    className="rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-[color:var(--surface-2)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card2>

      <Card2>
        <CardTitle icon={<Zap size={14} />}>Quick actions</CardTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_ACTIONS.map((qa) => {
            const Icon = qa.icon;
            const tile = (onClick: () => void) => (
              <button
                onClick={onClick}
                className="flex w-full flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-[color:var(--surface-2)]"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-md"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                >
                  <Icon size={16} />
                </span>
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-1)' }}>
                  {qa.label}
                </span>
              </button>
            );
            if (qa.key === 'new-invoice') {
              return (
                <NewInvoiceMenu key={qa.label} align="start">
                  {(open) => tile(open)}
                </NewInvoiceMenu>
              );
            }
            return (
              <div key={qa.label}>
                {tile(() => navigate({ to: qa.to as '/' }))}
              </div>
            );
          })}
        </div>
      </Card2>
    </div>
  );
}

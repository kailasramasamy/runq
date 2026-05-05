import { Sparkles, User, ArrowRight, History } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { formatINR } from '../../lib/utils';
import { Card2, CardTitle } from './primitives';
import { useDashboardActivity } from '../../hooks/queries/use-dashboard';
import type { ActivityEntry } from '../../hooks/queries/use-dashboard';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 1) return 'Yest';
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function describeAction(r: ActivityEntry): { action: string; object: string } {
  const refType = r.entityType === 'sales_invoice'
    ? 'Invoice'
    : r.entityType === 'purchase_invoice'
      ? 'Bill'
      : r.entityType.replace(/_/g, ' ');
  const action = r.action.charAt(0).toUpperCase() + r.action.slice(1).replace(/_/g, ' ');
  const ref = r.entityRef ?? '';
  const cp = r.counterparty ? ` · ${r.counterparty}` : '';
  return {
    action,
    object: ref ? `${refType} ${ref}${cp}` : refType,
  };
}

export function RecentActivity() {
  const navigate = useNavigate();
  const activity = useDashboardActivity(8);
  const rows = activity.data?.data ?? [];

  return (
    <Card2 padded={false}>
      <div className="flex items-center justify-between p-4 pb-2">
        <CardTitle icon={<History size={14} />}>Recent activity</CardTitle>
      </div>
      {activity.isLoading ? (
        <div className="space-y-1 px-4 pb-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded"
              style={{ background: 'var(--surface-2)' }}
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>
          No activity yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: 'var(--text-3)' }}>
                <th className="px-4 pb-2 text-left font-medium">Time</th>
                <th className="px-4 pb-2 text-left font-medium">Actor</th>
                <th className="px-4 pb-2 text-left font-medium">Action</th>
                <th className="px-4 pb-2 text-left font-medium">Object</th>
                <th className="px-4 pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const { action, object } = describeAction(r);
                const isAgent = !r.userName;
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderTop: '1px solid var(--border-soft)',
                      color: 'var(--text-1)',
                    }}
                  >
                    <td className="num px-4 py-2.5" style={{ color: 'var(--text-3)' }}>
                      {formatTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full"
                          style={{
                            background: isAgent ? 'var(--accent-soft)' : 'var(--surface-2)',
                            color: isAgent ? 'var(--accent-text)' : 'var(--text-2)',
                          }}
                        >
                          {isAgent ? <Sparkles size={10} /> : <User size={10} />}
                        </span>
                        <span style={{ color: 'var(--text-2)' }}>
                          {r.userName ?? 'runQ Agent'}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-1)' }}>{action}</td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-2)' }}>{object}</td>
                    <td className="num px-4 py-2.5 text-right" style={{ color: 'var(--text-1)' }}>
                      {r.amount != null ? formatINR(r.amount) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div
        className="flex items-center justify-end gap-1 border-t px-4 py-2.5 text-[12px]"
        style={{ borderColor: 'var(--border-soft)' }}
      >
        <button
          onClick={() => navigate({ to: '/audit/gap-scan' })}
          className="flex items-center gap-1 font-medium hover:underline"
          style={{ color: 'var(--accent-text)' }}
        >
          View full audit trail <ArrowRight size={12} />
        </button>
      </div>
    </Card2>
  );
}

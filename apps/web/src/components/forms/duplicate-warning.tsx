import { AlertTriangle, ExternalLink, XCircle } from 'lucide-react';
import { formatINR } from '../../lib/utils';
import { Button } from '@/components/ui';

export interface DuplicateMatch {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  status: string;
  matchType: string;
  confidence: number;
}

interface Props {
  matches: DuplicateMatch[];
  onDismiss: () => void;
}

const MATCH_LABELS: Record<string, string> = {
  exact_invoice_number: 'Exact invoice number match',
  similar_amount_and_date: 'Similar amount and date',
  same_amount_recent: 'Same amount within 30 days',
};

function hasExactMatch(matches: DuplicateMatch[]): boolean {
  return matches.some((m) => m.confidence === 1.0);
}

function MatchRow({ match }: { match: DuplicateMatch }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {match.invoiceNumber}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {match.invoiceDate} &middot; {formatINR(match.totalAmount)} &middot;{' '}
          <span className="capitalize">{match.status.replace('_', ' ')}</span>
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {MATCH_LABELS[match.matchType] ?? match.matchType}
        </span>
      </div>
      <a
        href={`/ap/bills/${match.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
      >
        View <ExternalLink size={12} />
      </a>
    </div>
  );
}

export function DuplicateWarning({ matches, onDismiss }: Props) {
  if (matches.length === 0) return null;

  const isExact = hasExactMatch(matches);
  const borderColor = isExact
    ? 'border-red-300 dark:border-red-700'
    : 'border-amber-300 dark:border-amber-700';
  const bgColor = isExact
    ? 'bg-red-50 dark:bg-red-950'
    : 'bg-amber-50 dark:bg-amber-950';
  const iconColor = isExact
    ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400';
  const title = isExact
    ? 'Duplicate invoice detected'
    : 'Potential duplicate invoices found';

  const Icon = isExact ? XCircle : AlertTriangle;

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 shrink-0 ${iconColor}`} size={20} />
        <div className="flex flex-1 flex-col gap-2">
          <p className={`text-sm font-semibold ${iconColor}`}>{title}</p>
          <div className="flex flex-col gap-1.5">
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
          {!isExact && (
            <div className="mt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
                I understand, continue
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CreditScoreBadgeProps {
  score: number;
  risk: 'high' | 'medium' | 'low';
}

const RISK_STYLES = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40',
  high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/40',
} as const;

const RISK_LABELS = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
} as const;

export function CreditScoreBadge({ score, risk }: CreditScoreBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${RISK_STYLES[risk]}`}
    >
      <span className="font-mono font-bold">{score}</span>
      <span>{RISK_LABELS[risk]}</span>
    </span>
  );
}

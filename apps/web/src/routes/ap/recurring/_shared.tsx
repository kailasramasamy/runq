import { Badge } from '@/components/ui';
import type { RecurringCategory, RecurringFrequency } from '@/hooks/queries/use-recurring-bills';

export const CATEGORY_LABEL: Record<RecurringCategory, string> = {
  rent: 'Rent',
  transport: 'Transport',
  other: 'Other',
};

export const DEFAULT_ACCOUNT: Record<RecurringCategory, string> = {
  rent: '5301',
  transport: '5700',
  other: '5002',
};

const CATEGORY_VARIANT = { rent: 'info', transport: 'cyan', other: 'default' } as const;

export function CategoryBadge({ category }: { category: RecurringCategory }) {
  return <Badge variant={CATEGORY_VARIANT[category]}>{CATEGORY_LABEL[category]}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? 'success' : 'warning'}>{active ? 'Active' : 'Paused'}</Badge>;
}

/** When bills are raised — after each period, since these are paid in arrears. */
export function scheduleLabel(a: { frequency: RecurringFrequency; billDay: number }): string {
  return a.frequency === 'semi_monthly' ? 'Twice a month — 16th & 1st' : `${ordinal(a.billDay)} of next month`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

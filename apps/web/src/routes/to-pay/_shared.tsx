import { FileText, Repeat, Users, Landmark, Milk, Receipt, type LucideIcon } from 'lucide-react';
import type { ToPayCategory } from '@/hooks/queries/use-to-pay';

export const CATEGORY_ICON: Record<ToPayCategory, LucideIcon> = {
  bills: FileText,
  rent_transport: Repeat,
  salaries: Users,
  statutory: Landmark,
  milk: Milk,
  claims: Receipt,
};

const DAY_MS = 86_400_000;

/** Whole days from `asOf` to `dueDate` (negative when overdue). */
export function daysFrom(asOf: string, dueDate: string): number {
  return Math.round((Date.parse(dueDate) - Date.parse(asOf)) / DAY_MS);
}

export type Bucket = 'overdue' | 'week' | 'later';

export function bucketOf(asOf: string, dueDate: string): Bucket {
  const d = daysFrom(asOf, dueDate);
  if (d < 0) return 'overdue';
  return d <= 6 ? 'week' : 'later';
}

export function currentMonth(asOf: string): string {
  return asOf.slice(0, 7);
}

/** Shift a YYYY-MM string by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

import type { QualityBandRange } from '@/hooks/queries/use-milk-procurement';

export type BandLevel = 'good' | 'watch' | 'low';

export function bandLevel(value: number, band?: QualityBandRange): BandLevel | undefined {
  if (!band) return undefined;
  if (value >= band.goodMin) return 'good';
  if (value >= band.watchMin) return 'watch';
  return 'low';
}

export function bandCellClass(level: BandLevel | undefined): string {
  if (level === 'good') return 'text-green-700 dark:text-green-400';
  if (level === 'watch') return 'text-amber-700 dark:text-amber-400';
  if (level === 'low') return 'text-red-700 dark:text-red-400';
  return '';
}

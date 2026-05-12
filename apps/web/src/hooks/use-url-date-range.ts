import { useCallback, useEffect, useState } from 'react';
import type { DateRange } from '@/components/ui/date-range-filter';

const EMPTY: DateRange = { from: '', to: '' };

function readFromUrl(fromKey: string, toKey: string): DateRange {
  if (typeof window === 'undefined') return EMPTY;
  const sp = new URLSearchParams(window.location.search);
  return { from: sp.get(fromKey) ?? '', to: sp.get(toKey) ?? '' };
}

function writeToUrl(fromKey: string, toKey: string, value: DateRange): void {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(window.location.search);
  if (value.from) sp.set(fromKey, value.from); else sp.delete(fromKey);
  if (value.to)   sp.set(toKey, value.to);     else sp.delete(toKey);
  const next = sp.toString();
  const url = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', url);
}

export function useUrlDateRange(options: {
  fromKey?: string;
  toKey?: string;
  initial?: DateRange;
} = {}): [DateRange, (next: DateRange) => void] {
  const fromKey = options.fromKey ?? 'from';
  const toKey = options.toKey ?? 'to';

  const [value, setValue] = useState<DateRange>(() => {
    const url = readFromUrl(fromKey, toKey);
    if (url.from || url.to) return url;
    return options.initial ?? EMPTY;
  });

  useEffect(() => {
    writeToUrl(fromKey, toKey, value);
  }, [fromKey, toKey, value]);

  useEffect(() => {
    function onPop() {
      setValue(readFromUrl(fromKey, toKey));
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [fromKey, toKey]);

  const update = useCallback((next: DateRange) => setValue(next), []);
  return [value, update];
}

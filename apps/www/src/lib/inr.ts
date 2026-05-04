interface InrOpts {
  compact?: boolean;
  decimals?: number;
}

export function inr(n: number, { compact = false, decimals = 2 }: InrOpts = {}): string {
  if (compact) {
    if (Math.abs(n) >= 10_000_000) return '₹' + (n / 10_000_000).toFixed(2) + ' Cr';
    if (Math.abs(n) >= 100_000) return '₹' + (n / 100_000).toFixed(2) + ' L';
    if (Math.abs(n) >= 1_000) return '₹' + (n / 1_000).toFixed(1) + 'K';
  }
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

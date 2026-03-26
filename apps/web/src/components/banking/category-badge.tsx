import { Badge } from '@/components/ui';

interface CategoryBadgeProps {
  accountName: string | null;
  accountCode: string | null;
  confidence: number | null;
}

function getVariant(confidence: number | null): 'default' | 'success' | 'info' | 'warning' {
  if (confidence === null) return 'default';
  if (confidence >= 0.9) return 'success';
  if (confidence >= 0.7) return 'info';
  return 'warning';
}

export function CategoryBadge({ accountName, accountCode, confidence }: CategoryBadgeProps) {
  if (!accountName || !accountCode) {
    return (
      <Badge variant="default">Uncategorized</Badge>
    );
  }

  const variant = getVariant(confidence);
  const label = `${accountCode} ${accountName}`;

  return (
    <Badge variant={variant} title={confidence !== null ? `Confidence: ${(confidence * 100).toFixed(0)}%` : undefined}>
      {label}
    </Badge>
  );
}

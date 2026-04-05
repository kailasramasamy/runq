import { Clock, AlertTriangle, BadgePercent, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Th,
  TableSkeleton,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useEarlyPaymentDiscounts } from '@/hooks/queries/use-vendor-management';
import type { EarlyPaymentOpportunity } from '@/hooks/queries/use-vendor-management';

function urgencyVariant(days: number) {
  if (days < 0) return 'danger' as const;
  if (days <= 3) return 'danger' as const;
  if (days <= 7) return 'warning' as const;
  return 'success' as const;
}

function urgencyLabel(days: number) {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days}d left`;
}

// ─── Early Discounts Page ────────────────────────────────────────────────────

export function EarlyDiscountsPage() {
  const { data, isLoading } = useEarlyPaymentDiscounts();
  const payments: EarlyPaymentOpportunity[] = data?.data ?? [];

  // Split into discount opportunities vs regular upcoming payments
  const withDiscount = payments.filter((p) => p.discountAvailable);
  const withoutDiscount = payments.filter((p) => !p.discountAvailable);

  const totalSavings = withDiscount.reduce((sum, p) => sum + (p.savingsAmount ?? 0), 0);
  const totalDue = payments.reduce((sum, p) => sum + p.balanceDue, 0);
  const overdue = payments.filter((p) => p.daysRemaining < 0);

  return (
    <div>
      <PageHeader
        title="Early Payment Discounts"
        breadcrumbs={[{ label: 'Vendor Management' }, { label: 'Early Discounts' }]}
        description="Pay vendors early to capture discounts. Configure discount terms on each vendor's payment settings."
        actions={
          <Button variant="outline" size="sm" onClick={() => downloadCSV('early-payment-opportunities.csv', ['Invoice Number', 'Vendor', 'Due Date', 'Balance Due', 'Status', 'Days Remaining', 'Discount %', 'Savings'], payments.map(p => [p.invoiceNumber, p.vendorName, p.dueDate, String(p.balanceDue), p.status, String(p.daysRemaining), p.discountPercent != null ? String(p.discountPercent) : '', p.savingsAmount != null ? String(p.savingsAmount) : '']))}>
            <Download size={14} /> Export CSV
          </Button>
        }
      />

      {!isLoading && payments.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Discount Opportunities" value={String(withDiscount.length)} variant={withDiscount.length > 0 ? 'success' : 'default'} />
          <SummaryCard label="Potential Savings" value={formatINR(totalSavings)} variant={totalSavings > 0 ? 'success' : 'default'} />
          <SummaryCard label="Total Due (30d)" value={formatINR(totalDue)} />
          <SummaryCard label="Overdue" value={String(overdue.length)} variant={overdue.length > 0 ? 'danger' : 'default'} />
        </div>
      )}

      {/* Discount opportunities section */}
      {!isLoading && withDiscount.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <BadgePercent size={14} className="mr-1 inline" />
            Active Discount Windows ({withDiscount.length})
          </h3>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Vendor</Th>
                    <Th>Discount Terms</Th>
                    <Th>Discount Window</Th>
                    <Th align="right">Balance Due</Th>
                    <Th align="right">Savings</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {withDiscount.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.invoiceNumber}</TableCell>
                      <TableCell className="font-medium">{p.vendorName}</TableCell>
                      <TableCell>
                        <span className="text-sm">{p.discountPercent}% if paid within {p.discountDays}d</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={urgencyVariant(p.discountDaysRemaining!)}>
                          <Clock size={12} className="mr-1" />
                          {p.discountDaysRemaining}d left
                        </Badge>
                      </TableCell>
                      <TableCell align="right" numeric>{formatINR(p.balanceDue)}</TableCell>
                      <TableCell align="right" numeric>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {formatINR(p.savingsAmount!)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* All upcoming payments */}
      <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        All Upcoming Payments ({isLoading ? '...' : payments.length})
      </h3>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Invoice</Th>
                <Th>Vendor</Th>
                <Th>Due Date</Th>
                <Th>Status</Th>
                <Th align="right">Balance Due</Th>
                <Th>Urgency</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : payments.length === 0 ? (
                <TableEmpty colSpan={6} message="No unpaid invoices due in the next 30 days." />
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.invoiceNumber}</TableCell>
                    <TableCell className="font-medium">{p.vendorName}</TableCell>
                    <TableCell className="text-sm">{p.dueDate}</TableCell>
                    <TableCell>
                      <Badge variant="default">{p.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell align="right" numeric>{formatINR(p.balanceDue)}</TableCell>
                    <TableCell>
                      <Badge variant={urgencyVariant(p.daysRemaining)}>
                        {p.daysRemaining < 0 ? <AlertTriangle size={12} className="mr-1" /> : <Clock size={12} className="mr-1" />}
                        {urgencyLabel(p.daysRemaining)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, variant }: { label: string; value: string; variant?: 'danger' | 'warning' | 'success' | 'default' }) {
  const colors = variant === 'danger'
    ? 'border-red-200 dark:border-red-900/50'
    : variant === 'warning'
      ? 'border-amber-200 dark:border-amber-900/50'
      : variant === 'success'
        ? 'border-green-200 dark:border-green-900/50'
        : 'border-zinc-200 dark:border-zinc-800';
  const valueColors = variant === 'danger'
    ? 'text-red-600 dark:text-red-400'
    : variant === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : variant === 'success'
        ? 'text-green-600 dark:text-green-400'
        : 'text-zinc-900 dark:text-zinc-100';

  return (
    <div className={`rounded-lg border bg-white p-3 dark:bg-zinc-900 ${colors}`}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${valueColors}`}>{value}</p>
    </div>
  );
}

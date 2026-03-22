import { Card, CardContent, PageHeader } from '@/components/ui';

const NOTIFICATION_ITEMS = [
  { label: 'Payment approved', description: 'Vendor gets a payment confirmation email' },
  { label: 'Invoice sent', description: 'Customer gets the invoice email' },
  { label: 'Receipt recorded', description: 'Customer gets a receipt confirmation email' },
  { label: 'Batch payment executed', description: 'Owner gets a batch summary email' },
  { label: 'Overdue reminder', description: 'Customer gets a dunning reminder email' },
];

export function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Manage automated email notifications"
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Email Notifications</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Notifications are sent automatically when:
            </p>
          </div>

          <ul className="space-y-3">
            {NOTIFICATION_ITEMS.map((item) => (
              <li key={item.label} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-bold">
                  ✓
                </span>
                <div>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{item.label}</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400"> — {item.description}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Configuration: </span>
              Configure SMTP settings in server environment variables (
              <code className="font-mono text-xs">SMTP_HOST</code>,{' '}
              <code className="font-mono text-xs">SMTP_USER</code>,{' '}
              <code className="font-mono text-xs">SMTP_PASS</code>,{' '}
              <code className="font-mono text-xs">MAIL_FROM</code>). When SMTP is not configured, emails are logged to console only.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { Plus, Trash2, X, Play, AlertCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Th,
  TableSkeleton,
  ConfirmationDialog,
  useToast,
} from '@/components/ui';
import {
  useScheduledReports,
  useCreateScheduledReport,
  useToggleScheduledReport,
  useDeleteScheduledReport,
  useRunScheduledReport,
} from '@/hooks/queries/use-widgets';

const REPORT_TYPE_OPTIONS = [
  { value: '', label: 'Select report...' },
  { value: 'profit_and_loss', label: 'Profit & Loss' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'cash_flow', label: 'Cash Flow' },
  { value: 'expense_analytics', label: 'Expense Analytics' },
  { value: 'revenue_analytics', label: 'Revenue Analytics' },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateScheduledReport();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [recipients, setRecipients] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const recipientList = recipients
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    if (recipientList.length === 0) {
      toast('Add at least one recipient email', 'error');
      return;
    }
    try {
      await create.mutateAsync({
        name,
        reportType,
        frequency: frequency as 'daily' | 'weekly' | 'monthly',
        recipients: recipientList,
      });
      toast('Scheduled report created', 'success');
      onClose();
    } catch {
      toast('Failed to create scheduled report', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Scheduled Report</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Weekly P&L Summary" />
          <Select label="Report Type" value={reportType} onChange={(e) => setReportType(e.target.value)} options={REPORT_TYPE_OPTIONS} required />
          <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} options={FREQUENCY_OPTIONS} />
          <Input label="Recipients" value={recipients} onChange={(e) => setRecipients(e.target.value)} required placeholder="jane@co.com, bob@co.com" />
        </div>
        <p className="text-xs text-zinc-500">Comma-separated email addresses. Configure your email provider in Settings &gt; Email Provider first.</p>
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Create</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Scheduled Reports Page ──────────────────────────────────────────────────

export function ScheduledReportsPage() {
  const { data, isLoading } = useScheduledReports();
  const toggle = useToggleScheduledReport();
  const deleteReport = useDeleteScheduledReport();
  const runNow = useRunScheduledReport();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const reports = data?.data ?? [];

  async function handleToggle(id: string) {
    try {
      await toggle.mutateAsync(id);
      toast('Report toggled', 'success');
    } catch {
      toast('Failed to toggle report', 'error');
    }
  }

  async function handleRunNow(id: string) {
    try {
      await runNow.mutateAsync(id);
      toast('Report sent successfully', 'success');
    } catch {
      toast('Failed to run report. Check email provider settings.', 'error');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteReport.mutateAsync(deleteTarget);
      toast('Report deleted', 'success');
    } catch {
      toast('Failed to delete report', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Scheduled Reports"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Scheduled Reports' }]}
        description="Automatically email financial reports on a schedule."
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} />
            New Schedule
          </Button>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Name</Th>
                <Th>Report</Th>
                <Th>Frequency</Th>
                <Th>Recipients</Th>
                <Th>Status</Th>
                <Th>Last Run</Th>
                <Th>Next Run</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={4} cols={8} />
              ) : reports.length === 0 ? (
                <TableEmpty colSpan={8} message="No scheduled reports yet." />
              ) : (
                reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="info">{r.reportType.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{r.frequency}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-zinc-600 dark:text-zinc-400 text-xs">
                      {r.recipients.join(', ')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={r.isActive ? 'success' : 'default'}>
                          {r.isActive ? 'Active' : 'Paused'}
                        </Badge>
                        {r.lastRunStatus === 'failed' && (
                          <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400" title={r.lastError ?? undefined}>
                            <AlertCircle size={12} /> Failed
                          </span>
                        )}
                        {r.lastRunStatus === 'success' && (
                          <span className="text-xs text-green-600 dark:text-green-400">Last: sent</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">
                      {r.lastSentAt ? new Date(r.lastSentAt).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-600 dark:text-zinc-400">
                      {r.nextRunAt ? new Date(r.nextRunAt).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRunNow(r.id)}
                          disabled={runNow.isPending}
                          title="Send now"
                        >
                          <Play size={14} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggle(r.id)}
                          disabled={toggle.isPending}
                        >
                          {r.isActive ? 'Pause' : 'Resume'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(r.id)}
                          className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Scheduled Report"
        description="Are you sure you want to delete this scheduled report? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleteReport.isPending}
      />
    </div>
  );
}

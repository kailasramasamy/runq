import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { FileText, Upload, CheckCircle, AlertCircle, Clock, Plus, Trash2 } from 'lucide-react';
import { useGstReturns, useGenerateGstr1, useGenerateGstr3b, useDeleteReturn } from '@/hooks/queries/use-gst-returns';
import { ConfirmationDialog } from '@/components/ui';
import type { GstReturn } from '@/hooks/queries/use-gst-returns';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Button, Card, CardContent, Badge, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, EmptyState, useToast,
} from '@/components/ui';

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  validated: 'warning',
  uploaded: 'warning',
  filed: 'success',
  error: 'danger',
};

function periodLabel(period: string): string {
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2), 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${year}`;
}

function generatePeriodOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const period = `${mm}${yyyy}`;
    options.push({ value: period, label: periodLabel(period) });
  }
  return options;
}

export function GstReturnsPage() {
  const { toast } = useToast();
  const { data: returnsData, isLoading } = useGstReturns();
  const generateMutation = useGenerateGstr1();
  const generate3bMutation = useGenerateGstr3b();
  const deleteMutation = useDeleteReturn();
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [showGenerate, setShowGenerate] = useState<'gstr1' | 'gstr3b' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GstReturn | null>(null);

  const returns: GstReturn[] = returnsData?.data ?? [];
  // Build a set of (period, returnType) keys that are already filed so we
  // can disable those options in the period picker.
  const filedKeys = new Set(returns.filter((r) => r.status === 'filed').map((r) => `${r.period}|${r.returnType}`));
  const baseOptions = generatePeriodOptions();
  const currentReturnType = showGenerate === 'gstr3b' ? 'gstr3b' : 'gstr1';
  const periodOptions = baseOptions.map((o) => {
    const isFiled = filedKeys.has(`${o.value}|${currentReturnType}`);
    return isFiled ? { ...o, label: `${o.label} (already filed)` } : o;
  });
  const selectedAlreadyFiled = !!selectedPeriod && filedKeys.has(`${selectedPeriod}|${currentReturnType}`);

  function handleGenerate() {
    if (!selectedPeriod) { toast('Select a filing period', 'error'); return; }
    if (selectedAlreadyFiled) {
      toast('This period is already filed. Pick another period.', 'error');
      return;
    }
    const mutation = showGenerate === 'gstr3b' ? generate3bMutation : generateMutation;
    const label = showGenerate === 'gstr3b' ? 'GSTR-3B' : 'GSTR-1';
    mutation.mutate(selectedPeriod, {
      onSuccess: () => {
        toast(`${label} draft generated`, 'success');
        setShowGenerate(null);
        setSelectedPeriod('');
      },
      onError: (err: any) => toast(err?.message ?? 'Failed to generate', 'error'),
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => { toast('Return deleted', 'success'); setDeleteTarget(null); },
      onError: (err: any) => toast(err?.message ?? 'Failed to delete', 'error'),
    });
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="GST Returns"
        description="Generate, validate, and file GSTR-1 and GSTR-3B returns."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowGenerate(showGenerate === 'gstr1' ? null : 'gstr1')}>
              <Plus className="h-4 w-4 mr-2" /> Generate GSTR-1
            </Button>
            <Button variant="outline" onClick={() => setShowGenerate(showGenerate === 'gstr3b' ? null : 'gstr3b')}>
              <Plus className="h-4 w-4 mr-2" /> Generate GSTR-3B
            </Button>
          </div>
        }
      />

      {showGenerate && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Filing Period</label>
                <Combobox
                  options={periodOptions}
                  value={selectedPeriod}
                  onChange={setSelectedPeriod}
                  placeholder="Select month..."
                />
              </div>
              <Button onClick={handleGenerate} disabled={generateMutation.isPending || generate3bMutation.isPending || selectedAlreadyFiled}>
                {(generateMutation.isPending || generate3bMutation.isPending) ? 'Generating...' : `Generate ${showGenerate === 'gstr3b' ? 'GSTR-3B' : 'GSTR-1'}`}
              </Button>
              <Button variant="ghost" onClick={() => setShowGenerate(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : returns.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No GST Returns"
          description="Generate your first GSTR-1 to get started."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Period</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>ARN</Th>
                <Th>Filed At</Th>
                <Th />
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{periodLabel(r.period)}</TableCell>
                  <TableCell>
                    <Badge variant="default">{r.returnType.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[r.status] ?? 'default'}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">{r.arn ?? '—'}</TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {r.filedAt ? new Date(r.filedAt).toLocaleDateString('en-IN') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={(r.returnType === 'gstr3b' ? '/gst/returns/$returnId/3b' : '/gst/returns/$returnId') as '/'}
                        params={{ returnId: r.id }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
                      >
                        {r.status === 'filed' ? 'View' : 'Continue'}
                      </Link>
                      {r.status !== 'filed' && (
                        <button
                          onClick={() => setDeleteTarget(r)}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete draft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ConfirmationDialog
        open={!!deleteTarget}
        title="Delete GST Return Draft"
        description={deleteTarget ? `Delete ${deleteTarget.returnType.toUpperCase()} draft for ${periodLabel(deleteTarget.period)}? This can't be undone.` : ''}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

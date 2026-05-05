import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { FileText, Plus, Trash2, ChevronRight } from 'lucide-react';
import { useGstReturns, useGenerateGstr1, useGenerateGstr3b, useDeleteReturn } from '@/hooks/queries/use-gst-returns';
import { ConfirmationDialog, Combobox } from '@/components/ui';
import type { GstReturn } from '@/hooks/queries/use-gst-returns';
import {
  PageHeader, Button, Badge, StatTile, StatusBadge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  EmptyState, formatDate,
} from '@/components/ar/primitives';
import { useToast } from '@/components/ui';

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
      onError: (err: unknown) => toast((err as { message?: string })?.message ?? 'Failed to generate', 'error'),
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => { toast('Return deleted', 'success'); setDeleteTarget(null); },
      onError: (err: unknown) => toast((err as { message?: string })?.message ?? 'Failed to delete', 'error'),
    });
  }

  const filedCount = returns.filter((r) => r.status === 'filed').length;
  const draftCount = returns.filter((r) => r.status === 'draft' || r.status === 'validated').length;
  const errorCount = returns.filter((r) => r.status === 'error').length;
  const gstr1Count = returns.filter((r) => r.returnType === 'gstr1').length;
  const gstr3bCount = returns.filter((r) => r.returnType === 'gstr3b').length;

  return (
    <div>
      <PageHeader
        title="GST returns"
        description="Generate, validate, and file GSTR-1 and GSTR-3B returns."
        actions={
          <>
            <Button size="sm" icon={<Plus size={13} />} onClick={() => setShowGenerate(showGenerate === 'gstr1' ? null : 'gstr1')}>
              Generate GSTR-1
            </Button>
            <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => setShowGenerate(showGenerate === 'gstr3b' ? null : 'gstr3b')}>
              Generate GSTR-3B
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total returns" value={returns.length} sub={`${gstr1Count} GSTR-1 · ${gstr3bCount} GSTR-3B`} />
        <StatTile label="Filed" value={filedCount} sub="Submitted to GSTN" tone="pos" />
        <StatTile label="Drafts" value={draftCount} sub="Awaiting filing" tone={draftCount > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Errors" value={errorCount} sub="Need review" tone={errorCount > 0 ? 'neg' : 'neutral'} />
      </div>

      {showGenerate && (
        <div
          className="mb-5 rounded-xl border p-4"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Filing period
              </label>
              <Combobox
                options={periodOptions}
                value={selectedPeriod}
                onChange={setSelectedPeriod}
                placeholder="Select month..."
              />
            </div>
            <Button
              size="sm"
              loading={generateMutation.isPending || generate3bMutation.isPending}
              disabled={selectedAlreadyFiled}
              onClick={handleGenerate}
            >
              Generate {showGenerate === 'gstr3b' ? 'GSTR-3B' : 'GSTR-1'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowGenerate(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Period</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th>ARN</Th>
            <Th>Filed at</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-3 w-full max-w-[120px] animate-pulse rounded" style={{ background: 'var(--surface-2)' }} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : returns.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyState
                  icon={<FileText size={18} />}
                  title="No GST returns yet"
                  description="Generate your first GSTR-1 or GSTR-3B to get started."
                />
              </td>
            </tr>
          ) : returns.map((r) => (
            <TableRow key={r.id}>
              <TableCell numeric className="font-medium" style={{ color: 'var(--text-1)' }}>{periodLabel(r.period)}</TableCell>
              <TableCell><Badge variant="default">{r.returnType.toUpperCase()}</Badge></TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell numeric style={{ color: 'var(--text-3)' }}>{r.arn ?? '—'}</TableCell>
              <TableCell numeric style={{ color: 'var(--text-3)' }}>
                {r.filedAt ? formatDate(r.filedAt) : '—'}
              </TableCell>
              <TableCell align="right">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    to={(r.returnType === 'gstr3b' ? '/gst/returns/$returnId/3b' : '/gst/returns/$returnId') as '/'}
                    params={{ returnId: r.id }}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium hover:opacity-90"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {r.status === 'filed' ? 'View' : 'Continue'} <ChevronRight size={12} />
                  </Link>
                  {r.status !== 'filed' && (
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="rounded p-1 hover:bg-[var(--neg-soft)]"
                      style={{ color: 'var(--neg)' }}
                      title="Delete draft"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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

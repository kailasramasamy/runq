import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Play, ExternalLink } from 'lucide-react';
import { useDepreciationPreview, useRunDepreciation } from '@/hooks/queries/use-fixed-assets';
import type { DepreciationPreviewLine, DepreciationRunResult } from '@runq/types';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Button, Card, CardHeader, CardContent, DateInput, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton, Badge, useToast,
} from '@/components/ui';

const DEP_TYPE_OPTIONS = [
  { value: 'companies_act', label: 'Companies Act' },
  { value: 'it_act', label: 'IT Act' },
];

export function DepreciationRunPage() {
  const { toast } = useToast();
  const [periodEnd, setPeriodEnd] = useState('');
  const [depType, setDepType] = useState('companies_act');
  const [previewing, setPreviewing] = useState(false);
  const [runResult, setRunResult] = useState<DepreciationRunResult | null>(null);

  const {
    data: previewData,
    isLoading: isLoadingPreview,
    isError: isPreviewError,
  } = useDepreciationPreview(previewing ? periodEnd : '', previewing ? depType : '');

  const runMutation = useRunDepreciation();

  const previewLines: DepreciationPreviewLine[] = previewData?.data ?? [];
  const totalDep = previewLines.reduce((sum, l) => sum + Number(l.depreciationAmount), 0);

  function handlePreview() {
    if (!periodEnd) { toast('Select a period end date first', 'error'); return; }
    setRunResult(null);
    setPreviewing(true);
  }

  function handlePost() {
    if (!periodEnd) return;
    runMutation.mutate(
      { periodEnd, depreciationType: depType },
      {
        onSuccess: (res) => {
          setRunResult((res as any).data);
          toast('Depreciation posted successfully', 'success');
        },
        onError: (err: any) => toast(err?.message ?? 'Failed to post depreciation', 'error'),
      },
    );
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Depreciation Run"
        description="Preview and post periodic depreciation for all active assets."
        breadcrumbs={[{ label: 'Fixed Assets', href: '/fa' }, { label: 'Depreciation Run' }]}
      />

      {/* Controls */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[180px]">
              <DateInput label="Period End Date" required value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPreviewing(false); setRunResult(null); }} />
            </div>
            <div className="min-w-[200px]">
              <Combobox label="Depreciation Type" options={DEP_TYPE_OPTIONS} value={depType} onChange={(v) => { setDepType(v); setPreviewing(false); setRunResult(null); }} />
            </div>
            <Button variant="outline" size="sm" onClick={handlePreview} disabled={!periodEnd}>
              Preview
            </Button>
            {previewing && previewLines.length > 0 && !runResult && (
              <Button variant="primary" size="sm" onClick={handlePost} loading={runMutation.isPending}>
                <Play size={14} /> Post Depreciation
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Run result banner */}
      {runResult && (
        <Card className="mb-6 border-green-200 dark:border-green-800">
          <CardHeader title="Depreciation Posted" />
          <CardContent>
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Entries Created</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{runResult.entriesCreated}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Depreciation</p>
                <p className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{formatINR(runResult.totalDepreciation)}</p>
              </div>
              {runResult.journalEntryId && (
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Journal Entry</p>
                  <Link
                    to={`/gl/journal-entries/${runResult.journalEntryId}` as '/'}
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View JE <ExternalLink size={12} />
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview table */}
      {previewing && (
        <>
          {isPreviewError && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">Failed to load preview. Check that assets exist for this period.</p>
          )}

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {isLoadingPreview ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
              ))
            ) : previewLines.map((line) => (
              <div key={line.assetId} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{line.assetName}</span>
                  <Badge variant="default" className="uppercase text-xs">{line.method}</Badge>
                </div>
                <p className="font-mono text-xs text-zinc-400 mt-0.5">{line.assetCode}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <div><span className="block font-medium">Opening WDV</span>{formatINR(line.openingWdv)}</div>
                  <div><span className="block font-medium">Dep Amount</span><span className="text-red-600 dark:text-red-400">{formatINR(line.depreciationAmount)}</span></div>
                  <div><span className="block font-medium">Closing WDV</span>{formatINR(line.closingWdv)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <tr>
                  <Th>Asset Code</Th>
                  <Th>Name</Th>
                  <Th>Method</Th>
                  <Th align="right">Rate %</Th>
                  <Th align="right">Opening WDV</Th>
                  <Th align="right">Depreciation</Th>
                  <Th align="right">Closing WDV</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoadingPreview ? (
                  <TableSkeleton rows={5} cols={7} />
                ) : (
                  <>
                    {previewLines.map((line) => (
                      <TableRow key={line.assetId}>
                        <TableCell className="font-mono text-xs text-zinc-500">{line.assetCode}</TableCell>
                        <TableCell className="font-medium">{line.assetName}</TableCell>
                        <TableCell className="uppercase text-xs text-zinc-500 dark:text-zinc-400">{line.method}</TableCell>
                        <TableCell align="right" numeric>{line.rate}%</TableCell>
                        <TableCell align="right" numeric>{formatINR(line.openingWdv)}</TableCell>
                        <TableCell align="right" numeric className="text-red-600 dark:text-red-400">{formatINR(line.depreciationAmount)}</TableCell>
                        <TableCell align="right" numeric>{formatINR(line.closingWdv)}</TableCell>
                      </TableRow>
                    ))}
                    {previewLines.length > 0 && (
                      <TableRow className="border-t-2 border-zinc-300 dark:border-zinc-600 font-semibold bg-zinc-50 dark:bg-zinc-800/50">
                        <TableCell colSpan={5} className="text-right text-sm text-zinc-700 dark:text-zinc-300">Total</TableCell>
                        <TableCell align="right" numeric className="text-red-600 dark:text-red-400">{formatINR(totalDep)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          {!isLoadingPreview && previewLines.length === 0 && !isPreviewError && (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">No eligible assets found for this period and depreciation type.</p>
          )}
        </>
      )}
    </div>
  );
}

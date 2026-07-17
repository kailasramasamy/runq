import { useState, useEffect } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Copy, Power, Eye, Download } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Badge, Modal, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import { useRateCharts, useRateChart, useDeactivateRateChart, useNodes, milkTypeLabel } from '@/hooks/queries/use-milk-procurement';
import { sharePdf } from '@/lib/share-pdf';
import { RateChartAssignmentsCard } from './_rate-chart-assignments-card';
import { SELECTABLE_MILK_TYPES } from './_node-shared';

/** Fetch the rate-chart PDF and share/download it. */
function downloadRateChartPdf(id: string, name: string): Promise<void> {
  const slug = name.replace(/[^\w.\-]/g, '-');
  return sharePdf({
    path: `/milk-procurement/rate-charts/${id}/print`,
    params: {},
    filename: `rate-chart-${slug}.pdf`,
    title: `Rate chart — ${name}`,
  });
}

export function MpRateChartsPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { view?: string };
  const [viewId, setViewId] = useState<string | null>(search.view ?? null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  // deep-link: open a chart's detail when arriving with ?view=<id>
  useEffect(() => { if (search.view) setViewId(search.view); }, [search.view]);
  const { data, isLoading } = useRateCharts({ limit: 200 });
  const { data: nodesData } = useNodes({ limit: 300 });
  const deactivate = useDeactivateRateChart();
  const { toast } = useToast();
  const charts = data?.data ?? [];
  const scopeLabel = (id: string | null) =>
    id ? ((nodesData?.data ?? []).find((n) => n.id === id)?.name ?? 'VMCC') : 'Tenant-wide';

  return (
    <div>
      <PageHeader
        title="Rate charts"
        description="FAT/SNF matrix, CLR breakpoints, or flat per-litre rates, effective-dated. Supersede by creating a new chart."
        fullWidth
        actions={<Button onClick={() => navigate({ to: '/milk-procurement/rate-charts/new' })}><Plus className="h-4 w-4" />Add rate chart</Button>}
      />

      {/* The default per milk type. Everything inherits this unless a CC, VMCC
          or farmer overrides it — so it's the one place to look when asking
          "what are we paying for A2?". */}
      <div className="mb-4">
        <RateChartAssignmentsCard
          scopeType="tenant"
          milkTypes={SELECTABLE_MILK_TYPES}
          title="Default rate charts"
          subtitle="What each milk type is priced with when nothing more specific applies. A CC, VMCC or farmer can override any of these."
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <Th>Name</Th><Th>Milk</Th><Th>Scope</Th><Th>Mode</Th><Th>Effective from</Th><Th>Status</Th><Th align="right">Actions</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : charts.length === 0 ? (
                <TableEmpty colSpan={7} message="No rate charts yet." />
              ) : (
                charts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{milkTypeLabel(c.milkType)}</TableCell>
                    <TableCell className="text-zinc-500">{scopeLabel(c.scopeNodeId)}</TableCell>
                    <TableCell>
                      {c.pricingMode === 'flat' ? `Flat ₹${c.flatRatePerLitre}/L`
                        : c.pricingMode === 'clr' ? 'CLR (lactometer)'
                        : 'Matrix'}
                    </TableCell>
                    <TableCell>{c.effectiveFrom}</TableCell>
                    <TableCell>{c.isActive ? <Badge variant="success">Active</Badge> : <Badge>Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setViewId(c.id)} title="View"><Eye className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Download PDF"
                        onClick={() => downloadRateChartPdf(c.id, c.name).catch(() => toast('Failed to download PDF', 'error'))}
                      ><Download className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/milk-procurement/rate-charts/new', search: { from: c.id } })} title="Duplicate (supersede)"><Copy className="h-4 w-4" /></Button>
                      {c.isActive && (
                        <Button variant="ghost" size="sm" onClick={() => setDeactivateId(c.id)} title="Deactivate"><Power className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {viewId && <ViewRateChart id={viewId} onClose={() => setViewId(null)} />}

      <ConfirmationDialog
        open={!!deactivateId}
        title="Deactivate rate chart?"
        description="It stops being used for new pours. Past pours keep their snapshotted rate."
        confirmLabel="Deactivate"
        variant="danger"
        loading={deactivate.isPending}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => {
          if (!deactivateId) return;
          deactivate.mutate(deactivateId, {
            onSuccess: () => { toast('Rate chart deactivated', 'success'); setDeactivateId(null); },
            onError: () => toast('Failed to deactivate', 'error'),
          });
        }}
      />
    </div>
  );
}

/** Read-only view — header meta, the FAT×SNF grid (or flat rate), and rules. */
function ViewRateChart({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useRateChart(id);
  const { data: nodesData } = useNodes({ limit: 300 });
  const { toast } = useToast();
  const chart = data?.data;
  const scope = chart?.scopeNodeId
    ? ((nodesData?.data ?? []).find((n) => n.id === chart.scopeNodeId)?.name ?? 'VMCC')
    : 'Tenant-wide';
  return (
    <Modal open onClose={onClose} title={chart ? chart.name : 'Rate chart'} wide>
      {isLoading || !chart ? (
        <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <Meta label="Milk" value={milkTypeLabel(chart.milkType)} />
            <Meta label="Scope" value={scope} />
            <Meta label="Mode" value={chart.pricingMode} />
            <Meta label="Effective" value={`${chart.effectiveFrom}${chart.effectiveTo ? ` → ${chart.effectiveTo}` : ''}`} />
            <Meta label="Status" value={chart.isActive ? 'Active' : 'Inactive'} />
          </div>

          {chart.pricingMode === 'flat' ? (
            <div className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800/40">
              Flat rate: <span className="font-semibold">₹{chart.flatRatePerLitre}/L</span>
            </div>
          ) : chart.pricingMode === 'clr' ? (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">CLR breakpoints (₹/L) — highest matching row wins</div>
              <ClrTable cells={chart.cells} />
            </div>
          ) : (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">Rate matrix (₹/L) · FAT down, SNF across</div>
              <MatrixGrid cells={chart.cells} />
            </div>
          )}

          {chart.rules.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">Bonuses &amp; slabs</div>
              <ul className="space-y-1 text-sm">
                {chart.rules.map((r) => (
                  <li key={r.id} className="text-zinc-700 dark:text-zinc-300">
                    {r.ruleType === 'quality_bonus'
                      ? `Grade ${r.grade?.toUpperCase()} quality bonus: +₹${r.bonusPerLitre}/L`
                      : `Volume slab ${r.minQty ?? '0'}–${r.maxQty ?? '∞'} L: +₹${r.bonusPerLitre}/L`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => downloadRateChartPdf(chart.id, chart.name).catch(() => toast('Failed to download PDF', 'error'))}>
              <Download className="h-4 w-4" />Download PDF
            </Button>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ClrTable({ cells }: { cells: { clr: string | null; ratePerLitre: string }[] }) {
  const rows = cells
    .filter((c) => c.clr != null)
    .sort((a, b) => Number(a.clr) - Number(b.clr));
  if (!rows.length) return <p className="text-sm text-zinc-500">No CLR breakpoints.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-800/50">
          <tr>
            <th className="px-3 py-1.5 text-left text-xs font-medium text-zinc-500">CLR (min)</th>
            <th className="px-3 py-1.5 text-right text-xs font-medium text-zinc-500">₹ / litre</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="px-3 py-1.5 tabular-nums">{r.clr}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{r.ratePerLitre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixGrid({ cells }: { cells: { fat: string | null; snf: string | null; ratePerLitre: string }[] }) {
  const matrixCells = cells.filter((c) => c.fat != null && c.snf != null) as { fat: string; snf: string; ratePerLitre: string }[];
  const fats = [...new Set(matrixCells.map((c) => c.fat))].sort((a, b) => Number(a) - Number(b));
  const snfs = [...new Set(matrixCells.map((c) => c.snf))].sort((a, b) => Number(a) - Number(b));
  const rateAt = (fat: string, snf: string) => matrixCells.find((c) => c.fat === fat && c.snf === snf)?.ratePerLitre;
  if (!matrixCells.length) return <p className="text-sm text-zinc-500">No cells.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-800/50">
          <tr>
            <th className="px-3 py-1.5 text-left text-xs font-medium text-zinc-500">FAT \ SNF</th>
            {snfs.map((s) => <th key={s} className="px-3 py-1.5 text-right text-xs font-medium text-zinc-500 tabular-nums">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {fats.map((fat) => (
            <tr key={fat} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="px-3 py-1.5 font-medium tabular-nums">{fat}</td>
              {snfs.map((s) => (
                <td key={s} className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{rateAt(fat, s) ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-medium text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

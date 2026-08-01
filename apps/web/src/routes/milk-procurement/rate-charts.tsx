import { useState, useEffect } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Copy, Power, Eye, Download } from 'lucide-react';
import {
  PageHeader, Card, CardContent, Button, Badge, Modal, ConfirmationDialog,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, TableEmpty, TableSkeleton, useToast,
} from '@/components/ui';
import { Tabs } from '@/components/ar/primitives';
import { useRateCharts, useRateChart, useDeactivateRateChart, useNodes, milkTypeLabel } from '@/hooks/queries/use-milk-procurement';
import type { MpRateRule, MpRateChartDetail } from '@/hooks/queries/use-milk-procurement';
import { sharePdf } from '@/lib/share-pdf';
import { downloadCSV } from '@/lib/csv-export';
import { RateChartAssignmentsCard } from './_rate-chart-assignments-card';
import { SELECTABLE_MILK_TYPES } from './_node-shared';

const TABS = [
  { id: 'charts', label: 'Charts' },
  { id: 'defaults', label: 'Tenant defaults' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Export a chart as CSV. One row per FAT (or CLR) breakpoint, with the daily
 * base rate, the quarterly bonus its tier pays, and the all-in total — the same
 * three numbers the printed chart shows, so the file and the paper agree.
 */
function exportRateChartCsv(chart: MpRateChartDetail): void {
  const slug = chart.name.replace(/[^\w.\-]/g, '-');
  const tiers = chart.rules
    .filter((r) => r.ruleType === 'quarterly_fat_bonus' && r.fatMin != null)
    .sort((a, b) => Number(b.fatMin) - Number(a.fatMin));
  const bonusAt = (fat: number) =>
    Number(tiers.find((t) => fat >= Number(t.fatMin))?.bonusPerLitre ?? 0);

  if (chart.pricingMode === 'clr') {
    const rows = chart.cells.filter((c) => c.clr != null)
      .sort((a, b) => Number(a.clr) - Number(b.clr))
      .map((c) => [Number(c.clr).toFixed(1), Number(c.ratePerLitre).toFixed(2)]);
    downloadCSV(`rate-chart-${slug}.csv`, ['CLR', 'Rate per L'], rows);
    return;
  }
  if (chart.pricingMode === 'flat') {
    downloadCSV(`rate-chart-${slug}.csv`, ['Flat rate per L'],
      [[Number(chart.flatRatePerLitre ?? 0).toFixed(2)]]);
    return;
  }

  const snfs = [...new Set(chart.cells.map((c) => Number(c.snf)))].sort((a, b) => a - b);
  const fats = [...new Set(chart.cells.map((c) => Number(c.fat)))].sort((a, b) => a - b);
  const rateAt = (fat: number, snf: number) => {
    const c = chart.cells.find((x) => Number(x.fat) === fat && Number(x.snf) === snf);
    return c ? Number(c.ratePerLitre).toFixed(2) : '';
  };
  // A FAT-only chart (single SNF-0 row) exports one rate column, not a grid of
  // identical ones.
  const fatOnly = snfs.length === 1 && snfs[0] === 0;
  const snfCol = chart.referenceSnf != null ? Number(chart.referenceSnf).toFixed(1) : null;
  const headers = fatOnly
    ? ['FAT', ...(snfCol ? ['Min SNF'] : []),
       'Base rate per L (paid daily)', 'Quarterly bonus per L', 'ALL-IN per L']
    : ['FAT', ...snfs.map((s) => `SNF ${s.toFixed(1)}`)];
  // The 0.00 floor row is a capture guard, not a published rate — leave it out.
  const shown = fatOnly ? fats.filter((f) => f > 0) : fats;
  const rows = shown.map((f, i) => {
    if (!fatOnly) return [f.toFixed(2), ...snfs.map((s) => rateAt(f, s))];
    const base = Number(rateAt(f, 0) || 0), b = bonusAt(f);
    // Top row is the cap — nearest-floor pays it for anything richer.
    const label = i === shown.length - 1 ? `${f.toFixed(2)} and above` : f.toFixed(2);
    return [label, ...(snfCol ? [snfCol] : []),
            base.toFixed(2), b.toFixed(2), (base + b).toFixed(2)];
  });
  downloadCSV(`rate-chart-${slug}.csv`, headers, rows);
}

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
  /** Server's reason when deactivating would strand a scope — shown, then forced past. */
  const [strandWarning, setStrandWarning] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('charts');
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

      <Tabs active={tab} onChange={setTab} tabs={TABS as unknown as { id: TabId; label: string }[]} />

      {tab === 'charts' && (
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
      )}

      {/* The default per milk type. Everything inherits this unless a CC, VMCC
          or farmer overrides it — so it's the one place to look when asking
          "what are we paying for A2?". */}
      {tab === 'defaults' && (
        <RateChartAssignmentsCard
          scopeType="tenant"
          milkTypes={SELECTABLE_MILK_TYPES}
          title="Default rate charts"
          subtitle="What each milk type is priced with when nothing more specific applies. A CC, VMCC or farmer can override any of these."
        />
      )}

      {viewId && <ViewRateChart id={viewId} onClose={() => setViewId(null)} />}

      <ConfirmationDialog
        open={!!deactivateId}
        title={strandWarning ? 'This leaves milk unpriced' : 'Deactivate rate chart?'}
        description={strandWarning
          ? `${strandWarning} Deactivating anyway means pours will fail until another chart covers them.`
          : 'It stops being used for new pours. Past pours keep their snapshotted rate.'}
        confirmLabel={strandWarning ? 'Deactivate anyway' : 'Deactivate'}
        variant="danger"
        loading={deactivate.isPending}
        onClose={() => { setDeactivateId(null); setStrandWarning(null); }}
        onConfirm={() => {
          if (!deactivateId) return;
          // First press asks the server; if it refuses because the chart is still
          // pricing someone, show who and let the second press force it through.
          deactivate.mutate({ id: deactivateId, force: !!strandWarning }, {
            onSuccess: () => {
              toast('Rate chart deactivated', 'success');
              setDeactivateId(null);
              setStrandWarning(null);
            },
            onError: (e) => {
              const msg = e instanceof Error ? e.message : '';
              if (msg.includes('leaves')) setStrandWarning(msg);
              else toast(msg || 'Failed to deactivate', 'error');
            },
          });
        }}
      />
    </div>
  );
}

/** A FAT-only chart: every cell sits at SNF 0, so SNF never moves the rate. */
function isFatOnly(cells: { snf: string | null }[]): boolean {
  return cells.length > 0 && cells.every((c) => Number(c.snf) === 0);
}

/** The quarterly bonus a pour's FAT earns — mirrors the server's tier lookup. */
function bonusForFat(rules: MpRateRule[], fat: number): number {
  const t = rules
    .filter((r) => r.ruleType === 'quarterly_fat_bonus' && r.fatMin != null)
    .sort((a, b) => Number(b.fatMin) - Number(a.fatMin))
    .find((r) => fat >= Number(r.fatMin));
  return Number(t?.bonusPerLitre ?? 0);
}

/**
 * FAT-only chart as the row-per-FAT table farmers actually read: the daily rate,
 * the quarterly bonus that FAT earns, and the all-in total.
 *
 * The SNF column shows the chart's reference standard on every row. It is
 * display only — cells sit at SNF 0 and nothing here is priced on, which is why
 * the caption says so out loud rather than leaving it to be inferred.
 */
function FatOnlyTable({ chart }: { chart: MpRateChartDetail }) {
  const rows = chart.cells
    .filter((c) => Number(c.fat) > 0)
    .sort((a, b) => Number(a.fat) - Number(b.fat));
  const hasTiers = chart.rules.some((r) => r.ruleType === 'quarterly_fat_bonus');
  const floor = chart.cells.find((c) => Number(c.fat) === 0);
  return (
    <div className="max-h-[440px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
          <tr className="text-xs font-medium text-zinc-500">
            <th className="px-2 py-1 text-left">FAT %</th>
            {chart.referenceSnf != null && <th className="px-2 py-1 text-right">Min SNF</th>}
            <th className="px-2 py-1 text-right">Rate ₹/L</th>
            {hasTiers && <th className="px-2 py-1 text-right">Quarterly bonus ₹/L</th>}
            {hasTiers && <th className="px-2 py-1 text-right">All-in ₹/L</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const fat = Number(c.fat), base = Number(c.ratePerLitre), b = bonusForFat(chart.rules, fat);
            // Nearest-floor leaves the top row unbounded: any richer reading
            // matches it, so it is the cap and should read as one.
            const isCap = i === rows.length - 1;
            return (
              <tr key={c.id} className="border-t border-zinc-100 tabular-nums dark:border-zinc-800">
                <td className="px-2 py-1">{isCap ? `${fat.toFixed(1)} and above` : fat.toFixed(1)}</td>
                {chart.referenceSnf != null && (
                  <td className="px-2 py-1 text-right text-zinc-500">{Number(chart.referenceSnf).toFixed(1)}</td>
                )}
                <td className="px-2 py-1 text-right">{base.toFixed(2)}</td>
                {hasTiers && <td className="px-2 py-1 text-right text-zinc-500">{b ? b.toFixed(2) : '—'}</td>}
                {hasTiers && <td className="px-2 py-1 text-right font-medium">{(base + b).toFixed(2)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 px-2 text-xs text-zinc-500 dark:text-zinc-400">
        Rate is set by FAT alone.
        {chart.referenceSnf != null && ' The SNF column is the standard we expect — it is shown for reference and does not change the rate.'}
        {rows.length > 0 && ` The rate is capped at ${Number(rows[rows.length - 1]!.fat).toFixed(1)} FAT.`}
        {floor && rows[0] && ` Below ${Number(rows[0].fat).toFixed(1)} FAT the rate drops to ₹${Number(floor.ratePerLitre).toFixed(2)}/L.`}
      </p>
    </div>
  );
}

/** Rules that price a pour. The quarterly tier settles separately, so it gets
 *  its own section instead of being mislabelled as a volume slab. */
function perPourRules(rules: MpRateRule[]): MpRateRule[] {
  return rules.filter((r) => r.ruleType !== 'quarterly_fat_bonus');
}

/**
 * Quarterly FAT bonus tiers, shown as RANGES. A row reading "3.80 → ₹6.00"
 * invites an argument from every farmer who measures 3.79, so each tier's upper
 * bound is the next tier's floor less 0.01.
 */
function QuarterlyTiers({ rules, snfGateMin }: { rules: MpRateRule[]; snfGateMin: string | null }) {
  const tiers = rules
    .filter((r) => r.ruleType === 'quarterly_fat_bonus' && r.fatMin != null)
    .sort((a, b) => Number(b.fatMin) - Number(a.fatMin));
  if (tiers.length === 0) return null;
  const floor = Number(tiers[tiers.length - 1]!.fatMin).toFixed(2);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-500">
        Quarterly bonus · paid as one lump sum after each quarter
      </div>
      <ul className="space-y-1 text-sm">
        {tiers.map((t, i) => (
          <li key={t.id} className="flex justify-between text-zinc-700 dark:text-zinc-300">
            <span>
              {i === 0
                ? `${Number(t.fatMin).toFixed(2)} FAT and above`
                : `${Number(t.fatMin).toFixed(2)} – ${(Number(tiers[i - 1]!.fatMin) - 0.01).toFixed(2)} FAT`}
            </span>
            <span className="tabular-nums font-medium">₹{t.bonusPerLitre}/L</span>
          </li>
        ))}
        <li className="flex justify-between text-zinc-500">
          <span>below {floor} FAT</span>
          <span className="tabular-nums">—</span>
        </li>
      </ul>
      <p className="mt-2 text-xs text-zinc-500">
        Each pour earns its own bonus from its own FAT, banked at capture and paid as one amount
        after the quarter ends. A rejected pour earns nothing; the rest of the farmer&apos;s milk is
        unaffected.
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {snfGateMin != null
          ? `Anti-dilution: SNF below ${Number(snfGateMin).toFixed(2)} prices down the sub-3.5 taper and forfeits the bonus.`
          : 'Anti-dilution SNF floor is not set — the gate is off for this chart.'}
      </p>
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
          ) : isFatOnly(chart.cells) ? (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">Rate per litre · priced on FAT</div>
              <FatOnlyTable chart={chart} />
            </div>
          ) : (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">Rate matrix (₹/L) · FAT down, SNF across</div>
              <MatrixGrid cells={chart.cells} />
            </div>
          )}

          {perPourRules(chart.rules).length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">Bonuses &amp; slabs</div>
              <ul className="space-y-1 text-sm">
                {perPourRules(chart.rules).map((r) => (
                  <li key={r.id} className="text-zinc-700 dark:text-zinc-300">
                    {r.ruleType === 'quality_bonus'
                      ? `Grade ${r.grade?.toUpperCase()} quality bonus: +₹${r.bonusPerLitre}/L`
                      : `Volume slab ${r.minQty ?? '0'}–${r.maxQty ?? '∞'} L: +₹${r.bonusPerLitre}/L`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <QuarterlyTiers rules={chart.rules} snfGateMin={chart.snfGateMin} />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => exportRateChartCsv(chart)}>
              <Download className="h-4 w-4" />Export CSV
            </Button>
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

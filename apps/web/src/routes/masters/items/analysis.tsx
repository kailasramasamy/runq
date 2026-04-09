import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Calculator, Save, Sparkles, AlertTriangle, Plus } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Modal,
  useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useItem, useUpdateItem, type CogmComponent } from '@/hooks/queries/use-items';
import {
  calculatePricing,
  calculateServicePricing,
  solveMrpForTargetMargin,
  solveBreakevenMrp,
  roundUpToPsychologicalPrice,
  sumCogmBreakdown,
} from '@/lib/item-pricing';
import { CogmBreakdownCard } from './cogm-breakdown-card';

const VOLUME_TIERS = [100, 1_000, 10_000, 100_000];

export function ItemAnalysisPage({
  itemId,
  from,
}: {
  itemId: string;
  from?: 'list' | 'edit';
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data, isLoading } = useItem(itemId);

  const goBack = () => {
    if (from === 'edit') {
      navigate({ to: '/masters/items/$itemId/edit', params: { itemId } });
    } else {
      navigate({ to: '/masters/items' });
    }
  };
  const backLabel = from === 'edit' ? 'Back to Edit' : 'Back to Items';
  const update = useUpdateItem();
  const item = data?.data;

  // Knobs — initialised from the saved item once it loads.
  // Product path uses: cogm, gstRate, sellerMargin, mrp, scheme, freight.
  // Service path uses: cogm, gstRate, servicePrice.
  // Both share the cost breakdown and gstRate state.
  const [cogm, setCogm] = useState('');
  const [gstRate, setGstRate] = useState('5');
  const [sellerMargin, setSellerMargin] = useState('20');
  const [mrp, setMrp] = useState('');
  const [scheme, setScheme] = useState('0');
  const [freight, setFreight] = useState('0');
  const [targetMargin, setTargetMargin] = useState('10');
  const [servicePrice, setServicePrice] = useState('');
  const [breakdown, setBreakdown] = useState<CogmComponent[]>([]);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const isService = item?.type === 'service';

  useEffect(() => {
    if (!item) return;
    setCogm(item.costPrice?.toString() ?? '');
    setGstRate(item.gstRate?.toString() ?? (item.type === 'service' ? '18' : '5'));
    setSellerMargin(item.margin?.toString() ?? '20');
    setMrp(item.mrp?.toString() ?? '');
    setServicePrice(item.defaultSellingPrice?.toString() ?? '');
    setBreakdown(item.cogmBreakdown ?? []);
  }, [item]);

  // COGM is always derived from the breakdown — single source of truth.
  // The COGM input is permanently disabled; the only way to change it is to
  // open the breakdown dialog. Empty breakdown = COGM 0, with a clear CTA.
  const breakdownTotal = useMemo(() => sumCogmBreakdown(breakdown), [breakdown]);
  const effectiveCogm = breakdownTotal;

  useEffect(() => {
    setCogm(breakdownTotal ? breakdownTotal.toString() : '');
  }, [breakdownTotal]);

  function addBreakdownRow(label = '') {
    setBreakdown((prev) => [...prev, { label, amount: 0 }]);
  }
  function updateBreakdownRow(i: number, patch: Partial<CogmComponent>) {
    setBreakdown((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeBreakdownRow(i: number) {
    setBreakdown((prev) => prev.filter((_, idx) => idx !== i));
  }

  const result = useMemo(
    () =>
      calculatePricing({
        mrp: Number(mrp) || 0,
        sellerMarginPct: Number(sellerMargin) || 0,
        gstRatePct: Number(gstRate) || 0,
        cogm: effectiveCogm,
        schemePct: Number(scheme) || 0,
        freightPct: Number(freight) || 0,
      }),
    [mrp, sellerMargin, gstRate, effectiveCogm, scheme, freight],
  );

  // Service pricing result — simpler math, used only when item.type === 'service'.
  const serviceResult = useMemo(
    () =>
      calculateServicePricing({
        sellingPrice: Number(servicePrice) || 0,
        cost: effectiveCogm,
        gstRatePct: Number(gstRate) || 0,
      }),
    [servicePrice, effectiveCogm, gstRate],
  );

  const solvedMrp = useMemo(() => {
    const t = Number(targetMargin);
    if (!effectiveCogm || isNaN(t)) return null;
    return solveMrpForTargetMargin(
      effectiveCogm,
      Number(sellerMargin) || 0,
      Number(gstRate) || 0,
      t,
      Number(scheme) || 0,
      Number(freight) || 0,
    );
  }, [effectiveCogm, sellerMargin, gstRate, targetMargin, scheme, freight]);

  const breakeven = useMemo(() => {
    if (!effectiveCogm) return null;
    return solveBreakevenMrp(
      effectiveCogm,
      Number(sellerMargin) || 0,
      Number(gstRate) || 0,
      Number(scheme) || 0,
      Number(freight) || 0,
    );
  }, [effectiveCogm, sellerMargin, gstRate, scheme, freight]);

  const isLoss = result.profitPerUnit < 0;
  const lowMargin = !isLoss && result.netMarginPct < 5;

  async function handleSaveToItem() {
    if (!item) return;
    try {
      // Strip empty/zero rows before persisting so a half-edited row doesn't
      // pollute the saved breakdown.
      const cleanBreakdown = breakdown
        .filter((r) => r.label.trim() && Number(r.amount) > 0)
        .map((r) => ({ label: r.label.trim(), amount: Number(r.amount), ...(r.note ? { note: r.note } : {}) }));

      // Treat empty string as null, but preserve "0" — GST can legitimately
      // be 0% for exempt items, and `Number('0') || null` would corrupt it.
      const numOrNull = (v: string): number | null => {
        if (v === '' || v.trim() === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      // Services persist a simpler slice of the pricing fields: no MRP, no
      // seller margin, no landing price derived from a chain — just cost,
      // GST, and selling price. MRP/margin are explicitly nulled so an
      // item flipped from product → service leaves no stale values.
      const data = isService
        ? {
            costPrice: effectiveCogm || null,
            gstRate: numOrNull(gstRate),
            defaultSellingPrice: numOrNull(servicePrice),
            basicPrice: serviceResult.basicPrice || null,
            gstValue: serviceResult.gstValue || null,
            mrp: null,
            margin: null,
            cogmBreakdown: cleanBreakdown.length > 0 ? cleanBreakdown : null,
          }
        : {
            costPrice: effectiveCogm || null,
            gstRate: numOrNull(gstRate),
            margin: numOrNull(sellerMargin),
            mrp: numOrNull(mrp),
            basicPrice: result.basicPrice || null,
            gstValue: result.gstValue || null,
            defaultSellingPrice: result.landingPrice || null,
            cogmBreakdown: cleanBreakdown.length > 0 ? cleanBreakdown : null,
          };

      await update.mutateAsync({ id: item.id, data });
      toast('Saved to item master', 'success');
    } catch {
      toast('Failed to save', 'error');
    }
  }

  function applySolved() {
    if (solvedMrp == null) return;
    setMrp(roundUpToPsychologicalPrice(solvedMrp).toString());
  }

  const isLossService = serviceResult.profitPerUnit < 0;
  const lowMarginService = !isLossService && serviceResult.netMarginPct < 5;

  if (isLoading || !item) {
    return (
      <div className="max-w-6xl">
        <PageHeader
          title="Cost & Profit Analysis"
          breadcrumbs={[{ label: 'Masters' }, { label: 'Items', href: '/masters/items' }, { label: 'Analysis' }]}
        />
        <Card><CardContent className="p-8 text-center text-zinc-400">Loading…</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title={isService ? `Service Pricing — ${item.name}` : `Cost & Profit Analysis — ${item.name}`}
        breadcrumbs={[
          { label: 'Masters' },
          { label: 'Items', href: '/masters/items' },
          { label: item.name },
          { label: 'Analysis' },
        ]}
        description={(() => {
          const brand = item.attributes?.brand as string | undefined;
          return `${brand ? brand + ' · ' : ''}${item.unit ?? ''}${item.ean ? ' · EAN ' + item.ean : ''}`;
        })()}
        actions={
          <Button variant="outline" size="sm" onClick={goBack}>
            <ArrowLeft size={14} /> {backLabel}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── KNOBS ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader title={isService ? 'Inputs — selling price, cost & GST' : 'Inputs — adjust any value to recalculate live'} />
          <CardContent className="space-y-4">
            {/* Cost is always derived from the breakdown — single source of truth.
                The input is disabled; clicking the button below opens the dialog. */}
            <div>
              <Input
                label="Cost Price (₹)"
                type="number"
                step="0.01"
                value={cogm}
                onChange={() => undefined}
                disabled
                helper={
                  breakdown.length > 0
                    ? `Sum of ${breakdown.length} component${breakdown.length === 1 ? '' : 's'} — click below to edit`
                    : 'No breakdown yet — click below to start'
                }
              />
              <Button
                type="button"
                size="sm"
                variant={breakdown.length === 0 ? 'primary' : 'outline'}
                onClick={() => setBreakdownOpen(true)}
                className="mt-2 w-full"
              >
                {breakdown.length === 0 ? (
                  <>
                    <Plus size={14} /> Build Cost
                  </>
                ) : (
                  <>
                    <Calculator size={14} /> Edit breakdown ({breakdown.length} component{breakdown.length === 1 ? '' : 's'})
                  </>
                )}
              </Button>
            </div>

            {isService ? (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="GST Rate (%)"
                  type="number"
                  step="0.01"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  helper="0, 5, 12, 18, or 28"
                />
                <Input
                  label="Selling Price (₹)"
                  type="number"
                  step="0.01"
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  helper={`What you charge per ${item.unit || 'unit'} (incl GST)`}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="GST Rate (%)"
                  type="number"
                  step="0.01"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  helper="0, 5, 12, 18, or 28"
                />
                <Input
                  label="Seller Margin (% off MRP)"
                  type="number"
                  step="0.01"
                  value={sellerMargin}
                  onChange={(e) => setSellerMargin(e.target.value)}
                  helper="What the retailer earns"
                />
                <Input
                  label="MRP (₹)"
                  type="number"
                  step="0.01"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  helper="Consumer printed price"
                />
                <Input
                  label="Trade Scheme (% off basic)"
                  type="number"
                  step="0.01"
                  value={scheme}
                  onChange={(e) => setScheme(e.target.value)}
                  helper="Promo discount you give the seller"
                />
                <Input
                  label="Freight & Damages (% on cost)"
                  type="number"
                  step="0.01"
                  value={freight}
                  onChange={(e) => setFreight(e.target.value)}
                  helper="Logistics + RTV leakage"
                />
              </div>
            )}
            <div className="flex gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <Button size="sm" onClick={handleSaveToItem} loading={update.isPending}>
                <Save size={14} /> Save to Item
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── BREAKDOWN ────────────────────────────────────────── */}
        <Card>
          <CardHeader title="Per-unit Breakdown" />
          <CardContent>
            {isService ? (
              <>
                <Table>
                  <Row label="Selling Price (incl GST)" value={servicePrice ? formatINR(Number(servicePrice)) : '—'} emphasized hint={`Per ${item.unit || 'unit'}`} />
                  <Row label="GST Value" value={`(${formatINR(serviceResult.gstValue)})`} muted hint={`GST ${gstRate}% — collected for govt`} />
                  <Row label="Basic Price (excl GST)" value={formatINR(serviceResult.basicPrice)} hint="Your taxable invoice value" emphasized />
                  <Divider />
                  <Row label="Cost" value={`(${formatINR(Number(cogm) || 0)})`} muted hint="Labour + overhead per unit" />
                  <Divider />
                  <Row
                    label="Profit per unit"
                    value={formatINR(serviceResult.profitPerUnit)}
                    emphasized
                    tone={isLossService ? 'red' : lowMarginService ? 'amber' : 'emerald'}
                  />
                  <Row
                    label="Net margin %"
                    value={`${serviceResult.netMarginPct.toFixed(2)}%`}
                    tone={isLossService ? 'red' : lowMarginService ? 'amber' : 'emerald'}
                  />
                  <Row
                    label="Markup on cost %"
                    value={`${serviceResult.markupOnCostPct.toFixed(2)}%`}
                    muted
                  />
                </Table>
                {isLossService && (
                  <Alert tone="red">
                    You're losing {formatINR(Math.abs(serviceResult.profitPerUnit))} per unit at this price. Raise the selling price or reduce the cost.
                  </Alert>
                )}
                {lowMarginService && (
                  <Alert tone="amber">
                    Net margin is below 5%. After discounts and overheads, this leaves little real profit.
                  </Alert>
                )}
              </>
            ) : (
              <>
                <Table>
                  <Row label="MRP (consumer price)" value={mrp ? formatINR(Number(mrp)) : '—'} muted />
                  <Row label="Seller earnings" value={formatINR(result.sellerEarningsPerUnit)} muted hint={`${sellerMargin}% off MRP`} />
                  <Divider />
                  <Row label="Landing Price (incl GST)" value={formatINR(result.landingPrice)} hint="What you invoice the seller" emphasized />
                  <Row label="GST Value" value={`(${formatINR(result.gstValue)})`} muted hint={`GST ${gstRate}% — collected on behalf of govt`} />
                  <Row label="Basic Price (excl GST)" value={formatINR(result.basicPrice)} hint="Your taxable invoice value" emphasized />
                  {Number(scheme) > 0 && (
                    <Row label="Effective Basic Price (after scheme)" value={formatINR(result.effectiveBasicPrice)} hint={`After ${scheme}% trade scheme`} />
                  )}
                  <Divider />
                  <Row label="Cost" value={`(${formatINR(Number(cogm) || 0)})`} muted />
                  {Number(freight) > 0 && (
                    <Row label="Effective Cost (with freight/damages)" value={`(${formatINR(result.effectiveCogm)})`} muted hint={`+${freight}% leakage`} />
                  )}
                  <Divider />
                  <Row
                    label="Profit per unit"
                    value={formatINR(result.profitPerUnit)}
                    emphasized
                    tone={isLoss ? 'red' : lowMargin ? 'amber' : 'emerald'}
                  />
                  <Row
                    label="Net margin %"
                    value={`${result.netMarginPct.toFixed(2)}%`}
                    tone={isLoss ? 'red' : lowMargin ? 'amber' : 'emerald'}
                  />
                  <Row
                    label="Markup on cost %"
                    value={`${result.markupOnCostPct.toFixed(2)}%`}
                    muted
                  />
                </Table>
                {isLoss && (
                  <Alert tone="red">
                    You're losing {formatINR(Math.abs(result.profitPerUnit))} per unit at this price. Either raise MRP, drop seller margin, or cut the cost.
                  </Alert>
                )}
                {lowMargin && (
                  <Alert tone="amber">
                    Net margin is below 5%. After discounts, delivery, and overheads, this leaves no real profit.
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Volume scenarios and solve-for-MRP only apply to the product pricing
          flow — services don't have an MRP or per-unit volume curve in the
          same way, and the Phase A scope doesn't add equivalent services
          analytics. Hide these cards for service items entirely. */}
      {!isService && (
        <>
          {/* ── VOLUME SCENARIOS ─────────────────────────────────────── */}
          <Card>
            <CardHeader title="Volume Scenarios — total profit at different unit volumes" />
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {VOLUME_TIERS.map((units) => {
                  const total = result.profitPerUnit * units;
                  return (
                    <div key={units} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{units.toLocaleString('en-IN')} units</p>
                      <p className={`mt-1 text-base font-bold ${total < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {formatINR(total)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── SOLVE FOR ────────────────────────────────────────────── */}
          <Card>
            <CardHeader title="Solve For MRP — find the price that hits a target margin" />
            <CardContent className="space-y-3">
              <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
                <Input
                  label="Target net margin %"
                  type="number"
                  step="0.01"
                  value={targetMargin}
                  onChange={(e) => setTargetMargin(e.target.value)}
                />
                <div className="text-xl text-zinc-400">→</div>
                <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-900 dark:bg-indigo-950/40">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Required MRP</p>
                  <p className="text-lg font-bold text-indigo-900 dark:text-indigo-200">
                    {solvedMrp != null ? formatINR(solvedMrp) : '—'}
                    {solvedMrp != null && (
                      <span className="ml-2 text-xs font-normal text-indigo-600 dark:text-indigo-400">
                        (round to ₹{roundUpToPsychologicalPrice(solvedMrp)})
                      </span>
                    )}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={applySolved} disabled={solvedMrp == null}>
                  <Calculator size={14} /> Apply
                </Button>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                <Sparkles size={12} className="mr-1 inline text-indigo-500" />
                Break-even MRP at current cost & margin: <strong>{breakeven != null ? formatINR(breakeven) : '—'}</strong>
                {breakeven != null && Number(mrp) > 0 && Number(mrp) < breakeven && (
                  <span className="ml-2 text-red-600 dark:text-red-400">— current MRP is below break-even</span>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {/* ── COST BREAKDOWN DIALOG ───────────────────────────────── */}
      <Modal
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        title="Cost Breakdown"
        wide
      >
        <CogmBreakdownCard
          rows={breakdown}
          total={breakdownTotal}
          onAdd={addBreakdownRow}
          onUpdate={updateBreakdownRow}
          onRemove={removeBreakdownRow}
        />
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => setBreakdownOpen(false)}>
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Table({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function Row({
  label,
  value,
  hint,
  muted,
  emphasized,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  emphasized?: boolean;
  tone?: 'emerald' | 'red' | 'amber';
}) {
  const toneClass =
    tone === 'red'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'amber'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : '';
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div>
        <p className={`${muted ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'} ${emphasized ? 'font-medium' : ''}`}>
          {label}
        </p>
        {hint && <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{hint}</p>}
      </div>
      <p className={`shrink-0 font-mono ${emphasized ? 'font-semibold' : ''} ${muted ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'} ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-dashed border-zinc-200 dark:border-zinc-800" />;
}

function Alert({ tone, children }: { tone: 'red' | 'amber'; children: React.ReactNode }) {
  const cls =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
      : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-md border p-3 text-xs ${cls}`}>
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

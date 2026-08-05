import { useState } from 'react';
import {
  Boxes, RefreshCw, PackageX, AlertTriangle, CalendarClock, Snowflake, Layers,
} from 'lucide-react';
import { PageHeader, Combobox } from '@/components/ui';
import {
  StatTile, SectionCard, useCountUp, formatInr,
} from '@/components/inventory/analytics-widgets';
import {
  StockValueTrendChart, StockFlowChart,
} from '@/components/inventory/analytics-charts';
import {
  PerformanceSections, RiskSection, ForecastSections,
} from './_analytics-sections';
import { AbcXyzMatrix, ReplenishmentSection } from './_analytics-planning';
import { useWarehouses } from '@/hooks/queries/use-inventory';
import {
  useInventoryHealth, useInventoryPerformance, useStockRisk,
  useInventoryForecast, useInventoryTrend, useReplenishment,
} from '@/hooks/queries/use-inventory';

/**
 * Inventory analytics — the decision layer.
 *
 * The operational reports answer "what do I hold"; this page answers "how
 * is it performing, what is about to run out, and what is about to expire".
 * Every figure is derived live from the stock ledger.
 *
 * One control bar drives the whole page so no two sections can be quoting
 * different periods at each other.
 */

const WINDOW_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 12 months' },
];

export function InventoryAnalyticsPage() {
  const [windowDays, setWindowDays] = useState('90');
  const [warehouseId, setWarehouseId] = useState('');
  // Service level drives the safety-stock buffer. 95% is the usual default;
  // the last few percent get expensive fast.
  const [serviceLevel, setServiceLevel] = useState(95);

  const { data: warehouses = [] } = useWarehouses();
  const warehouseOptions = [
    { value: '', label: 'All warehouses' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];

  const scope = {
    window: Number(windowDays),
    ...(warehouseId ? { warehouseId } : {}),
  };

  const { data: health, isLoading: healthLoading } = useInventoryHealth(scope);
  const { data: performance = [] } = useInventoryPerformance({ ...scope, limit: 200 });
  const { data: risk } = useStockRisk(scope);
  const { data: forecast } = useInventoryForecast({ ...scope, horizonDays: 60 });
  const { data: trend } = useInventoryTrend({
    months: 6,
    bucket: 'week',
    ...(warehouseId ? { warehouseId } : {}),
  });
  const { data: replenishment } = useReplenishment({ ...scope, serviceLevel });

  return (
    <div>
      <PageHeader
        title="Inventory analytics"
        description="How your stock is performing, what is about to run out, and what is about to expire."
        fullWidth
      />

      {/* Filters sit in one row above everything they affect. */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Combobox
            label="Period"
            options={WINDOW_OPTIONS}
            value={windowDays}
            onChange={setWindowDays}
          />
        </div>
        <div className="w-56">
          <Combobox
            label="Warehouse"
            options={warehouseOptions}
            value={warehouseId}
            onChange={setWarehouseId}
          />
        </div>
        <div className="w-44">
          <Combobox
            label="Service level"
            options={[
              { value: '90', label: '90% service' },
              { value: '95', label: '95% service' },
              { value: '98', label: '98% service' },
              { value: '99', label: '99% service' },
            ]}
            value={String(serviceLevel)}
            onChange={(v) => setServiceLevel(Number(v))}
          />
        </div>
      </div>

      <HealthRow health={health} loading={healthLoading} />

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <SectionCard
          index={6}
          title="Stock value over time"
          description="Closing value at each week end — matches the valuation report for the same date."
        >
          {trend && trend.points.length > 0 ? (
            <StockValueTrendChart data={trend.points} />
          ) : (
            <EmptyChart />
          )}
        </SectionCard>

        <SectionCard
          index={7}
          title="Received vs issued"
          description="Value flowing in and out each week. Persistent inflow above outflow is stock building up."
        >
          {trend && trend.points.length > 0 ? (
            <StockFlowChart data={trend.points} />
          ) : (
            <EmptyChart />
          )}
        </SectionCard>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {performance.length > 0 && (
          <PerformanceSections rows={performance} index={8} />
        )}
        {performance.length > 0 && <AbcXyzMatrix rows={performance} index={11} />}
        {risk && <RiskSection risk={risk} index={12} />}
        {replenishment && <ReplenishmentSection data={replenishment} index={14} />}
        {forecast && <ForecastSections forecast={forecast} index={15} />}
      </div>

      <p className="mt-4 text-[11px]" style={{ color: 'var(--text-3)' }}>
        {health && health.dataSpanDays < health.windowDays && (
          <>
            Your ledger covers {health.dataSpanDays} of the last {health.windowDays} days,
            so rates are annualised from that shorter run.{' '}
          </>
        )}
        Consumption counts deliveries, production issues, adjustments and reclaims.
        Transfers between your own warehouses are excluded when viewing all
        warehouses, and counted when a single warehouse is selected.
      </p>
    </div>
  );
}

/**
 * The scorecard. Every tile comes from one API call so the numbers can
 * never disagree with each other.
 */
function HealthRow({
  health, loading,
}: {
  health?: {
    totalValue: number; skuInStock: number; turnover: number | null;
    daysOnHand: number | null; deadValue: number; deadValuePct: number;
    deadSkuCount: number; expiringValue: number; belowReorder: number;
    outOfStock: number; windowDays: number; dataSpanDays: number;
    averageInventory: number; excessValue: number; excessSkuCount: number;
    excessCoverDays: number;
  };
  loading: boolean;
}) {
  const value = useCountUp(health?.totalValue ?? 0);
  const turnover = useCountUp(health?.turnover ?? 0);
  const dead = useCountUp(health?.deadValue ?? 0);
  const excess = useCountUp(health?.excessValue ?? 0);
  const expiring = useCountUp(health?.expiringValue ?? 0);

  const deadPct = health?.deadValuePct ?? 0;
  const oos = health?.outOfStock ?? 0;
  // Turnover is annualised off however much history exists. Say so when
  // that is materially less than the period asked for, rather than letting
  // a confident multiple stand on a few days of data.
  const shortRun = !!health && health.dataSpanDays < health.windowDays * 0.8;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <StatTile
        index={0} loading={loading}
        icon={Boxes} label="Stock value"
        value={formatInr(value)}
        sub={`${health?.skuInStock ?? 0} SKUs in stock`}
      />
      <StatTile
        index={1} loading={loading}
        icon={RefreshCw} label="Turnover"
        value={health?.turnover === null || health?.turnover === undefined
          ? '—'
          : `${turnover.toFixed(1)}×`}
        sub={shortRun
          ? `from ${health?.dataSpanDays ?? 0}d of history`
          : health?.daysOnHand
            ? `${Math.round(health.daysOnHand)}d on hand · avg basis`
            : 'per year'}
        tone={health?.turnover != null && health.turnover < 2 ? 'warning' : 'neutral'}
      />
      <StatTile
        index={2} loading={loading}
        icon={Layers} label="Excess stock"
        value={formatInr(excess)}
        sub={health ? `over ${health.excessCoverDays}d cover · ${health.excessSkuCount} SKUs` : ' '}
        tone={(health?.excessValue ?? 0) > 0 ? 'warning' : 'good'}
      />
      <StatTile
        index={3} loading={loading}
        icon={Snowflake} label="Dead stock"
        value={formatInr(dead)}
        sub={`${deadPct.toFixed(0)}% of value · ${health?.deadSkuCount ?? 0} SKUs`}
        tone={deadPct > 20 ? 'critical' : deadPct > 10 ? 'warning' : 'neutral'}
      />
      <StatTile
        index={4} loading={loading}
        icon={PackageX} label="Out of stock"
        value={String(oos)}
        sub="Traded SKUs at zero"
        tone={oos > 0 ? 'critical' : 'good'}
      />
      <StatTile
        index={5} loading={loading}
        icon={AlertTriangle} label="Below reorder"
        value={String(health?.belowReorder ?? 0)}
        sub="At or under reorder level"
        tone={(health?.belowReorder ?? 0) > 0 ? 'warning' : 'good'}
      />
      <StatTile
        index={6} loading={loading}
        icon={CalendarClock} label="Expiring 30d"
        value={formatInr(expiring)}
        sub="Batch value at risk"
        tone={(health?.expiringValue ?? 0) > 0 ? 'serious' : 'good'}
      />
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg text-[12px]"
      style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
      Not enough stock movement yet to draw this.
    </div>
  );
}

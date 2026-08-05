import { Link } from '@tanstack/react-router';
import { AlertTriangle, PackageX, CalendarClock, Repeat } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import {
  SectionCard, StatusBadge, MeterBar, AllClear, formatInr, formatQty,
  type StatTone,
} from '@/components/inventory/analytics-widgets';
import {
  AbcConcentrationChart, VelocityMixChart, ExpiryForecastChart,
} from '@/components/inventory/analytics-charts';
import type {
  SkuPerformance, StockRisk, InventoryForecast,
} from '@/hooks/queries/use-inventory';

/**
 * The lower half of the analytics page — performance, risk and prediction
 * sections. Split out of `analytics.tsx` purely to keep both files legible.
 */

const VELOCITY_LABEL: Record<string, string> = {
  fast: 'Fast', medium: 'Medium', slow: 'Slow', dead: 'Dead',
};

/** Risk level → status tone. Every use also renders the text label. */
const RISK_TONE: Record<string, StatTone> = {
  out: 'critical', critical: 'serious', warning: 'warning', ok: 'good',
};
const RISK_LABEL: Record<string, string> = {
  out: 'Out of stock', critical: 'Critical', warning: 'Low', ok: 'OK',
};

// ── Performance ───────────────────────────────────────────────────────

export function PerformanceSections({ rows, index }: { rows: SkuPerformance[]; index: number }) {
  const total = rows.length;
  const totalValue = rows.reduce((s, r) => s + r.consumedValue, 0);

  const abc = (['A', 'B', 'C'] as const).map((c) => {
    const inClass = rows.filter((r) => r.abcClass === c);
    return {
      abcClass: c,
      skuPct: total > 0 ? (inClass.length / total) * 100 : 0,
      valuePct: totalValue > 0
        ? (inClass.reduce((s, r) => s + r.consumedValue, 0) / totalValue) * 100
        : 0,
      count: inClass.length,
    };
  });

  const velocity = (['dead', 'slow', 'medium', 'fast'] as const).map((band) => ({
    band: VELOCITY_LABEL[band]!,
    value: rows.filter((r) => r.velocity === band).reduce((s, r) => s + r.onHandValue, 0),
    count: rows.filter((r) => r.velocity === band).length,
  }));

  const movers = [...rows]
    .filter((r) => r.consumedValue > 0)
    .sort((a, b) => b.consumedValue - a.consumedValue)
    .slice(0, 8);
  const maxMover = movers[0]?.consumedValue ?? 0;

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard
          index={index}
          title="Where your money concentrates"
          description="Class A is the small group of SKUs carrying most of your consumption value — the ones worth never running out of."
        >
          <AbcConcentrationChart data={abc} />
          <div className="mt-2 grid grid-cols-3 gap-2">
            {abc.map((a) => (
              <div key={a.abcClass} className="rounded-lg px-2.5 py-2"
                style={{ background: 'var(--surface-2)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Class {a.abcClass}
                </div>
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {a.count} SKU{a.count === 1 ? '' : 's'}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {a.valuePct.toFixed(0)}% of value
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          index={index + 1}
          title="Stock value by how fast it moves"
          description="Anything in Slow or Dead is working capital sitting still."
        >
          <VelocityMixChart data={velocity} />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {velocity.map((v) => (
              <div key={v.band} className="rounded-lg px-2 py-1.5"
                style={{ background: 'var(--surface-2)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{v.band}</div>
                <div className="text-[12px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {v.count}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        index={index + 2}
        title="Top movers"
        description="Highest consumption value in the window. Cover is how many days of stock remains at the current rate."
      >
        {movers.length === 0 ? (
          <AllClear message="No outbound movement recorded in this window yet." />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <Th>Item</Th>
                <Th>Class</Th>
                <Th align="right">Consumed</Th>
                <Th className="w-[22%]">Share</Th>
                <Th align="right">Rate / day</Th>
                <Th align="right">Cover</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {movers.map((m) => (
                <TableRow key={m.itemId}>
                  <TableCell>
                    <div className="text-[12.5px]">{m.itemName}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {m.itemSku ?? '—'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={m.abcClass === 'A' ? 'good' : 'neutral'}
                      label={m.abcClass}
                    />
                  </TableCell>
                  <TableCell align="right" numeric>{formatInr(m.consumedValue)}</TableCell>
                  <TableCell>
                    <MeterBar pct={maxMover > 0 ? (m.consumedValue / maxMover) * 100 : 0} />
                  </TableCell>
                  <TableCell align="right" numeric>
                    {formatQty(m.runRate)} {m.itemUnit ?? ''}
                  </TableCell>
                  <TableCell align="right" numeric>
                    {m.daysOfCover === null ? '—' : `${Math.round(m.daysOfCover)}d`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}

// ── Risk ──────────────────────────────────────────────────────────────

export function RiskSection({ risk, index }: { risk: StockRisk; index: number }) {
  const rows = [...risk.outOfStock, ...risk.critical, ...risk.warning].slice(0, 12);
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <SectionCard
          index={index}
          title="Stock at risk"
          description="Out of stock first, then everything at or below its reorder level."
          action={
            <Link to="/inventory/reports/reorder"
              className="text-[11.5px] font-medium" style={{ color: 'var(--accent-text)' }}>
              Reorder rules →
            </Link>
          }
        >
          {rows.length === 0 ? (
            <AllClear message="Nothing is out of stock or below its reorder level. Note that SKUs without a reorder level set can't be checked." />
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <Th>Item</Th>
                  <Th>Status</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Reorder at</Th>
                  <Th align="right">Short by</Th>
                  <Th align="right">Days out</Th>
                </tr>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.itemId}>
                    <TableCell>
                      <div className="text-[12.5px]">{r.itemName}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {r.itemSku ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={RISK_TONE[r.level]!} label={RISK_LABEL[r.level]!} />
                    </TableCell>
                    <TableCell align="right" numeric>
                      {formatQty(r.onHand)} {r.itemUnit ?? ''}
                    </TableCell>
                    <TableCell align="right" numeric>
                      {r.reorderLevel === null ? '—' : formatQty(r.reorderLevel)}
                    </TableCell>
                    <TableCell align="right" numeric>
                      {r.shortBy > 0 ? formatQty(r.shortBy) : '—'}
                    </TableCell>
                    <TableCell align="right" numeric>
                      {r.daysOut > 0 ? `${r.daysOut}d` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>

      <SectionCard
        index={index + 1}
        title="Keeps running out"
        description={`Hit zero more than once in the last ${risk.windowDays} days — the reorder level is set too low.`}
      >
        {risk.repeatOffenders.length === 0 ? (
          <AllClear message="No SKU ran dry more than once." />
        ) : (
          <ul className="flex flex-col gap-2">
            {risk.repeatOffenders.map((r) => (
              <li key={r.itemId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px]" style={{ color: 'var(--text-1)' }}>
                    {r.itemName}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    reorder at {r.reorderLevel === null ? 'not set' : formatQty(r.reorderLevel)}
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold"
                  style={{ color: '#ec835a' }}>
                  <Repeat size={12} /> {r.timesOutInWindow}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ── Predictions ───────────────────────────────────────────────────────

export function ForecastSections({
  forecast, index,
}: { forecast: InventoryForecast; index: number }) {
  const { stockout, expiry } = forecast;
  const rows = stockout.items.slice(0, 12);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <SectionCard
          index={index}
          title="Running out next"
          description={`Projected from the last ${stockout.windowDays} days of demand. "Order by" subtracts the vendor lead time from the stockout date.`}
        >
          {rows.length === 0 ? (
            <AllClear message={`Nothing is projected to run out in the next ${stockout.horizonDays} days.`} />
          ) : (
            <>
              {stockout.lateCount > 0 && (
                <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: 'rgba(208,59,59,0.10)', color: '#d03b3b' }}>
                  <AlertTriangle size={14} />
                  <span>
                    <strong>{stockout.lateCount}</strong> item
                    {stockout.lateCount === 1 ? '' : 's'} already past the order-by date.
                  </span>
                </div>
              )}
              <Table>
                <TableHeader>
                  <tr>
                    <Th>Item</Th>
                    <Th align="right">On hand</Th>
                    <Th align="right">Cover</Th>
                    <Th>Runs out</Th>
                    <Th>Order by</Th>
                    <Th align="right">Suggested qty</Th>
                  </tr>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.itemId}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px]">{r.itemName}</span>
                          {!r.hasEnoughHistory && (
                            <StatusBadge tone="warning" label="Thin history" />
                          )}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                          {formatQty(r.runRate)} {r.itemUnit ?? ''}/day
                        </div>
                      </TableCell>
                      <TableCell align="right" numeric>
                        {formatQty(r.onHand)} {r.itemUnit ?? ''}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {r.daysOfCover === null ? '—' : `${Math.round(r.daysOfCover)}d`}
                      </TableCell>
                      <TableCell>
                        {r.stockoutDate ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </TableCell>
                      <TableCell>
                        {r.reorderByDate === null ? (
                          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                            no lead time set
                          </span>
                        ) : r.isLate ? (
                          <StatusBadge tone="critical" label={`${r.reorderByDate} · late`} />
                        ) : (
                          r.reorderByDate
                        )}
                      </TableCell>
                      <TableCell align="right" numeric>{formatQty(r.suggestedQty)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {stockout.unpredictableCount > 0 && (
                <p className="mt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {stockout.unpredictableCount} item
                  {stockout.unpredictableCount === 1 ? ' has' : 's have'} under two weeks of
                  movement history — treat those projections as a rough signal only.
                </p>
              )}
            </>
          )}
        </SectionCard>
      </div>

      <SectionCard
        index={index + 1}
        title="Expiring stock"
        description="Value that writes off unless it moves. Not a projection — these dates are already fixed."
        action={
          <Link to="/inventory/reports/expiry"
            className="text-[11.5px] font-medium" style={{ color: 'var(--accent-text)' }}>
            Details →
          </Link>
        }
      >
        {expiry.buckets.length === 0 ? (
          <AllClear message="No batch expiry dates recorded on current stock." />
        ) : (
          <>
            <ExpiryForecastChart data={expiry.buckets} />
            <div className="mt-3 flex flex-col gap-1.5 text-[12px]">
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-2)' }}>
                  <CalendarClock size={12} className="mr-1 inline" />
                  At risk (12 months)
                </span>
                <strong style={{ color: 'var(--text-1)' }}>{formatInr(expiry.totalAtRisk)}</strong>
              </div>
              {expiry.alreadyExpiredValue > 0 && (
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-2)' }}>
                    <PackageX size={12} className="mr-1 inline" />
                    Already expired
                  </span>
                  <StatusBadge tone="critical" label={formatInr(expiry.alreadyExpiredValue)} />
                </div>
              )}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}

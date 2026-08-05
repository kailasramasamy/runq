import {
  SectionCard, StatusBadge, AllClear, formatInr, formatQty,
} from '@/components/inventory/analytics-widgets';
import {
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';
import type { SkuPerformance, Replenishment } from '@/hooks/queries/use-inventory';

/**
 * Planning sections: the ABC×XYZ policy matrix and the computed reorder
 * levels. These are the two that turn the page from a description of stock
 * into instructions about it.
 */

const ABC_ROWS = ['A', 'B', 'C'] as const;
const XYZ_COLS = ['X', 'Y', 'Z'] as const;

/** What each cell of the 9-box actually means for stocking policy. */
const POLICY: Record<string, string> = {
  AX: 'Tight control, run lean — steady and valuable',
  AY: 'Keep a real buffer — valuable, demand swings',
  AZ: 'Buffer hard or make to order — valuable and erratic',
  BX: 'Automate reordering, review rarely',
  BY: 'Moderate buffer',
  BZ: 'Order on demand where you can',
  CX: 'Cheap to overstock — bulk order, forget it',
  CY: 'Low priority, small buffer',
  CZ: 'Consider not stocking at all',
};

/**
 * ABC×XYZ. ABC says what a SKU is worth, XYZ says whether you can plan it.
 * Crossed, they say how to stock it — which is the actual decision.
 *
 * Cells are tinted by share of consumption value using the same single hue
 * as the rest of the page, capped at a low alpha so the label keeps full
 * text contrast against the surface rather than fighting the fill.
 */
export function AbcXyzMatrix({ rows, index }: { rows: SkuPerformance[]; index: number }) {
  const classified = rows.filter((r) => r.xyzClass !== null);
  const unclassified = rows.length - classified.length;
  const totalValue = classified.reduce((s, r) => s + r.consumedValue, 0);

  const cell = (abc: string, xyz: string) => {
    const inCell = classified.filter((r) => r.abcClass === abc && r.xyzClass === xyz);
    const value = inCell.reduce((s, r) => s + r.consumedValue, 0);
    return {
      count: inCell.length,
      value,
      share: totalValue > 0 ? value / totalValue : 0,
      items: inCell,
    };
  };

  return (
    <SectionCard
      index={index}
      title="How to stock each item"
      description="ABC is what it's worth; XYZ is how predictable demand is. Together they decide the policy — steady and valuable can run lean, erratic and valuable needs a real buffer."
    >
      {classified.length === 0 ? (
        <AllClear message="Not enough weekly demand history yet to judge predictability. This fills in once each item has three full weeks of movement." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[auto_repeat(3,1fr)] gap-1.5">
                <div />
                {XYZ_COLS.map((x) => (
                  <div key={x} className="pb-1 text-center text-[11px] font-semibold"
                    style={{ color: 'var(--text-2)' }}>
                    {x} · {x === 'X' ? 'steady' : x === 'Y' ? 'variable' : 'erratic'}
                  </div>
                ))}
                {ABC_ROWS.map((a) => (
                  <Row key={a} abc={a} cell={cell} />
                ))}
              </div>
            </div>
          </div>
          {unclassified > 0 && (
            <p className="mt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
              {unclassified} item{unclassified === 1 ? '' : 's'} not yet classified — under three
              full weeks of demand history.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}

function Row({
  abc, cell,
}: {
  abc: string;
  cell: (a: string, x: string) => { count: number; value: number; share: number; items: SkuPerformance[] };
}) {
  return (
    <>
      <div className="flex items-center pr-2 text-[11px] font-semibold"
        style={{ color: 'var(--text-2)' }}>
        {abc}
      </div>
      {XYZ_COLS.map((x) => {
        const c = cell(abc, x);
        const key = `${abc}${x}`;
        return (
          <div
            key={key}
            className="rounded-lg border px-2.5 py-2"
            style={{
              borderColor: 'var(--border)',
              // Tint capped at 0.30 so cell text keeps its contrast.
              background: c.count > 0
                ? `color-mix(in srgb, #2a78d6 ${Math.round(Math.min(0.3, c.share) * 100)}%, transparent)`
                : 'var(--surface-2)',
            }}
            title={POLICY[key]}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>
                {c.count}
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--text-2)' }}>
                {c.value > 0 ? formatInr(c.value) : '—'}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] leading-tight" style={{ color: 'var(--text-3)' }}>
              {c.count > 0 ? POLICY[key] : '—'}
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * Computed reorder levels. The operational alert list only reads a
 * hand-typed `reorder_level`; this is the number that should be typed, and
 * the gap between the two is the point of the table.
 */
export function ReplenishmentSection({
  data, index,
}: { data: Replenishment; index: number }) {
  const rows = data.rows.slice(0, 12);
  return (
    <SectionCard
      index={index}
      title="Suggested reorder levels"
      description={`Reorder point = (average daily demand × lead time) + safety stock, at a ${data.serviceLevel}% service level (z = ${data.z}).`}
    >
      {rows.length === 0 ? (
        <AllClear message="No item has enough demand history to compute a reorder point yet." />
      ) : (
        <>
          {data.unconfiguredCount > 0 && (
            <div className="mb-2 rounded-lg px-3 py-2 text-[12px]"
              style={{ background: 'rgba(250,178,25,0.14)', color: '#8a6100' }}>
              <strong>{data.unconfiguredCount}</strong> item
              {data.unconfiguredCount === 1 ? ' has' : 's have'} no reorder level set at all —
              low-stock alerts stay silent for {data.unconfiguredCount === 1 ? 'it' : 'them'} no
              matter how thin stock gets.
            </div>
          )}
          <Table>
            <TableHeader>
              <tr>
                <Th>Item</Th>
                <Th align="right">On hand</Th>
                <Th align="right">Demand/day</Th>
                <Th align="right">Lead time</Th>
                <Th align="right">Safety stock</Th>
                <Th align="right">Suggested level</Th>
                <Th align="right">Set today</Th>
                <Th align="right">Order qty</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.itemId}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px]">{r.itemName}</span>
                      {r.breachesSuggested && <StatusBadge tone="critical" label="Order now" />}
                      {!r.hasReliableSigma && <StatusBadge tone="warning" label="Thin history" />}
                    </div>
                  </TableCell>
                  <TableCell align="right" numeric>
                    {formatQty(r.onHand)} {r.itemUnit ?? ''}
                  </TableCell>
                  <TableCell align="right" numeric>
                    {formatQty(r.avgDailyDemand)}
                    <span style={{ color: 'var(--text-3)' }}> ±{formatQty(r.demandSd)}</span>
                  </TableCell>
                  <TableCell align="right" numeric>
                    {r.leadTimeDays}d
                    {r.leadTimeAssumed && (
                      <span style={{ color: 'var(--text-3)' }} title="No lead time configured — assumed"> *</span>
                    )}
                  </TableCell>
                  <TableCell align="right" numeric>{formatQty(r.safetyStock)}</TableCell>
                  <TableCell align="right" numeric className="font-semibold">
                    {formatQty(r.suggestedReorderLevel)}
                  </TableCell>
                  <TableCell align="right" numeric>
                    {r.currentReorderLevel === null ? (
                      <span style={{ color: 'var(--text-3)' }}>not set</span>
                    ) : (
                      <>
                        {formatQty(r.currentReorderLevel)}
                        {r.gap !== null && r.gap > 0 && (
                          <span style={{ color: '#d03b3b' }}> (+{formatQty(r.gap)})</span>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell align="right" numeric>{formatQty(r.suggestedOrderQty)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
            * lead time assumed at {data.defaultLeadTimeDays} days where no reorder rule sets one.
            Safety stock = z × standard deviation of daily demand × √lead time; quiet days count as
            zero-demand days, which is what makes the spread meaningful.
          </p>
        </>
      )}
    </SectionCard>
  );
}

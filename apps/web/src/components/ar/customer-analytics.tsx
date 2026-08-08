import { useMemo, useState } from 'react';
import { BarChart3, Download, Package, TrendingUp } from 'lucide-react';
import { formatINR, formatIndianNumber } from '@/lib/utils';
import { downloadCSV } from '@/lib/csv-export';
import {
  DATE_RANGE_PRESETS, resolveDateRangePreset, autoGroupBy,
  type DateRange, type DateRangePresetId,
} from '@/lib/date-ranges';
import { useCustomerAnalytics, type CustomerProductSales } from '@/hooks/queries/use-customer-analytics';
import {
  Button, Table, TableHeader, Th, TableBody, TableRow, TableCell, EmptyState,
} from '@/components/ar/primitives';
import { CustomerSalesTrendChart } from '@/components/ar/customer-sales-chart';

type ProductSort = 'revenue' | 'quantity';

/**
 * Counts render without decimals — `formatIndianNumber` always emits two,
 * which turns "48 invoices" into "48.00".
 */
function formatCount(n: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}

/** Card shell shared by the chart and product-table sections. */
function Panel({ title, icon, right, children }: {
  title: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: 'var(--border-soft)' }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--text-2)' }}>{icon}</span>
          <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="text-[10.5px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="num mt-1 text-[20px] font-semibold tabular-nums leading-tight" style={{ color: 'var(--text-1)' }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>{hint}</div>}
    </div>
  );
}

/** Preset chips + custom from/to inputs. */
function RangeControls({
  preset, range, onPreset, onCustom,
}: {
  preset: DateRangePresetId;
  range: DateRange;
  onPreset: (p: DateRangePresetId) => void;
  onCustom: (r: DateRange) => void;
}) {
  const inputStyle = {
    background: 'var(--surface)',
    borderColor: 'var(--border)',
    color: 'var(--text-1)',
  } as const;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {DATE_RANGE_PRESETS.map((p) => {
          const isActive = p.id === preset;
          return (
            <button
              key={p.id}
              onClick={() => onPreset(p.id)}
              className="rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors"
              style={{
                background: isActive ? 'var(--accent-soft)' : 'var(--surface)',
                borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                color: isActive ? 'var(--accent-text)' : 'var(--text-2)',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
          <input
            type="date"
            value={range.dateFrom}
            max={range.dateTo}
            onChange={(e) => onCustom({ ...range, dateFrom: e.target.value })}
            className="num rounded-md border px-2 py-1 text-[11.5px]"
            style={inputStyle}
          />
          <span>to</span>
          <input
            type="date"
            value={range.dateTo}
            min={range.dateFrom}
            onChange={(e) => onCustom({ ...range, dateTo: e.target.value })}
            className="num rounded-md border px-2 py-1 text-[11.5px]"
            style={inputStyle}
          />
        </div>
      )}
    </div>
  );
}

function ProductRow({ product }: { product: CustomerProductSales }) {
  return (
    <TableRow>
      <TableCell>
        <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-1)' }}>{product.name}</span>
        {product.sku && (
          <span className="num ml-2 text-[11px]" style={{ color: 'var(--text-3)' }}>{product.sku}</span>
        )}
      </TableCell>
      <TableCell align="right" numeric>
        {formatIndianNumber(product.quantity)}
        {product.uom && <span className="ml-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{product.uom}</span>}
      </TableCell>
      <TableCell align="right" numeric style={{ color: 'var(--text-2)' }}>
        {formatCount(product.invoiceCount)}
      </TableCell>
      <TableCell align="right" numeric className="font-semibold">{formatINR(product.revenue)}</TableCell>
      <TableCell align="right">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(product.sharePct, 1)}%`, background: 'var(--accent)' }}
            />
          </div>
          <span className="num text-[11.5px] tabular-nums" style={{ color: 'var(--text-2)' }}>
            {product.sharePct.toFixed(1)}%
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

const PRODUCT_PAGE_SIZE = 15;

/** `Acme Traders Pvt Ltd` → `acme-traders-pvt-ltd`, for use in a filename. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'customer';
}

/**
 * Export the product breakdown for the active window. Writes every product
 * row, not just the 15 on screen, and keeps the on-screen sort order. The
 * date range goes in the filename so a saved file stays self-describing.
 */
function exportProductsCSV(
  products: CustomerProductSales[],
  range: DateRange,
  customerName: string | undefined,
): void {
  const name = slugify(customerName ?? 'customer');
  downloadCSV(
    `sales-by-product_${name}_${range.dateFrom}_to_${range.dateTo}.csv`,
    ['Product', 'SKU', 'UOM', 'Quantity', 'Invoices', 'Revenue (INR)', 'Share %'],
    products.map((p) => [
      p.name,
      p.sku ?? '',
      p.uom ?? '',
      p.quantity,
      p.invoiceCount,
      // Raw numbers, not formatted strings — these land in a spreadsheet.
      p.revenue.toFixed(2),
      p.sharePct.toFixed(2),
    ]),
  );
}

export function CustomerAnalyticsTab({
  customerId, customerName,
}: { customerId: string; customerName?: string }) {
  const [preset, setPreset] = useState<DateRangePresetId>('this_fy');
  const [customRange, setCustomRange] = useState<DateRange>(() => resolveDateRangePreset('this_fy'));
  const [sort, setSort] = useState<ProductSort>('revenue');
  const [showAllProducts, setShowAllProducts] = useState(false);

  const range = preset === 'custom' ? customRange : resolveDateRangePreset(preset);
  const groupBy = autoGroupBy(range);
  const validRange = range.dateFrom <= range.dateTo;

  const { data, isLoading, isError } = useCustomerAnalytics(
    customerId,
    { ...range, groupBy },
    validRange,
  );
  const analytics = data?.data;

  const products = useMemo(() => {
    const rows = analytics?.products ?? [];
    return sort === 'quantity' ? [...rows].sort((a, b) => b.quantity - a.quantity) : rows;
  }, [analytics?.products, sort]);

  const visibleProducts = showAllProducts ? products : products.slice(0, PRODUCT_PAGE_SIZE);

  function handlePreset(p: DateRangePresetId) {
    // Seed the custom inputs from whatever was on screen so switching to
    // Custom doesn't blank the range out.
    if (p === 'custom') setCustomRange(range);
    setPreset(p);
    setShowAllProducts(false);
  }

  return (
    <div>
      <RangeControls preset={preset} range={range} onPreset={handlePreset} onCustom={setCustomRange} />

      {!validRange && (
        <p className="text-[12.5px]" style={{ color: 'var(--neg)' }}>
          The start date must be on or before the end date.
        </p>
      )}

      {validRange && isError && (
        <p className="text-[12.5px]" style={{ color: 'var(--neg)' }}>Couldn’t load analytics for this period.</p>
      )}

      {validRange && isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
              />
            ))}
          </div>
          <div
            className="h-64 animate-pulse rounded-xl border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          />
        </div>
      )}

      {validRange && analytics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Total sales"
              value={formatINR(analytics.summary.totalSales)}
              hint={`excl. ${formatINR(analytics.summary.taxAmount)} tax`}
            />
            <StatTile
              label="Invoices"
              value={formatCount(analytics.summary.invoiceCount)}
              hint={`avg ${formatINR(analytics.summary.avgInvoiceValue)}`}
            />
            <StatTile
              label="Products sold"
              value={formatCount(analytics.summary.distinctProducts)}
              hint="distinct items"
            />
            <StatTile
              label="Total quantity"
              value={formatIndianNumber(analytics.summary.totalQuantity)}
              hint="across all UOMs"
            />
          </div>

          <Panel
            title="Sales trend"
            icon={<TrendingUp size={14} />}
            right={
              <span className="text-[11px] capitalize" style={{ color: 'var(--text-3)' }}>
                by {groupBy}
              </span>
            }
          >
            {analytics.trend.length === 0 ? (
              <EmptyState icon={<BarChart3 size={18} />} title="No sales in this period" />
            ) : (
              <div className="px-3 py-4">
                <CustomerSalesTrendChart data={analytics.trend} groupBy={groupBy} />
              </div>
            )}
          </Panel>

          <Panel
            title="Sales by product"
            icon={<Package size={14} />}
            right={
              <div className="flex items-center gap-1">
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Sort by</span>
                <Button
                  variant={sort === 'revenue' ? 'outline' : 'ghost'}
                  size="sm"
                  onClick={() => setSort('revenue')}
                >
                  Revenue
                </Button>
                <Button
                  variant={sort === 'quantity' ? 'outline' : 'ghost'}
                  size="sm"
                  onClick={() => setSort('quantity')}
                >
                  Quantity
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download size={12} />}
                  disabled={products.length === 0}
                  onClick={() => exportProductsCSV(products, range, customerName)}
                >
                  Export CSV
                </Button>
              </div>
            }
          >
            {products.length === 0 ? (
              <EmptyState
                icon={<Package size={18} />}
                title="No products sold"
                description="Invoice lines in this period will be summarised here."
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <tr>
                      <Th>Product</Th>
                      <Th align="right">Quantity</Th>
                      <Th align="right">Invoices</Th>
                      <Th align="right">Revenue</Th>
                      <Th align="right">Share</Th>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {visibleProducts.map((p) => (
                      <ProductRow key={p.itemId ?? `adhoc:${p.name}`} product={p} />
                    ))}
                  </TableBody>
                </Table>
                {products.length > PRODUCT_PAGE_SIZE && (
                  <div className="flex items-center justify-between px-5 py-3 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
                    <span className="num">
                      Showing {visibleProducts.length} of {products.length} products
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setShowAllProducts((v) => !v)}>
                      {showAllProducts ? 'Show top 15' : 'Show all'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

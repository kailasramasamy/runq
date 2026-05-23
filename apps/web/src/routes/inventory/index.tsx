import { Link } from '@tanstack/react-router';
import { Boxes, PackagePlus, PackageMinus, AlertTriangle, Warehouse } from 'lucide-react';
import { PageHeader, StatsCard, Card, CardContent, CardHeader } from '@/components/ui';
import { useInventoryDashboard } from '@/hooks/queries/use-inventory';

export function InventoryDashboardPage() {
  const { data } = useInventoryDashboard();

  return (
    <div>
      <PageHeader title="Inventory" description="Stock, receipts, dispatches, and reports." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Stock value" value={data?.totalValue ?? 0} icon={Boxes} />
        <StatsCard
          title="Active SKU rows"
          value={data?.activeRows ?? 0}
          icon={Warehouse}
          formatValue={(v) => String(v)}
        />
        <StatsCard
          title="Low-stock items"
          value={data?.lowStockCount ?? 0}
          icon={AlertTriangle}
          formatValue={(v) => String(v)}
        />
        <StatsCard
          title="Today's receipts"
          value={data?.todayGrns ?? 0}
          icon={PackagePlus}
          formatValue={(v) => String(v)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <QuickActionCard
          icon={PackagePlus}
          title="Receive stock"
          body="Create a Goods Receipt Note when stock arrives."
          to="/inventory/grn/new"
        />
        <QuickActionCard
          icon={PackageMinus}
          title="Dispatch stock"
          body="Generate a delivery note and book COGS."
          to="/inventory/delivery/new"
        />
        <QuickActionCard
          icon={Boxes}
          title="On-hand stock"
          body="See live qty + value by warehouse and batch."
          to="/inventory/stock/on-hand"
        />
        <QuickActionCard
          icon={Warehouse}
          title="Manage warehouses"
          body="Add or edit your godowns, shops, and vehicles."
          to="/inventory/warehouses"
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-base font-semibold">Today</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-zinc-500">Receipts posted</div>
              <div className="text-2xl font-semibold">{data?.todayGrns ?? 0}</div>
            </div>
            <div>
              <div className="text-zinc-500">Dispatches</div>
              <div className="text-2xl font-semibold">{data?.todayDeliveries ?? 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuickActionCard({
  icon: Icon, title, body, to,
}: { icon: typeof Boxes; title: string; body: string; to: string }) {
  return (
    <Link
      to={to as never}
      className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
      style={{ borderColor: 'var(--border-soft, oklch(0.92 0 0))' }}
    >
      <span
        className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        <Icon size={18} />
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
      </div>
    </Link>
  );
}

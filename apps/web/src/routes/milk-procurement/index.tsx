import { Droplets, Users, Coins, FlaskConical, TrendingUp } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import {
  PageHeader,
  StatsCard,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Th,
} from '@/components/ui';
import {
  useCollectionSummary,
  milkTypeLabel,
  type MpCollectionNodeRow,
} from '@/hooks/queries/use-milk-procurement';
import { formatINR } from '@/lib/utils';
import { QualityTrendSection } from './_quality-trend';

export function MilkProcurementHomePage() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = useCollectionSummary({ from: today, to: today });
  const s = data?.data;
  const rows = s?.byMilkType ?? [];
  const ccRows = s?.byCc ?? [];
  const nodeRows = s?.byNode ?? [];

  return (
    <div>
      <PageHeader
        title="Milk Procurement"
        description="Dhenu — collection network, farmers, rate charts, and payouts."
        fullWidth
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard
          title="Milk today (L)"
          value={s?.totalQty ?? 0}
          icon={Droplets}
          formatValue={(v) => `${v.toLocaleString()} L`}
        />
        <StatsCard
          title="AM / PM (L)"
          value={s?.amQty ?? 0}
          icon={TrendingUp}
          formatValue={() => `${s?.amQty ?? 0} / ${s?.pmQty ?? 0}`}
        />
        <StatsCard title="Farmers poured" value={s?.farmerCount ?? 0} icon={Users} formatValue={(v) => String(v)} />
        <StatsCard title="Gross payable" value={s?.grossAmount ?? 0} icon={Coins} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatsCard title="Avg FAT" value={s?.avgFat ?? 0} icon={FlaskConical} formatValue={(v) => v.toFixed(2)} />
        <StatsCard title="Avg SNF" value={s?.avgSnf ?? 0} icon={FlaskConical} formatValue={(v) => v.toFixed(2)} />
        <StatsCard
          title="Avg Water %"
          value={s?.avgWater ?? 0}
          icon={FlaskConical}
          formatValue={(v) => (v > 0 ? v.toFixed(2) : '—')}
        />
        <StatsCard title="Pours today" value={s?.pourCount ?? 0} formatValue={(v) => String(v)} />
      </div>

      <div className="mt-7">
        <QualityTrendSection />
      </div>

      <HistoryHeading title="By milk type — today" to="/milk-procurement/reports/by-milk-type" />
      <Table>
        <TableHeader>
          <TableRow>
            <Th>Milk type</Th>
            <Th align="right">Qty (L)</Th>
            <Th align="right">AM / PM</Th>
            <Th align="right">Farmers</Th>
            <Th align="right">Pours</Th>
            <Th align="right">Avg FAT</Th>
            <Th align="right">Avg SNF</Th>
            <Th align="right">Gross payable</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={8} message="No pours recorded today" />
          ) : (
            rows.map((r) => (
              <TableRow key={r.milkType}>
                <TableCell>{milkTypeLabel(r.milkType)}</TableCell>
                <TableCell align="right" numeric>
                  {r.totalQty.toLocaleString()}
                </TableCell>
                <TableCell align="right" numeric>
                  {r.amQty} / {r.pmQty}
                </TableCell>
                <TableCell align="right" numeric>
                  {r.farmerCount}
                </TableCell>
                <TableCell align="right" numeric>
                  {r.pourCount}
                </TableCell>
                <TableCell align="right" numeric>
                  {r.avgFat > 0 ? r.avgFat.toFixed(2) : '—'}
                </TableCell>
                <TableCell align="right" numeric>
                  {r.avgSnf > 0 ? r.avgSnf.toFixed(2) : '—'}
                </TableCell>
                <TableCell align="right" numeric>
                  {formatINR(r.grossAmount)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <HistoryHeading title="By collection centre — today" to="/milk-procurement/reports/by-cc" />
      <NodeTable rows={ccRows} label="collection centre" />

      <HistoryHeading title="By VMCC — today" to="/milk-procurement/reports/by-vmcc" />
      <NodeTable rows={nodeRows} label="VMCC" />
    </div>
  );
}

/** Section heading with a "History →" link to the matching daily-history page. */
function HistoryHeading({ title, to }: { title: string; to: string }) {
  return (
    <div className="mt-7 mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-zinc-500">{title}</h2>
      <Link to={to} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        History →
      </Link>
    </div>
  );
}

function NodeTable({ rows, label }: { rows: MpCollectionNodeRow[]; label: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th>{label === 'VMCC' ? 'VMCC' : 'Centre'}</Th>
          <Th align="right">Qty (L)</Th>
          <Th align="right">AM / PM</Th>
          <Th align="right">Farmers</Th>
          <Th align="right">Pours</Th>
          <Th align="right">Avg FAT</Th>
          <Th align="right">Avg SNF</Th>
          <Th align="right">Gross payable</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmpty colSpan={8} message={`No pours recorded today by ${label}`} />
        ) : (
          rows.map((n) => (
            <TableRow key={n.nodeId}>
              <TableCell>
                {n.nodeName} <span className="text-zinc-400">· {n.nodeCode}</span>
              </TableCell>
              <TableCell align="right" numeric>
                {n.totalQty.toLocaleString()}
              </TableCell>
              <TableCell align="right" numeric>
                {n.amQty} / {n.pmQty}
              </TableCell>
              <TableCell align="right" numeric>
                {n.farmerCount}
              </TableCell>
              <TableCell align="right" numeric>
                {n.pourCount}
              </TableCell>
              <TableCell align="right" numeric>
                {n.avgFat > 0 ? n.avgFat.toFixed(2) : '—'}
              </TableCell>
              <TableCell align="right" numeric>
                {n.avgSnf > 0 ? n.avgSnf.toFixed(2) : '—'}
              </TableCell>
              <TableCell align="right" numeric>
                {formatINR(n.grossAmount)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

import { useFixedAsset } from '@/hooks/queries/use-fixed-assets';
import type { FixedAssetWithDepreciation, DepreciationEntry } from '@runq/types';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Badge, Card, CardHeader, CardContent, StatsCard,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
} from '@/components/ui';

const STATUS_VARIANT: Record<string, React.ComponentProps<typeof Badge>['variant']> = {
  active: 'success',
  disposed: 'outline',
  written_off: 'warning',
  cwip: 'default',
};

function AssetInfoCard({ asset }: { asset: FixedAssetWithDepreciation }) {
  const fields = [
    { label: 'Asset Code', value: asset.assetCode },
    { label: 'Category', value: (asset as any).categoryName ?? '—' },
    { label: 'Acquisition Date', value: asset.acquisitionDate },
    { label: 'Put to Use Date', value: asset.putToUseDate ?? '—' },
    { label: 'Location', value: asset.location ?? '—' },
    { label: 'Serial Number', value: asset.serialNumber ?? '—' },
    { label: 'Vendor', value: (asset as any).vendorName ?? '—' },
    { label: 'GST Credit Claimed', value: asset.gstCreditClaimed ? `Yes — ${formatINR(asset.gstAmount ?? 0)}` : 'No' },
    { label: 'Description', value: asset.description ?? '—' },
  ];

  return (
    <Card>
      <CardHeader title="Asset Details" />
      <CardContent>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function DepreciationTable({ entries }: { entries: DepreciationEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader title="Depreciation History" />
        <CardContent>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No depreciation posted yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Depreciation History" />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <tr>
              <Th>Period End</Th>
              <Th>Method</Th>
              <Th align="right">Rate %</Th>
              <Th align="right">Opening WDV</Th>
              <Th align="right">Depreciation</Th>
              <Th align="right">Closing WDV</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{entry.periodEnd}</TableCell>
                <TableCell className="uppercase text-xs text-zinc-500 dark:text-zinc-400">{entry.method}</TableCell>
                <TableCell align="right" numeric>{entry.rate}%</TableCell>
                <TableCell align="right" numeric>{formatINR(entry.openingWdv)}</TableCell>
                <TableCell align="right" numeric className="text-red-600 dark:text-red-400">
                  {formatINR(entry.depreciationAmount)}
                </TableCell>
                <TableCell align="right" numeric>{formatINR(entry.closingWdv)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AssetDetailPage({ assetId }: { assetId: string }) {
  const { data, isLoading, isError } = useFixedAsset(assetId);
  const asset = data?.data;

  if (isLoading) {
    return (
      <div className="max-w-5xl">
        <div className="mb-6 h-6 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !asset) {
    return <p className="text-sm text-red-500">Asset not found.</p>;
  }

  const depEntries: DepreciationEntry[] = asset.depreciationEntries ?? [];
  const accumulatedDep = asset.accumulatedDepreciation;
  const currentWdv = asset.currentWdv;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={asset.name}
        breadcrumbs={[
          { label: 'Fixed Assets', href: '/fa' },
          { label: 'Asset Register', href: '/fa/assets' },
          { label: asset.assetCode },
        ]}
        actions={
          <Badge variant={STATUS_VARIANT[asset.status] ?? 'default'}>{asset.status}</Badge>
        }
      />

      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard title="Acquisition Cost" value={asset.acquisitionCost} />
        <StatsCard title="Accumulated Depreciation" value={accumulatedDep} />
        <StatsCard title="Current WDV" value={currentWdv} />
      </div>

      <div className="flex flex-col gap-4">
        <AssetInfoCard asset={asset} />
        <DepreciationTable entries={depEntries} />
      </div>
    </div>
  );
}

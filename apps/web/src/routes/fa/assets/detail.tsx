import { useState } from 'react';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ExternalLink, ArrowLeft } from 'lucide-react';
import {
  useFixedAsset, useDisposeAsset, useTransferAsset,
} from '@/hooks/queries/use-fixed-assets';
import type { FixedAssetWithDepreciation, DepreciationEntry } from '@runq/types';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Badge, Card, CardHeader, CardContent, StatsCard,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  Button, Input, DateInput, useToast,
} from '@/components/ui';

const STATUS_VARIANT: Record<string, React.ComponentProps<typeof Badge>['variant']> = {
  active: 'success',
  disposed: 'outline',
  written_off: 'warning',
  cwip: 'default',
};

// ─── Disposal Dialog ──────────────────────────────────────────────────────────

function DisposeDialog({
  assetId,
  onClose,
}: {
  assetId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const mutation = useDisposeAsset();
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<{ profitLoss: number; journalEntryId?: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { id: assetId, data: { disposalDate: date, disposalAmount: Number(amount), disposalNotes: notes || undefined } },
      {
        onSuccess: (res) => {
          setResult((res as any).data);
          toast('Asset disposed successfully', 'success');
        },
        onError: (err: any) => toast(err?.message ?? 'Disposal failed', 'error'),
      },
    );
  }

  if (result) {
    const isProfit = result.profitLoss >= 0;
    return (
      <Card className="mt-4 border-green-200 dark:border-green-800">
        <CardHeader title="Disposal Recorded" />
        <CardContent>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Profit / Loss</p>
              <p className={`font-semibold ${isProfit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isProfit ? '+' : ''}{formatINR(result.profitLoss)}
              </p>
            </div>
            {result.journalEntryId && (
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Journal Entry</p>
                <Link to={`/finance/gl/journal-entries/${result.journalEntryId}` as '/'} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
                  View JE <ExternalLink size={12} />
                </Link>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader title="Dispose Asset" />
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
          <DateInput label="Disposal Date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Sale Amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" loading={mutation.isPending}>Confirm Disposal</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Transfer Dialog ──────────────────────────────────────────────────────────

function TransferDialog({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const { toast } = useToast();
  const mutation = useTransferAsset();
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { id: assetId, data: { toLocation: location, transferDate: date, notes: notes || undefined } },
      {
        onSuccess: () => { toast('Asset transferred successfully', 'success'); onClose(); },
        onError: (err: any) => toast(err?.message ?? 'Transfer failed', 'error'),
      },
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader title="Transfer Asset" />
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
          <Input label="New Location" required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Warehouse B" />
          <DateInput label="Transfer Date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" loading={mutation.isPending}>Confirm Transfer</Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Transfer History ─────────────────────────────────────────────────────────

function TransferHistoryTable({ transfers }: { transfers: any[] }) {
  if (!transfers || transfers.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Transfer History" />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <tr>
              <Th>Date</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th>Notes</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {transfers.map((t, i) => (
              <TableRow key={t.id ?? i}>
                <TableCell>{t.transferDate}</TableCell>
                <TableCell>{t.fromLocation ?? '—'}</TableCell>
                <TableCell>{t.toLocation ?? '—'}</TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{t.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ─── Asset Info ───────────────────────────────────────────────────────────────

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

// ─── Depreciation Table ───────────────────────────────────────────────────────

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
  const navigate = useNavigate();
  const router = useRouter();
  function goBack(): void {
    if (router.history.canGoBack()) router.history.back();
    else navigate({ to: '/finance/fa/assets' });
  }
  const { data, isLoading, isError } = useFixedAsset(assetId);
  const asset = data?.data;
  const [showDispose, setShowDispose] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

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
  const transfers: any[] = (asset as any).transfers ?? [];
  const isActive = asset.status === 'active';
  const disposal = (asset as any).disposal;

  return (
    <div className="max-w-5xl">
      <PageHeader fullWidth
        title={asset.name}
        breadcrumbs={[
          { label: 'Fixed Assets', href: '/fa' },
          { label: 'Asset Register', href: '/fa/assets' },
          { label: asset.assetCode },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goBack}>
              <ArrowLeft size={14} /> Back
            </Button>
            {isActive && (
              <>
                <Button size="sm" variant="outline" onClick={() => { setShowTransfer((v) => !v); setShowDispose(false); }}>
                  Transfer
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowDispose((v) => !v); setShowTransfer(false); }}>
                  Dispose
                </Button>
              </>
            )}
            <Badge variant={STATUS_VARIANT[asset.status] ?? 'default'}>{asset.status}</Badge>
          </div>
        }
      />

      {showDispose && <DisposeDialog assetId={assetId} onClose={() => setShowDispose(false)} />}
      {showTransfer && <TransferDialog assetId={assetId} onClose={() => setShowTransfer(false)} />}

      {disposal && (
        <Card className="mb-4 border-zinc-300 dark:border-zinc-600">
          <CardHeader title="Disposal Information" />
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Disposal Date</dt>
                <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{disposal.disposalDate}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sale Amount</dt>
                <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">{formatINR(disposal.saleAmount ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Profit / Loss</dt>
                <dd className={`mt-0.5 font-semibold ${(disposal.profitLoss ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {(disposal.profitLoss ?? 0) >= 0 ? '+' : ''}{formatINR(disposal.profitLoss ?? 0)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard title="Acquisition Cost" value={asset.acquisitionCost} />
        <StatsCard title="Accumulated Depreciation" value={asset.accumulatedDepreciation} />
        <StatsCard title="Current WDV" value={asset.currentWdv} />
      </div>

      <div className="flex flex-col gap-4">
        <AssetInfoCard asset={asset} />
        <DepreciationTable entries={depEntries} />
        <TransferHistoryTable transfers={transfers} />
      </div>
    </div>
  );
}

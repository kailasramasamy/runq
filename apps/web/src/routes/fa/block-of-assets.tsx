import { useState } from 'react';
import { useBlockOfAssets } from '@/hooks/queries/use-fixed-assets';
import { formatINR } from '@/lib/utils';
import {
  PageHeader, Card, CardContent, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th,
  TableSkeleton,
} from '@/components/ui';

const FY_OPTIONS = [
  { value: '2324', label: 'FY 2023–24' },
  { value: '2425', label: 'FY 2024–25' },
  { value: '2526', label: 'FY 2025–26' },
  { value: '2627', label: 'FY 2026–27' },
];

export function BlockOfAssetsPage() {
  const [fy, setFy] = useState('2526');
  const { data, isLoading, isError } = useBlockOfAssets(fy);
  const rows: any[] = data?.data ?? [];

  const totals = rows.reduce(
    (acc, r) => ({
      openingWdv: acc.openingWdv + Number(r.openingWdv ?? 0),
      additions: acc.additions + Number(r.additions ?? 0),
      disposals: acc.disposals + Number(r.disposals ?? 0),
      depreciation: acc.depreciation + Number(r.depreciation ?? 0),
      closingWdv: acc.closingWdv + Number(r.closingWdv ?? 0),
    }),
    { openingWdv: 0, additions: 0, disposals: 0, depreciation: 0, closingWdv: 0 },
  );

  return (
    <div className="max-w-6xl">
      <PageHeader fullWidth
        title="Block of Assets"
        description="IT Act depreciation by asset block for the selected financial year."
        breadcrumbs={[{ label: 'Fixed Assets', href: '/fa' }, { label: 'Block of Assets' }]}
      />

      <Card className="mb-6">
        <CardContent>
          <div className="min-w-[200px] max-w-xs">
            <Combobox label="Financial Year" options={FY_OPTIONS} value={fy} onChange={setFy} />
          </div>
        </CardContent>
      </Card>

      {isError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">Failed to load block of assets data.</p>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <tr>
              <Th>Category</Th>
              <Th align="right">IT Act Rate</Th>
              <Th align="right">Opening WDV</Th>
              <Th align="right">Additions</Th>
              <Th align="right">Disposals</Th>
              <Th align="right">Depreciation</Th>
              <Th align="right">Closing WDV</Th>
              <Th align="right">Assets</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={5} cols={8} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No data for selected financial year.
                </td>
              </tr>
            ) : (
              <>
                {rows.map((row) => (
                  <TableRow key={row.categoryId ?? row.category}>
                    <TableCell className="font-medium">{row.categoryName ?? row.category}</TableCell>
                    <TableCell align="right" numeric>{row.itActRate ?? '—'}%</TableCell>
                    <TableCell align="right" numeric>{formatINR(row.openingWdv ?? 0)}</TableCell>
                    <TableCell align="right" numeric>{formatINR(row.additions ?? 0)}</TableCell>
                    <TableCell align="right" numeric>{formatINR(row.disposals ?? 0)}</TableCell>
                    <TableCell align="right" numeric className="text-red-600 dark:text-red-400">
                      {formatINR(row.depreciation ?? 0)}
                    </TableCell>
                    <TableCell align="right" numeric>{formatINR(row.closingWdv ?? 0)}</TableCell>
                    <TableCell align="right" numeric>{row.assetCount ?? 0}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-zinc-300 dark:border-zinc-600 font-semibold bg-zinc-50 dark:bg-zinc-800/50">
                  <TableCell colSpan={2} className="text-sm text-zinc-700 dark:text-zinc-300">Total</TableCell>
                  <TableCell align="right" numeric>{formatINR(totals.openingWdv)}</TableCell>
                  <TableCell align="right" numeric>{formatINR(totals.additions)}</TableCell>
                  <TableCell align="right" numeric>{formatINR(totals.disposals)}</TableCell>
                  <TableCell align="right" numeric className="text-red-600 dark:text-red-400">
                    {formatINR(totals.depreciation)}
                  </TableCell>
                  <TableCell align="right" numeric>{formatINR(totals.closingWdv)}</TableCell>
                  <TableCell />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

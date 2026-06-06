import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Truck, Trash2 } from 'lucide-react';
import {
  PageHeader, Button, Card, CardHeader, CardContent,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, EmptyState,
  Combobox, DateInput, useToast, ConfirmationDialog,
} from '@/components/ui';
import { useWarehouses } from '@/hooks/queries/use-inventory';
import {
  useDirectReceipts,
  useCancelDirectReceipt,
} from '@/hooks/queries/use-direct-receipts';
import { formatINR } from '@/lib/utils';

export function DirectReceiptListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  // Default to last 30 days — matches the rest of the app and keeps a
  // freshly-posted receipt visible even if its receivedAt was backdated.
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [warehouseId, setWarehouseId] = useState('');
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [page, setPage] = useState(1);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const { data: warehouses = [] } = useWarehouses();
  const warehouseOptions = [
    { value: '', label: 'All warehouses' },
    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
  ];
  const { data, isLoading } = useDirectReceipts({
    warehouseId: warehouseId || undefined,
    dateFrom,
    dateTo,
    page,
    limit: 50,
  });
  const cancelM = useCancelDirectReceipt();

  const rows = data?.data ?? [];

  function handleConfirmCancel() {
    if (!cancelId) return;
    cancelM.mutate(cancelId, {
      onSuccess: () => { toast('Receipt reversed', 'success'); setCancelId(null); },
      onError: (err) => toast((err as Error).message || 'Failed to reverse', 'error'),
    });
  }

  return (
    <div>
      <PageHeader
        fullWidth
        breadcrumbs={[{ label: 'Purchase', href: '/purchase' }, { label: 'Direct Receipts' }]}
        title="Direct Receipts"
        description="Memo qty entry — no bill, no JE. Use for daily milk arrivals or any vendor-less stock-in."
        actions={
          <Button onClick={() => navigate({ to: '/purchase/direct/new' })}>
            <Plus size={13} className="mr-1" />
            New receipt
          </Button>
        }
      />

      <Card className="mb-3">
        <CardHeader title="Filter" />
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 max-w-3xl">
            <Combobox
              label="Warehouse"
              options={warehouseOptions}
              value={warehouseId}
              onChange={(v) => { setWarehouseId(v); setPage(1); }}
              placeholder="All warehouses"
            />
            <DateInput
              label="From"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            />
            <DateInput
              label="To"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="px-2 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No direct receipts in this range"
          description="Record a receipt to see it here."
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <Th>GRN #</Th>
              <Th>Date</Th>
              <Th>Item</Th>
              <Th>Source</Th>
              <Th>Warehouse</Th>
              <Th>Batch</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Value</Th>
              <Th>Status</Th>
              <Th className="w-[40px]" />
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <span className="num text-[12px]" style={{ color: 'var(--accent-text)' }}>{r.grnNo}</span>
                </TableCell>
                <TableCell numeric style={{ color: 'var(--text-2)' }}>{r.receivedAt}</TableCell>
                <TableCell>{r.itemName}</TableCell>
                <TableCell style={{ color: 'var(--text-2)' }}>{r.sourceLabel ?? '—'}</TableCell>
                <TableCell style={{ color: 'var(--text-2)' }}>{r.warehouseName}</TableCell>
                <TableCell style={{ color: 'var(--text-2)' }}>{r.batchNo ?? '—'}</TableCell>
                <TableCell align="right" numeric>{r.qty}</TableCell>
                <TableCell align="right" numeric>{formatINR(r.unitRate)}</TableCell>
                <TableCell align="right" numeric className="font-semibold">{formatINR(r.lineTotal)}</TableCell>
                <TableCell>
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={r.status === 'cancelled'
                      ? { background: 'rgba(220, 38, 38, 0.10)', color: '#dc2626' }
                      : { background: 'rgba(22, 163, 74, 0.10)', color: '#16a34a' }}
                  >
                    {r.status === 'cancelled' ? 'Reversed' : 'Posted'}
                  </span>
                </TableCell>
                <TableCell align="right">
                  {r.status !== 'cancelled' && (
                    <Button
                      variant="ghost" size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => setCancelId(r.id)}
                      title="Reverse"
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmationDialog
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={handleConfirmCancel}
        title="Reverse this receipt?"
        description="The stock movement will be reversed (the on-hand qty drops by the same amount). The GRN row stays for audit; status becomes Reversed."
        confirmLabel="Reverse"
        loading={cancelM.isPending}
      />
    </div>
  );
}

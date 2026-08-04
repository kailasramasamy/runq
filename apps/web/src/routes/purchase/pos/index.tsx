import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, ShoppingCart, Search } from 'lucide-react';
import { usePurchaseOrders } from '@/hooks/queries/use-purchase-orders';
import { useVendors } from '@/hooks/queries/use-vendors';
import {
  PageHeader, Button, Input, Combobox,
  Table, TableHeader, TableBody, TableRow, TableCell, Th, EmptyState,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: '',                                    label: 'All' },
  { key: 'draft',                               label: 'Draft' },
  { key: 'sent,partially_received',             label: 'Open' },
  { key: 'received',                            label: 'Received' },
  { key: 'closed',                              label: 'Closed' },
  { key: 'cancelled',                           label: 'Cancelled' },
];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partial',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const STATUS_TONE: Record<string, string> = {
  draft: 'var(--surface-2)',
  sent: 'rgba(37, 99, 235, 0.10)',
  partially_received: 'rgba(234, 88, 12, 0.10)',
  received: 'rgba(22, 163, 74, 0.10)',
  closed: 'rgba(124, 58, 237, 0.10)',
  cancelled: 'rgba(220, 38, 38, 0.10)',
};

const STATUS_TEXT: Record<string, string> = {
  draft: 'var(--text-2)',
  sent: '#2563eb',
  partially_received: '#ea580c',
  received: '#16a34a',
  closed: '#6d28d9',
  cancelled: '#dc2626',
};

export function PurchaseOrderListPage() {
  const navigate = useNavigate();
  const [statusKey, setStatusKey] = useState('');
  const [search, setSearch] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [page, setPage] = useState(1);

  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendorOptions = [
    { value: '', label: 'All vendors' },
    ...(vendorsData?.data?.filter((v) => v.isActive).map((v) => ({ value: v.id, label: v.name })) ?? []),
  ];

  const { data, isLoading } = usePurchaseOrders({
    status: statusKey || undefined,
    search: search || undefined,
    vendorId: vendorId || undefined,
    page,
    limit: 25,
  });

  const rows = data?.data ?? [];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Purchase', href: '/purchase' }, { label: 'Purchase Orders' }]}
        title="Purchase Orders"
        description="Formal commitments to vendors."
        actions={
          <Button onClick={() => navigate({ to: '/purchase/pos/new' })}>
            <Plus size={13} className="mr-1" />
            New PO
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setStatusKey(tab.key); setPage(1); }}
            className="rounded-full border px-3 py-1 text-[12px] font-medium"
            style={{
              background: statusKey === tab.key ? 'var(--accent)' : 'var(--surface)',
              borderColor: statusKey === tab.key ? 'var(--accent)' : 'var(--border)',
              color: statusKey === tab.key ? '#fff' : 'var(--text-2)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_280px]">
        <Input
          placeholder="Search by PO number or vendor name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          icon={<Search size={14} />}
        />
        <Combobox
          options={vendorOptions}
          value={vendorId}
          onChange={(v) => { setVendorId(v); setPage(1); }}
          placeholder="Filter by vendor…"
        />
      </div>

      {isLoading ? (
        <p className="px-2 py-6 text-center text-[12px]" style={{ color: 'var(--text-3)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No purchase orders yet"
          description="Create your first PO to commit to a vendor."
        />
      ) : (
        <Table>
          <TableHeader>
            <tr>
              <Th>PO #</Th>
              <Th>Vendor</Th>
              <Th>Date</Th>
              <Th>Expected</Th>
              <Th align="right">Lines</Th>
              <Th align="right">Total</Th>
              <Th>Status</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((po) => (
              <TableRow
                key={po.id}
                onClick={() => navigate({ to: '/purchase/pos/$poId', params: { poId: po.id } })}
              >
                <TableCell>
                  <span className="num text-[12.5px] font-medium" style={{ color: 'var(--accent-text)' }}>
                    {po.poNumber}
                  </span>
                </TableCell>
                <TableCell>{po.vendorName}</TableCell>
                <TableCell numeric style={{ color: 'var(--text-2)' }}>{po.poDate}</TableCell>
                <TableCell numeric style={{ color: 'var(--text-2)' }}>{po.expectedDate ?? '—'}</TableCell>
                <TableCell align="right" numeric>{po.lineCount}</TableCell>
                {/* Unpriced POs (the norm now — rate lands with the vendor
                    bill) show a dash rather than a misleading ₹0. */}
                <TableCell align="right" numeric className="font-semibold">
                  {po.total > 0 ? formatINR(po.total) : '—'}
                </TableCell>
                <TableCell>
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: STATUS_TONE[po.status] ?? 'var(--surface-2)',
                      color: STATUS_TEXT[po.status] ?? 'var(--text-2)',
                    }}
                  >
                    {STATUS_LABEL[po.status] ?? po.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

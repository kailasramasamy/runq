import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2, X, Download, FileText } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Button, Badge, Input, Textarea, Combobox, DateInput,
  TableSkeleton, useToast,
} from '@/components/ui';
import {
  PageHeader, Button as ArButton, StatTile, StatusBadge,
  Table, TableHeader, Th, TableBody, TableRow, TableCell,
  EmptyState, formatDate,
} from '@/components/ar/primitives';
import { formatINR, formatINRShort } from '@/lib/utils';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useItems } from '@/hooks/queries/use-items';
import type { Item } from '@/hooks/queries/use-items';
import { resolvePrice, type PriceSource } from '@/hooks/queries/use-price-lists';
import {
  useSalesOrders, useCreateSalesOrder, useConvertSOToInvoice,
  type SalesOrder, type SalesOrderStatus,
} from '@/hooks/queries/use-sales-orders';

type BadgeVariant = 'default' | 'info' | 'success' | 'danger' | 'outline' | 'primary' | 'warning' | 'cyan';

const STATUS_BADGE: Record<SalesOrderStatus, { variant: BadgeVariant; label: string }> = {
  draft: { variant: 'default', label: 'Draft' },
  confirmed: { variant: 'info', label: 'Confirmed' },
  fulfilled: { variant: 'success', label: 'Fulfilled' },
  cancelled: { variant: 'outline', label: 'Cancelled' },
  converted: { variant: 'cyan', label: 'Converted' },
};

interface LineItemRow { itemId: string; description: string; qty: string; unitPrice: string; priceSource?: PriceSource; priceListName?: string | null }

const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  customer: 'Customer pricing',
  customer_group: 'Group pricing',
  all: 'Standard pricing',
  item_default: 'Item default',
};

// ─── Create Form ─────────────────────────────────────────────────────────────

export function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateSalesOrder();
  const { toast } = useToast();
  const { data: customersData } = useCustomers({ limit: 100 });
  const customerOptions = (customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const { data: itemsData } = useItems({ limit: 100 });
  const allItems: Item[] = itemsData?.data?.filter((i) => i.isActive) ?? [];
  const itemOptions = allItems.map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` (${i.sku})` : ''}` }));

  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItemRow[]>([{ itemId: '', description: '', qty: '1', unitPrice: '' }]);

  function addItem() { setItems((p) => [...p, { itemId: '', description: '', qty: '1', unitPrice: '' }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, f: keyof LineItemRow, v: string) {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [f]: v } : it)));
  }
  async function selectItem(idx: number, itemId: string) {
    const item = allItems.find((i) => i.id === itemId);
    setItems((p) => p.map((it, i) => i === idx ? {
      ...it,
      itemId,
      description: item?.name ?? it.description,
      unitPrice: item?.defaultSellingPrice != null ? String(item.defaultSellingPrice) : it.unitPrice,
      priceSource: undefined,
      priceListName: null,
    } : it));

    if (customerId && itemId) {
      try {
        const qty = parseFloat(items[idx]?.qty ?? '1') || 1;
        const resolved = await resolvePrice({ customerId, itemId, quantity: qty });
        if (resolved) {
          setItems((p) => p.map((it, i) => i === idx ? {
            ...it,
            unitPrice: String(resolved.effectiveRate),
            priceSource: resolved.source,
            priceListName: resolved.priceListName,
          } : it));
        }
      } catch {
        // ignore — keep the item default
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) { toast('Please select a customer', 'error'); return; }
    if (!items.some((it) => it.itemId && it.unitPrice)) { toast('Add at least one line item', 'error'); return; }
    try {
      await create.mutateAsync({
        customerId,
        orderDate,
        lineItems: items.filter((it) => it.itemId).map((it) => {
          const master = allItems.find((m) => m.id === it.itemId);
          return {
            description: it.description || master?.name || '',
            quantity: Number(it.qty),
            unitPrice: Number(it.unitPrice),
          };
        }),
        ...(notes ? { notes } : {}),
      });
      toast('Sales order created', 'success');
      onClose();
    } catch {
      toast('Failed to create sales order', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Sales Order</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Combobox label="Customer" options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Select customer..." required />
          <DateInput label="Order Date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Line Items</label>
            <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus size={14} /> Add Item</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_5rem_7rem] sm:items-end">
                  <Combobox label="Item" options={itemOptions} value={item.itemId} onChange={(v) => selectItem(idx, v)} placeholder="Search item..." required />
                  <Input label="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="Optional details..." />
                  <Input label="Qty" type="number" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} required />
                  <Input label="Unit Price" type="number" value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} required placeholder="0.00" />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {formatINR(Number(item.qty || 0) * Number(item.unitPrice || 0))}
                    </div>
                    {item.priceSource && item.priceSource !== 'item_default' && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        {PRICE_SOURCE_LABEL[item.priceSource]}
                        {item.priceListName ? ` · ${item.priceListName}` : ''}
                      </span>
                    )}
                  </div>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={14} /></Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." />

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Create Order</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function DetailView({ order, onClose }: { order: SalesOrder; onClose: () => void }) {
  const convert = useConvertSOToInvoice();
  const { toast } = useToast();
  const statusInfo = STATUS_BADGE[order.status];

  async function handleConvert() {
    try { await convert.mutateAsync(order.id); toast('Converted to invoice', 'success'); onClose(); }
    catch { toast('Failed to convert', 'error'); }
  }

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {order.orderNumber} <Badge variant={statusInfo.variant} className="ml-2">{statusInfo.label}</Badge>
        </h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"><X size={14} /></button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-zinc-500">Customer</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{order.customerName}</p></div>
        <div><p className="text-xs text-zinc-500">Order Date</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{order.orderDate}</p></div>
        <div><p className="text-xs text-zinc-500">Total</p><p className="font-medium text-zinc-900 dark:text-zinc-100">{formatINR(order.totalAmount)}</p></div>
      </div>
      <Table>
        <TableHeader><tr><Th>Description</Th><Th align="right">Qty</Th><Th align="right">Unit Price</Th><Th align="right">Amount</Th></tr></TableHeader>
        <TableBody>
          {(order.lineItems ?? []).map((li, i) => (
            <TableRow key={i}><TableCell>{li.description}</TableCell><TableCell align="right" numeric>{li.quantity}</TableCell><TableCell align="right" numeric>{formatINR(li.unitPrice)}</TableCell><TableCell align="right" numeric>{formatINR(li.amount)}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
      {order.status === 'confirmed' && (
        <div className="mt-3">
          <Button size="sm" onClick={handleConvert} loading={convert.isPending}><FileText size={14} /> Convert to Invoice</Button>
        </div>
      )}
    </div>
  );
}

// ─── Sales Order Card (mobile) ───────────────────────────────────────────────

const CARD_BASE = 'cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800';

function SalesOrderCard({ o, onClick }: { o: SalesOrder; onClick: () => void }) {
  const si = STATUS_BADGE[o.status];
  return (
    <div className={CARD_BASE} onClick={onClick}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-500">{o.orderNumber}</span>
        <Badge variant={si.variant}>{si.label}</Badge>
      </div>
      <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">{o.customerName}</p>
      <div className="mt-1 flex items-center">
        <span className="text-xs text-zinc-500">{o.orderDate}</span>
        <span className="ml-auto font-mono text-sm">{formatINR(o.totalAmount)}</span>
      </div>
      {o.status === 'confirmed' && (
        <div className="mt-1">
          <Badge variant="info">Ready to convert</Badge>
        </div>
      )}
    </div>
  );
}

// ─── Sales Orders section + page ────────────────────────────────────────────

export function useOrdersKpis() {
  const { data } = useSalesOrders();
  const orders = data?.data ?? [];
  const openCount = orders.filter((o) => o.status === 'confirmed').length;
  const openTotal = orders.filter((o) => o.status === 'confirmed').reduce((a, o) => a + o.totalAmount, 0);
  const fulfilledCount = orders.filter((o) => o.status === 'fulfilled').length;
  const draftCount = orders.filter((o) => o.status === 'draft').length;
  return { orders, openCount, openTotal, fulfilledCount, draftCount };
}

export function SalesOrdersSection() {
  const navigate = useNavigate();
  const { data, isLoading } = useSalesOrders();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orders = data?.data ?? [];
  const selected = selectedId ? orders.find((o) => o.id === selectedId) : null;

  return (
    <>
      {selected && <DetailView order={selected} onClose={() => setSelectedId(null)} />}

      <Table>
        <TableHeader>
          <tr>
            <Th>Order #</Th>
            <Th>Customer</Th>
            <Th>Issued</Th>
            <Th align="right">Total</Th>
            <Th>Status</Th>
            <Th align="right" />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : orders.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyState
                  icon={<FileText size={18} />}
                  title="No sales orders yet"
                  description="Create a sales order to lock in a confirmed customer commitment."
                  action={<ArButton size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ar/sales-orders/new' as never })}>New order</ArButton>}
                />
              </td>
            </tr>
          ) : orders.map((o) => (
            <TableRow key={o.id} onClick={() => setSelectedId(o.id)}>
              <TableCell>
                <span className="num text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>{o.orderNumber}</span>
              </TableCell>
              <TableCell>
                <span className="font-medium" style={{ color: 'var(--text-1)' }}>{o.customerName}</span>
              </TableCell>
              <TableCell numeric style={{ color: 'var(--text-2)' }}>{formatDate(o.orderDate)}</TableCell>
              <TableCell align="right" numeric className="font-semibold">{formatINR(o.totalAmount)}</TableCell>
              <TableCell><StatusBadge status={o.status} /></TableCell>
              <TableCell align="right">
                {o.status === 'confirmed' && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <ArButton size="sm" variant="outline" icon={<FileText size={12} />} onClick={() => setSelectedId(o.id)}>
                      Convert
                    </ArButton>
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

// Stand-alone Sales Orders page
export function SalesOrdersPage() {
  const navigate = useNavigate();
  const { orders, openCount, openTotal, fulfilledCount, draftCount } = useOrdersKpis();

  return (
    <div>
      <PageHeader fullWidth
        title="Sales orders"
        breadcrumbs={[{ label: 'AR', href: '/ar' }, { label: 'Sales orders' }]}
        description="Manage confirmed sales orders and convert them to invoices."
        actions={
          <>
            <ArButton variant="outline" size="sm" icon={<Download size={13} />} onClick={() => downloadCSV('sales-orders.csv', ['Order#', 'Date', 'Customer', 'Amount', 'Status'], orders.map(o => [o.orderNumber, o.orderDate, o.customerName, String(o.totalAmount), o.status]))}>
              Export
            </ArButton>
            <ArButton size="sm" icon={<Plus size={13} />} onClick={() => navigate({ to: '/finance/ar/sales-orders/new' as never })}>New order</ArButton>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open orders" value={openCount} sub={formatINRShort(openTotal)} />
        <StatTile label="Fulfilled" value={fulfilledCount} sub="Delivered to customer" tone="pos" />
        <StatTile label="Drafts" value={draftCount} sub="Awaiting confirmation" />
        <StatTile label="Total orders" value={orders.length} sub="In view" />
      </div>

      <SalesOrdersSection />
    </div>
  );
}

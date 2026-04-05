import { useState } from 'react';
import { Plus, Trash2, X, Download, FileText } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Textarea, Combobox, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { useCustomers } from '@/hooks/queries/use-customers';
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

interface LineItemRow { description: string; qty: string; unitPrice: string }

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateSalesOrder();
  const { toast } = useToast();
  const { data: customersData } = useCustomers({ limit: 200 });
  const customerOptions = (customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const [customerId, setCustomerId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItemRow[]>([{ description: '', qty: '1', unitPrice: '' }]);

  function addItem() { setItems((p) => [...p, { description: '', qty: '1', unitPrice: '' }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, f: keyof LineItemRow, v: string) {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [f]: v } : it)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        customerId,
        orderDate,
        lineItems: items.map((it) => ({
          description: it.description,
          quantity: Number(it.qty),
          unitPrice: Number(it.unitPrice),
        })),
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
          <Combobox label="Customer" options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Select customer..." />
          <DateInput label="Order Date" value={orderDate} onChange={setOrderDate} required />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Line Items</label>
            <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus size={14} /> Add Item</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <Input label="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required placeholder="Item description" />
                <Input label="Qty" type="number" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} required />
                <Input label="Unit Price" type="number" value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} required placeholder="0.00" />
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap pb-2">
                  {formatINR(Number(item.qty || 0) * Number(item.unitPrice || 0))}
                </div>
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500"><Trash2 size={14} /></Button>
                )}
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

// ─── Sales Orders Page ───────────────────────────────────────────────────────

export function SalesOrdersPage() {
  const { data, isLoading } = useSalesOrders();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orders = data?.data ?? [];
  const selected = selectedId ? orders.find((o) => o.id === selectedId) : null;

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        breadcrumbs={[{ label: 'AR' }, { label: 'Sales Orders' }]}
        description="Manage confirmed sales orders and convert them to invoices."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('sales-orders.csv', ['Order#', 'Date', 'Customer', 'Amount', 'Status'], orders.map(o => [o.orderNumber, o.orderDate, o.customerName, String(o.totalAmount), o.status]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate((v) => !v)}><Plus size={14} /> New Order</Button>
          </div>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}
      {selected && <DetailView order={selected} onClose={() => setSelectedId(null)} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr><Th>Order#</Th><Th>Date</Th><Th>Customer</Th><Th align="right">Amount</Th><Th>Status</Th><Th align="right">Actions</Th></tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : orders.length === 0 ? (
                <TableEmpty colSpan={6} message="No sales orders yet." />
              ) : (
                orders.map((o) => {
                  const si = STATUS_BADGE[o.status];
                  return (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => setSelectedId(o.id)}>
                      <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                      <TableCell className="text-zinc-500">{o.orderDate}</TableCell>
                      <TableCell className="font-medium">{o.customerName}</TableCell>
                      <TableCell align="right" numeric>{formatINR(o.totalAmount)}</TableCell>
                      <TableCell><Badge variant={si.variant}>{si.label}</Badge></TableCell>
                      <TableCell align="right">
                        {o.status === 'confirmed' && (
                          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                            <Badge variant="info">Ready to convert</Badge>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

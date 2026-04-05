import { useState } from 'react';
import { Plus, Trash2, CheckCircle, X, Pencil, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card,
  CardContent,
  PageHeader,
  Button,
  Badge,
  Input,
  Textarea,
  Combobox,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableEmpty,
  Th,
  TableSkeleton,
  useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import type { PurchaseRequisition } from '@runq/types';
import { useVendors } from '@/hooks/queries/use-vendors';
import {
  usePurchaseRequisitions,
  useCreateRequisition,
  useApproveRequisition,
  useUpdateRequisition,
} from '@/hooks/queries/use-vendor-management';

function statusVariant(status: string) {
  if (status === 'approved' || status === 'converted') return 'success' as const;
  if (status === 'pending_approval' || status === 'draft') return 'warning' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'default' as const;
}

interface ItemRow {
  itemName: string;
  quantity: string;
  estimatedUnitPrice: string;
}

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({ onClose }: { onClose: () => void }) {
  const create = useCreateRequisition();
  const { toast } = useToast();
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendorOptions = [
    { value: '', label: 'No vendor (optional)' },
    ...(vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name })),
  ];
  const [vendorId, setVendorId] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<ItemRow[]>([
    { itemName: '', quantity: '1', estimatedUnitPrice: '' },
  ]);

  function addItem() {
    setItems((prev) => [...prev, { itemName: '', quantity: '1', estimatedUnitPrice: '' }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        vendorId: vendorId || undefined,
        description,
        items: items.map((it) => ({
          itemName: it.itemName,
          quantity: Number(it.quantity),
          ...(it.estimatedUnitPrice ? { estimatedUnitPrice: Number(it.estimatedUnitPrice) } : {}),
        })),
      });
      toast('Requisition created', 'success');
      onClose();
    } catch {
      toast('Failed to create requisition', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">New Purchase Requisition</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Combobox label="Vendor (optional)" options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select vendor..." />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Purchase purpose..." />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Items</label>
            <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus size={14} /> Add Item</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <Input label="Item Name" value={item.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)} required placeholder="Item" />
                <Input label="Qty" type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} required />
                <Input label="Unit Price" type="number" value={item.estimatedUnitPrice} onChange={(e) => updateItem(idx, 'estimatedUnitPrice', e.target.value)} placeholder="TBD" />
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500">
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Unit price can be filled in later by procurement before approval.</p>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending} size="sm"><Plus size={14} /> Create Requisition</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Edit Form ──────────────────────────────────────────────────────────────

function EditForm({ requisition, onClose }: { requisition: PurchaseRequisition; onClose: () => void }) {
  const update = useUpdateRequisition();
  const { toast } = useToast();
  const { data: vendorsData } = useVendors({ limit: 100 });
  const vendorOptions = [
    { value: '', label: 'No vendor (optional)' },
    ...(vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name })),
  ];
  const [vendorId, setVendorId] = useState(requisition.vendorId ?? '');
  const [description, setDescription] = useState(requisition.description);
  const [items, setItems] = useState<ItemRow[]>(
    (requisition.items ?? []).map((i) => ({
      itemName: i.itemName,
      quantity: String(i.quantity),
      estimatedUnitPrice: String(i.estimatedUnitPrice),
    })),
  );

  function addItem() {
    setItems((prev) => [...prev, { itemName: '', quantity: '1', estimatedUnitPrice: '' }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: requisition.id,
        data: {
          vendorId: vendorId || null,
          description,
          items: items.map((it) => ({
            itemName: it.itemName,
            quantity: Number(it.quantity),
            estimatedUnitPrice: Number(it.estimatedUnitPrice),
          })),
        },
      });
      toast('Requisition updated', 'success');
      onClose();
    } catch {
      toast('Failed to update requisition', 'error');
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Edit Requisition — {requisition.requisitionNumber}</h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Combobox label="Vendor (optional)" options={vendorOptions} value={vendorId} onChange={setVendorId} placeholder="Select vendor..." />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Purchase purpose..." />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Items</label>
            <Button type="button" variant="ghost" size="sm" onClick={addItem}><Plus size={14} /> Add Item</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
                <Input label="Item Name" value={item.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)} required placeholder="Item" />
                <Input label="Qty" type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} required />
                <Input label="Unit Price" type="number" value={item.estimatedUnitPrice} onChange={(e) => updateItem(idx, 'estimatedUnitPrice', e.target.value)} required placeholder="0.00" />
                {items.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-500">
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={update.isPending} size="sm"><Pencil size={14} /> Save Changes</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Detail View (read-only) ────────────────────────────────────────────────

function DetailView({ requisition, onClose }: { requisition: PurchaseRequisition; onClose: () => void }) {
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {requisition.requisitionNumber}
          <Badge variant={statusVariant(requisition.status)} className="ml-2">{requisition.status}</Badge>
        </h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-zinc-500">Vendor</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{requisition.vendorName ?? requisition.vendorId ?? '-'}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Total Amount</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{formatINR(requisition.totalAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Requested By</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{requisition.requestedByName ?? requisition.requestedBy.slice(0, 8)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Created</p>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{new Date(requisition.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      {requisition.description && (
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{requisition.description}</p>
      )}

      <Table>
        <TableHeader>
          <tr>
            <Th>Item</Th>
            <Th align="right">Qty</Th>
            <Th align="right">Unit Price</Th>
            <Th align="right">Amount</Th>
          </tr>
        </TableHeader>
        <TableBody>
          {(requisition.items ?? []).map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.itemName}</TableCell>
              <TableCell align="right" numeric>{item.quantity}</TableCell>
              <TableCell align="right" numeric>{item.estimatedUnitPrice ? formatINR(item.estimatedUnitPrice) : '-'}</TableCell>
              <TableCell align="right" numeric>{formatINR(item.estimatedAmount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Requisitions Page ───────────────────────────────────────────────────────

export function RequisitionsPage() {
  const { data, isLoading } = usePurchaseRequisitions();
  const approve = useApproveRequisition();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const requisitions = data?.data ?? [];
  const selected = selectedId ? requisitions.find((r) => r.id === selectedId) : null;
  const editable = selected && (selected.status === 'draft' || selected.status === 'pending_approval');

  async function handleApprove(id: string) {
    try {
      await approve.mutateAsync(id);
      toast('Requisition approved', 'success');
    } catch {
      toast('Failed to approve requisition', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Purchase Requisitions"
        breadcrumbs={[{ label: 'Vendor Management' }, { label: 'Requisitions' }]}
        description="Create and approve purchase requisitions before vendor orders."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('purchase-requisitions.csv', ['PR Number', 'Description', 'Vendor', 'Amount', 'Status', 'Requested By'], requisitions.map(r => [r.requisitionNumber, r.description, r.vendorName ?? r.vendorId ?? '', String(r.totalAmount ?? 0), r.status, r.requestedByName ?? r.requestedBy.slice(0, 8)]))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
              <Plus size={14} />
              New Requisition
            </Button>
          </div>
        }
      />

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}

      {selected && editable && (
        <EditForm requisition={selected} onClose={() => setSelectedId(null)} />
      )}

      {selected && !editable && (
        <DetailView requisition={selected} onClose={() => setSelectedId(null)} />
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>PR Number</Th>
                <Th>Description</Th>
                <Th>Vendor</Th>
                <Th align="right">Amount</Th>
                <Th>Status</Th>
                <Th>Requested By</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : requisitions.length === 0 ? (
                <TableEmpty colSpan={7} message="No purchase requisitions yet." />
              ) : (
                requisitions.map((pr) => {
                  const isEditable = pr.status === 'draft' || pr.status === 'pending_approval';
                  return (
                    <TableRow
                      key={pr.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(pr.id)}
                    >
                      <TableCell className="font-mono text-xs">{pr.requisitionNumber}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-medium">{pr.description}</TableCell>
                      <TableCell className="text-zinc-600 dark:text-zinc-400">{pr.vendorName ?? pr.vendorId ?? '-'}</TableCell>
                      <TableCell align="right" numeric>{formatINR(Number(pr.totalAmount ?? 0))}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(pr.status)}>{pr.status}</Badge>
                      </TableCell>
                      <TableCell className="text-zinc-600 dark:text-zinc-400">{pr.requestedByName ?? pr.requestedBy.slice(0, 8)}</TableCell>
                      <TableCell align="right">
                        {isEditable && (
                          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                            <Button variant="outline" size="sm" onClick={() => handleApprove(pr.id)} disabled={approve.isPending}>
                              <CheckCircle size={14} /> Approve
                            </Button>
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

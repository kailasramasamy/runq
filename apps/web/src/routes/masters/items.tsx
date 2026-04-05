import { useState } from 'react';
import { Plus, Trash2, X, Pencil, Download, Power } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, Textarea,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useItems, useCreateItem, useUpdateItem, useToggleItem,
  type Item, type CreateItemInput,
} from '@/hooks/queries/use-items';

function statusVariant(active: boolean) {
  return active ? ('success' as const) : ('default' as const);
}

// ─── Create / Edit Form ─────────────────────────────────────────────────────

function ItemForm({ item, onClose }: { item?: Item; onClose: () => void }) {
  const create = useCreateItem();
  const update = useUpdateItem();
  const { toast } = useToast();
  const isEdit = !!item;

  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [type, setType] = useState<'product' | 'service'>(item?.type ?? 'product');
  const [hsnSacCode, setHsnSacCode] = useState(item?.hsnSacCode ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [defaultSellingPrice, setDefaultSellingPrice] = useState(item?.defaultSellingPrice?.toString() ?? '');
  const [defaultPurchasePrice, setDefaultPurchasePrice] = useState(item?.defaultPurchasePrice?.toString() ?? '');
  const [gstRate, setGstRate] = useState(item?.gstRate?.toString() ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [description, setDescription] = useState(item?.description ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateItemInput = {
      name,
      type,
      ...(sku ? { sku } : {}),
      ...(hsnSacCode ? { hsnSacCode } : {}),
      ...(unit ? { unit } : {}),
      ...(defaultSellingPrice ? { defaultSellingPrice: Number(defaultSellingPrice) } : {}),
      ...(defaultPurchasePrice ? { defaultPurchasePrice: Number(defaultPurchasePrice) } : {}),
      ...(gstRate ? { gstRate: Number(gstRate) } : {}),
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: item.id, data });
        toast('Item updated', 'success');
      } else {
        await create.mutateAsync(data);
        toast('Item created', 'success');
      }
      onClose();
    } catch {
      toast(`Failed to ${isEdit ? 'update' : 'create'} item`, 'error');
    }
  }

  const borderColor = isEdit ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-indigo-200 bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-950/20';

  return (
    <div className={`mb-4 rounded-lg border p-4 ${borderColor}`}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {isEdit ? `Edit Item — ${item.name}` : 'New Item'}
        </h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Item name" />
          <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU code" />
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as 'product' | 'service')}>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input label="HSN/SAC Code" value={hsnSacCode} onChange={(e) => setHsnSacCode(e.target.value)} placeholder="HSN or SAC" />
          <Input label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. nos, kg, hrs" />
          <Input label="Selling Price" type="number" value={defaultSellingPrice} onChange={(e) => setDefaultSellingPrice(e.target.value)} placeholder="0.00" />
          <Input label="Purchase Price" type="number" value={defaultPurchasePrice} onChange={(e) => setDefaultPurchasePrice(e.target.value)} placeholder="0.00" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="GST Rate (%)" type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} placeholder="18" />
          <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Electronics" />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending || update.isPending} size="sm">
            {isEdit ? <><Pencil size={14} /> Save Changes</> : <><Plus size={14} /> Create Item</>}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Items Page ──────────────────────────────────────────────────────────────

export function ItemsPage() {
  const { data, isLoading } = useItems();
  const toggle = useToggleItem();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = data?.data ?? [];
  const editingItem = editingId ? items.find((i) => i.id === editingId) : null;

  async function handleToggle(id: string) {
    try {
      await toggle.mutateAsync(id);
      toast('Item status toggled', 'success');
    } catch {
      toast('Failed to toggle item status', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Item Master"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Items' }]}
        description="Manage products and services used across invoices and bills."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('items.csv', ['Name', 'SKU', 'Type', 'HSN/SAC', 'Unit', 'Selling Price', 'Purchase Price', 'GST%', 'Category', 'Status'], items.map(i => [i.name, i.sku ?? '', i.type, i.hsnSacCode ?? '', i.unit ?? '', String(i.defaultSellingPrice ?? ''), String(i.defaultPurchasePrice ?? ''), String(i.gstRate ?? ''), i.category ?? '', i.isActive ? 'Active' : 'Inactive']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => { setEditingId(null); setShowCreate((v) => !v); }}>
              <Plus size={14} /> New Item
            </Button>
          </div>
        }
      />

      {showCreate && !editingId && <ItemForm onClose={() => setShowCreate(false)} />}
      {editingItem && <ItemForm item={editingItem} onClose={() => setEditingId(null)} />}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <tr>
                <Th>Name</Th>
                <Th>SKU</Th>
                <Th>Type</Th>
                <Th>HSN/SAC</Th>
                <Th>Unit</Th>
                <Th align="right">Selling Price</Th>
                <Th align="right">Purchase Price</Th>
                <Th align="right">GST%</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={10} />
              ) : items.length === 0 ? (
                <TableEmpty colSpan={10} message="No items yet. Create your first item above." />
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => { setShowCreate(false); setEditingId(item.id); }}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.sku ?? '-'}</TableCell>
                    <TableCell><Badge variant={item.type === 'product' ? 'info' : 'primary'}>{item.type}</Badge></TableCell>
                    <TableCell className="text-zinc-500">{item.hsnSacCode ?? '-'}</TableCell>
                    <TableCell>{item.unit ?? '-'}</TableCell>
                    <TableCell align="right" numeric>{item.defaultSellingPrice != null ? formatINR(item.defaultSellingPrice) : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.defaultPurchasePrice != null ? formatINR(item.defaultPurchasePrice) : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.gstRate != null ? `${item.gstRate}%` : '-'}</TableCell>
                    <TableCell><Badge variant={statusVariant(item.isActive)}>{item.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell align="right">
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="sm" onClick={() => handleToggle(item.id)} disabled={toggle.isPending}>
                          <Power size={14} /> {item.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

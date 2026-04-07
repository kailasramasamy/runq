import { useState, useEffect } from 'react';
import { Plus, X, Pencil, Download, Power } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, Textarea,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { HsnSacCombobox } from '@/components/ui/hsn-sac-combobox';
import { Combobox } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  useItems, useCreateItem, useUpdateItem, useToggleItem,
  type Item, type CreateItemInput,
} from '@/hooks/queries/use-items';
import { useCategoryTree } from '@/hooks/queries/use-categories';

function statusVariant(active: boolean) {
  return active ? ('success' as const) : ('default' as const);
}

// ─── Modal Shell ────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Item Form (used inside modal) ──────────────────────────────────────────

function ItemForm({ item, onClose }: { item?: Item; onClose: () => void }) {
  const create = useCreateItem();
  const update = useUpdateItem();
  const { toast } = useToast();
  const { data: treeData } = useCategoryTree();
  const categoryTree = treeData?.data ?? [];
  const isEdit = !!item;

  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [type, setType] = useState<'product' | 'service'>(item?.type ?? 'product');
  const [hsnSacCode, setHsnSacCode] = useState(item?.hsnSacCode ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [defaultSellingPrice, setDefaultSellingPrice] = useState(item?.defaultSellingPrice?.toString() ?? '');
  const [defaultPurchasePrice, setDefaultPurchasePrice] = useState(item?.defaultPurchasePrice?.toString() ?? '');
  const [gstRate, setGstRate] = useState(item?.gstRate?.toString() ?? '');
  const [mrp, setMrp] = useState(item?.mrp?.toString() ?? '');
  const [costPrice, setCostPrice] = useState(item?.costPrice?.toString() ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [subcategory, setSubcategory] = useState(item?.subcategory ?? '');
  const [description, setDescription] = useState(item?.description ?? '');

  const categoryOptions = categoryTree
    .filter((c) => c.isActive)
    .map((c) => ({ value: c.name, label: c.name }));

  const selectedCat = categoryTree.find((c) => c.name === category);
  const subcategoryOptions = (selectedCat?.subcategories ?? [])
    .filter((s) => s.isActive)
    .map((s) => ({ value: s.name, label: s.name }));

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
      ...(mrp ? { mrp: Number(mrp) } : {}),
      ...(costPrice ? { costPrice: Number(costPrice) } : {}),
      ...(category ? { category } : {}),
      ...(subcategory ? { subcategory } : {}),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Basic info */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Basic Info</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Item name" />
          <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU code" />
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as 'product' | 'service')} options={[{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }]} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HsnSacCombobox
            label="HSN/SAC Code"
            value={hsnSacCode}
            type={type === 'service' ? 'sac' : 'hsn'}
            onChange={(code, rate) => {
              setHsnSacCode(code);
              if (rate != null) setGstRate(String(rate));
            }}
          />
          <Input label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. nos, kg, hrs" />
          <Input label="GST Rate (%)" type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} placeholder="18" />
        </div>
      </fieldset>

      {/* Pricing */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Pricing</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Input label="Selling Price" type="number" value={defaultSellingPrice} onChange={(e) => setDefaultSellingPrice(e.target.value)} placeholder="0.00" />
          <Input label="Purchase Price" type="number" value={defaultPurchasePrice} onChange={(e) => setDefaultPurchasePrice(e.target.value)} placeholder="0.00" />
          <Input label="MRP" type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="0.00" />
          <Input label="Cost Price (COGM)" type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" />
        </div>
      </fieldset>

      {/* Classification */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Classification</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Combobox
            label="Category"
            options={categoryOptions}
            value={category}
            onChange={(v) => { setCategory(v); setSubcategory(''); }}
            placeholder="Search categories…"
          />
          <Combobox
            label="Subcategory"
            options={subcategoryOptions}
            value={subcategory}
            onChange={setSubcategory}
            placeholder={category ? 'Search subcategories…' : 'Select category first'}
            disabled={!category}
          />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={1} />
        </div>
      </fieldset>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={create.isPending || update.isPending} size="sm">
          {isEdit ? <><Pencil size={14} /> Save Changes</> : <><Plus size={14} /> Create Item</>}
        </Button>
      </div>
    </form>
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('items.csv', ['Name', 'SKU', 'Type', 'HSN/SAC', 'Unit', 'Selling Price', 'Purchase Price', 'MRP', 'Cost Price', 'GST%', 'Category', 'Subcategory', 'Status'], items.map(i => [i.name, i.sku ?? '', i.type, i.hsnSacCode ?? '', i.unit ?? '', String(i.defaultSellingPrice ?? ''), String(i.defaultPurchasePrice ?? ''), String(i.mrp ?? ''), String(i.costPrice ?? ''), String(i.gstRate ?? ''), i.category ?? '', i.subcategory ?? '', i.isActive ? 'Active' : 'Inactive']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New Item
            </Button>
          </div>
        }
      />

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Item">
        <ItemForm onClose={() => setShowCreate(false)} />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editingItem} onClose={() => setEditingId(null)} title={editingItem ? `Edit — ${editingItem.name}` : ''}>
        {editingItem && <ItemForm key={editingItem.id} item={editingItem} onClose={() => setEditingId(null)} />}
      </Modal>

      {/* Mobile cards */}
      {isLoading ? (
        <div className="space-y-2 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-2 md:hidden">
          {items.map((item) => (
            <div
              key={item.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => setEditingId(item.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{item.name}</p>
                  {item.sku && <p className="font-mono text-xs text-zinc-400">{item.sku}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Badge variant={item.type === 'product' ? 'info' : 'primary'}>{item.type}</Badge>
                  <Badge variant={statusVariant(item.isActive)}>{item.isActive ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{item.defaultSellingPrice != null ? formatINR(item.defaultSellingPrice) : '—'}</span>
                {item.gstRate != null && <span>GST {item.gstRate}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <Card className="hidden md:block">
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
                <Th align="right">MRP</Th>
                <Th align="right">Cost Price</Th>
                <Th align="right">GST%</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={13} />
              ) : items.length === 0 ? (
                <TableEmpty colSpan={13} message="No items yet. Click 'New Item' to get started." />
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => setEditingId(item.id)}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.sku ?? '-'}</TableCell>
                    <TableCell><Badge variant={item.type === 'product' ? 'info' : 'primary'}>{item.type}</Badge></TableCell>
                    <TableCell className="text-zinc-500">{item.hsnSacCode ?? '-'}</TableCell>
                    <TableCell>{item.unit ?? '-'}</TableCell>
                    <TableCell align="right" numeric>{item.defaultSellingPrice != null ? formatINR(item.defaultSellingPrice) : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.defaultPurchasePrice != null ? formatINR(item.defaultPurchasePrice) : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.mrp != null ? formatINR(item.mrp) : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.costPrice != null ? formatINR(item.costPrice) : '-'}</TableCell>
                    <TableCell align="right" numeric>{item.gstRate != null ? `${item.gstRate}%` : '-'}</TableCell>
                    <TableCell className="text-zinc-500">{item.category ?? '-'}{item.subcategory ? ` / ${item.subcategory}` : ''}</TableCell>
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

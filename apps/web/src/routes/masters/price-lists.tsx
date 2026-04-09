import { useState } from 'react';
import { Plus, X, Pencil, Download, Power, Trash2 } from 'lucide-react';
import { downloadCSV } from '@/lib/csv-export';
import {
  Card, CardContent, PageHeader, Button, Badge, Input, Select, DateInput,
  Table, TableHeader, TableBody, TableRow, TableCell, TableEmpty, Th,
  TableSkeleton, useToast,
} from '@/components/ui';
import { formatINR } from '@/lib/utils';
import {
  usePriceLists, usePriceList, useCreatePriceList, useUpdatePriceList, useTogglePriceList,
  type PriceList, type CreatePriceListInput, type PriceListItemInput,
} from '@/hooks/queries/use-price-lists';
import { useItems, type Item } from '@/hooks/queries/use-items';
import { useCustomers } from '@/hooks/queries/use-customers';
import { useVendors } from '@/hooks/queries/use-vendors';

function statusVariant(active: boolean) {
  return active ? ('success' as const) : ('default' as const);
}

function applyToLabel(applyTo: string, value: string | null, customerName?: string | null, vendorName?: string | null) {
  switch (applyTo) {
    case 'all': return 'All';
    case 'customer_group': return `Customers: ${value}`;
    case 'vendor_group': return `Vendors: ${value}`;
    case 'customer': return `Customer: ${customerName ?? value}`;
    case 'vendor': return `Vendor: ${vendorName ?? value}`;
    default: return applyTo;
  }
}

// ─── Line Item Row ──────────────────────────────────────────────────────────

interface LineItemProps {
  line: PriceListItemInput & { _key: string };
  items: Item[];
  listType: 'selling' | 'buying';
  onChange: (key: string, updates: Partial<PriceListItemInput>) => void;
  onRemove: (key: string) => void;
}

function LineItemRow({ line, items, listType, onChange, onRemove }: LineItemProps) {
  const selectedItem = items.find((i) => i.id === line.itemId);
  const showMargin = listType === 'buying';

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800">
      <td className="px-3 py-2">
        <select
          value={line.itemId}
          onChange={(e) => {
            const item = items.find((i) => i.id === e.target.value);
            onChange(line._key, {
              itemId: e.target.value,
              rate: item?.defaultSellingPrice ?? 0,
            });
          }}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">Select item…</option>
          {items.filter((i) => i.isActive).map((i) => (
            <option key={i.id} value={i.id}>{i.name}{i.sku ? ` (${i.sku})` : ''}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-xs text-zinc-500">{selectedItem?.sku ?? '-'}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={line.rate || ''}
          onChange={(e) => onChange(line._key, { rate: Number(e.target.value) })}
          className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-right dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          placeholder="0.00"
        />
      </td>
      {showMargin && (
        <td className="px-3 py-2">
          <input
            type="number"
            value={line.marginPercent ?? ''}
            onChange={(e) => onChange(line._key, { marginPercent: e.target.value ? Number(e.target.value) : null })}
            className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-right dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            placeholder="%"
          />
        </td>
      )}
      <td className="px-3 py-2">
        <input
          type="number"
          value={line.discountPercent ?? ''}
          onChange={(e) => onChange(line._key, { discountPercent: e.target.value ? Number(e.target.value) : null })}
          className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-right dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          placeholder="%"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={line.minQuantity ?? ''}
          onChange={(e) => onChange(line._key, { minQuantity: e.target.value ? Number(e.target.value) : null })}
          className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-right dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button type="button" onClick={() => onRemove(line._key)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

// ─── Create / Edit Form ─────────────────────────────────────────────────────

type LineWithKey = PriceListItemInput & { _key: string };
let lineKeyCounter = 0;
function newLineKey() { return `line-${++lineKeyCounter}`; }

function PriceListForm({ priceList, onClose }: { priceList?: PriceList; onClose: () => void }) {
  const create = useCreatePriceList();
  const update = useUpdatePriceList();
  const { toast } = useToast();
  const { data: itemsData } = useItems({ limit: 100 });
  const allItems = itemsData?.data ?? [];
  const { data: customersData } = useCustomers({ limit: 200 });
  const customerOpts = [
    { value: '', label: 'Select customer…' },
    ...((customersData?.data ?? []).map((c) => ({ value: c.id, label: c.name }))),
  ];
  const { data: vendorsData } = useVendors({ limit: 200 });
  const vendorOpts = [
    { value: '', label: 'Select vendor…' },
    ...((vendorsData?.data ?? []).map((v) => ({ value: v.id, label: v.name }))),
  ];
  const isEdit = !!priceList;

  const [name, setName] = useState(priceList?.name ?? '');
  const [type, setType] = useState<'selling' | 'buying'>(priceList?.type ?? 'selling');
  const [currency, setCurrency] = useState(priceList?.currency ?? 'INR');
  const [applyTo, setApplyTo] = useState(priceList?.applyTo ?? 'all');
  const [applyToValue, setApplyToValue] = useState(priceList?.applyToValue ?? '');
  const [customerId, setCustomerId] = useState(priceList?.customerId ?? '');
  const [vendorId, setVendorId] = useState(priceList?.vendorId ?? '');
  const [validFrom, setValidFrom] = useState(priceList?.validFrom ?? '');
  const [validTo, setValidTo] = useState(priceList?.validTo ?? '');
  const [lines, setLines] = useState<LineWithKey[]>(() =>
    priceList?.items?.length
      ? priceList.items.map((li) => ({
          _key: newLineKey(),
          itemId: li.itemId,
          rate: li.rate,
          marginPercent: li.marginPercent,
          discountPercent: li.discountPercent,
          minQuantity: li.minQuantity,
        }))
      : [{ _key: newLineKey(), itemId: '', rate: 0, marginPercent: null, discountPercent: null, minQuantity: null }],
  );

  function addLine() {
    setLines((prev) => [...prev, { _key: newLineKey(), itemId: '', rate: 0, marginPercent: null, discountPercent: null, minQuantity: null }]);
  }

  function updateLine(key: string, updates: Partial<PriceListItemInput>) {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...updates } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter((l) => l.itemId);
    if (validLines.length === 0) {
      toast('Add at least one item', 'error');
      return;
    }

    const data: CreatePriceListInput = {
      name,
      type,
      currency,
      applyTo,
      ...(applyTo === 'customer_group' || applyTo === 'vendor_group' ? { applyToValue } : {}),
      ...(applyTo === 'customer' && customerId ? { customerId } : {}),
      ...(applyTo === 'vendor' && vendorId ? { vendorId } : {}),
      ...(validFrom ? { validFrom } : {}),
      ...(validTo ? { validTo } : {}),
      items: validLines.map(({ _key, ...rest }) => rest),
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: priceList.id, data });
        toast('Price list updated', 'success');
      } else {
        await create.mutateAsync(data);
        toast('Price list created', 'success');
      }
      onClose();
    } catch {
      toast(`Failed to ${isEdit ? 'update' : 'create'} price list`, 'error');
    }
  }

  const borderColor = isEdit
    ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
    : 'border-indigo-200 bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-950/20';

  return (
    <div className={`mb-4 rounded-lg border p-4 ${borderColor}`}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {isEdit ? `Edit — ${priceList.name}` : 'New Price List'}
        </h4>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Wholesale Rates" />
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as 'selling' | 'buying')} options={[{ value: 'selling', label: 'Selling' }, { value: 'buying', label: 'Buying' }]} />
          <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="INR" />
          <Select
            label="Apply To"
            value={applyTo}
            onChange={(e) => setApplyTo(e.target.value as 'all' | 'customer_group' | 'vendor_group' | 'customer' | 'vendor')}
            options={[
              { value: 'all', label: 'All' },
              { value: 'customer_group', label: 'Customer Group' },
              { value: 'vendor_group', label: 'Vendor Group' },
              { value: 'customer', label: 'Specific Customer' },
              { value: 'vendor', label: 'Specific Vendor' },
            ]}
          />
        </div>

        {(applyTo === 'customer_group' || applyTo === 'vendor_group') && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input label="Group Name" value={applyToValue} onChange={(e) => setApplyToValue(e.target.value)} required placeholder="e.g. Wholesale, Retail" />
          </div>
        )}
        {applyTo === 'customer' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Select
              label="Customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              options={customerOpts}
              required
            />
          </div>
        )}
        {applyTo === 'vendor' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Select
              label="Vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              options={vendorOpts}
              required
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <DateInput label="Valid From" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          <DateInput label="Valid To" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </div>

        {/* Line items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h5 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Items</h5>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus size={14} /> Add Item
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">SKU</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">Rate</th>
                  {type === 'buying' && (
                    <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">Margin%</th>
                  )}
                  <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">Discount%</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">Min Qty</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <LineItemRow
                    key={line._key}
                    line={line}
                    items={allItems}
                    listType={type}
                    onChange={updateLine}
                    onRemove={removeLine}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending || update.isPending} size="sm">
            {isEdit ? <><Pencil size={14} /> Save Changes</> : <><Plus size={14} /> Create Price List</>}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ─── Price Lists Page ───────────────────────────────────────────────────────

export function PriceListsPage() {
  const { data, isLoading } = usePriceLists();
  const toggle = useTogglePriceList();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const priceLists = data?.data ?? [];

  // Fetch full detail when editing (to get line items)
  const { data: editDetail } = usePriceList(editingId);
  const editingPriceList = editDetail?.data ?? null;

  async function handleToggle(id: string) {
    try {
      await toggle.mutateAsync(id);
      toast('Price list status toggled', 'success');
    } catch {
      toast('Failed to toggle status', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Price Lists"
        breadcrumbs={[{ label: 'Masters' }, { label: 'Price Lists' }]}
        description="Manage selling and buying price lists for different customer/vendor groups."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV('price-lists.csv', ['Name', 'Type', 'Currency', 'Apply To', 'Valid From', 'Valid To', 'Items', 'Status'], priceLists.map(p => [p.name, p.type, p.currency, p.applyTo, p.validFrom ?? '', p.validTo ?? '', String(p.itemCount ?? 0), p.isActive ? 'Active' : 'Inactive']))}>
              <Download size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={() => { setEditingId(null); setShowCreate((v) => !v); }}>
              <Plus size={14} /> New Price List
            </Button>
          </div>
        }
      />

      {showCreate && !editingId && <PriceListForm onClose={() => setShowCreate(false)} />}
      {editingId && editingPriceList && <PriceListForm priceList={editingPriceList} onClose={() => setEditingId(null)} />}

      {/* Mobile cards */}
      {isLoading ? (
        <div className="space-y-2 md:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-2 md:hidden">
          {priceLists.map((pl) => (
            <div
              key={pl.id}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:active:bg-zinc-800"
              onClick={() => { setShowCreate(false); setEditingId(pl.id); }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{pl.name}</p>
                <div className="flex gap-1 shrink-0">
                  <Badge variant={pl.type === 'selling' ? 'success' : 'info'}>{pl.type}</Badge>
                  <Badge variant={statusVariant(pl.isActive)}>{pl.isActive ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{applyToLabel(pl.applyTo, pl.applyToValue, pl.customerName, pl.vendorName)}</span>
                <span>{pl.itemCount ?? 0} items</span>
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
                <Th>Type</Th>
                <Th>Currency</Th>
                <Th>Apply To</Th>
                <Th>Valid From</Th>
                <Th>Valid To</Th>
                <Th align="right">Items</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} cols={9} />
              ) : priceLists.length === 0 ? (
                <TableEmpty colSpan={9} message="No price lists yet. Create your first price list above." />
              ) : (
                priceLists.map((pl) => (
                  <TableRow key={pl.id} className="cursor-pointer" onClick={() => { setShowCreate(false); setEditingId(pl.id); }}>
                    <TableCell className="font-medium">{pl.name}</TableCell>
                    <TableCell><Badge variant={pl.type === 'selling' ? 'success' : 'info'}>{pl.type}</Badge></TableCell>
                    <TableCell>{pl.currency}</TableCell>
                    <TableCell className="text-zinc-500">{applyToLabel(pl.applyTo, pl.applyToValue, pl.customerName, pl.vendorName)}</TableCell>
                    <TableCell className="text-zinc-500">{pl.validFrom ?? '-'}</TableCell>
                    <TableCell className="text-zinc-500">{pl.validTo ?? '-'}</TableCell>
                    <TableCell align="right" numeric>{pl.itemCount ?? 0}</TableCell>
                    <TableCell><Badge variant={statusVariant(pl.isActive)}>{pl.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell align="right">
                      <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button variant="outline" size="sm" onClick={() => handleToggle(pl.id)} disabled={toggle.isPending}>
                          <Power size={14} /> {pl.isActive ? 'Deactivate' : 'Activate'}
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

import { useMemo, useState } from 'react';
import { Calculator, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select, Textarea, Combobox, useToast } from '@/components/ui';
import { HsnSacCombobox } from '@/components/ui/hsn-sac-combobox';
import {
  useCreateItem,
  useUpdateItem,
  type Item,
  type CreateItemInput,
} from '@/hooks/queries/use-items';
import { useCategoryTree } from '@/hooks/queries/use-categories';
import { calculatePricing } from '@/lib/item-pricing';
import { formatINR } from '@/lib/utils';

const RTV_OPTIONS = [
  { value: '', label: '—' },
  { value: 'true', label: 'RTV (returnable)' },
  { value: 'false', label: 'Non RTV' },
];

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v: string): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

export function ItemForm({
  item,
  onClose,
  onDelete,
  onOpenAnalysis,
}: {
  item?: Item;
  onClose: () => void;
  onDelete?: () => void;
  onOpenAnalysis?: () => void;
}) {
  const create = useCreateItem();
  const update = useUpdateItem();
  const { toast } = useToast();
  const { data: treeData } = useCategoryTree();
  const categoryTree = treeData?.data ?? [];
  const isEdit = !!item;

  // Basic
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [ean, setEan] = useState(item?.ean ?? '');
  const [type, setType] = useState<'product' | 'service'>(item?.type ?? 'product');
  const [hsnSacCode, setHsnSacCode] = useState(item?.hsnSacCode ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [gstRate, setGstRate] = useState(item?.gstRate?.toString() ?? '');

  // Pricing
  const [defaultSellingPrice, setDefaultSellingPrice] = useState(item?.defaultSellingPrice?.toString() ?? '');
  const [mrp, setMrp] = useState(item?.mrp?.toString() ?? '');
  const [costPrice, setCostPrice] = useState(item?.costPrice?.toString() ?? '');
  const [basicPrice, setBasicPrice] = useState(item?.basicPrice?.toString() ?? '');
  const [gstValue, setGstValue] = useState(item?.gstValue?.toString() ?? '');
  const [margin, setMargin] = useState(item?.margin?.toString() ?? '');

  // Catalogue
  const [brand, setBrand] = useState(item?.brand ?? '');
  const [productType, setProductType] = useState(item?.productType ?? '');
  const [grammage, setGrammage] = useState(item?.grammage ?? '');
  const [packingType, setPackingType] = useState(item?.packingType ?? '');
  const [vendorPackSize, setVendorPackSize] = useState(item?.vendorPackSize ?? '');
  const [packagingDimension, setPackagingDimension] = useState(item?.packagingDimension ?? '');
  const [shelfLifeDays, setShelfLifeDays] = useState(item?.shelfLifeDays?.toString() ?? '');
  const [temperature, setTemperature] = useState(item?.temperature ?? '');
  const [cutoffTime, setCutoffTime] = useState(item?.cutoffTime ?? '');
  const [rtvAllowed, setRtvAllowed] = useState<string>(
    item?.rtvAllowed == null ? '' : item.rtvAllowed ? 'true' : 'false',
  );

  // Classification
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

  // Live preview of the pricing math from current form values. The user can
  // see profit, net margin, and the derived Basic / Landing prices update as
  // they edit MRP / margin / GST / COGM. Falls back to nothing if any of the
  // four required inputs are missing.
  const livePricing = useMemo(() => {
    const m = Number(mrp);
    const sm = Number(margin);
    const gr = Number(gstRate);
    const c = Number(costPrice);
    if (!m || !gr || sm === 0 && !margin) return null;
    if (!margin || !mrp) return null;
    return calculatePricing({
      mrp: m,
      sellerMarginPct: sm,
      gstRatePct: gr,
      cogm: c || 0,
    });
  }, [mrp, margin, gstRate, costPrice]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: CreateItemInput = {
      name,
      type,
      sku: sku || null,
      ean: ean || null,
      hsnSacCode: hsnSacCode || null,
      unit: unit || null,
      gstRate: num(gstRate),
      defaultSellingPrice: num(defaultSellingPrice),
      mrp: num(mrp),
      costPrice: num(costPrice),
      basicPrice: num(basicPrice),
      gstValue: num(gstValue),
      margin: num(margin),
      brand: brand || null,
      productType: productType || null,
      grammage: grammage || null,
      packingType: packingType || null,
      vendorPackSize: vendorPackSize || null,
      packagingDimension: packagingDimension || null,
      shelfLifeDays: int(shelfLifeDays),
      temperature: temperature || null,
      cutoffTime: cutoffTime || null,
      rtvAllowed: rtvAllowed === '' ? null : rtvAllowed === 'true',
      category: category || null,
      subcategory: subcategory || null,
      description: description || null,
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
          <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Internal code" />
          <Input label="EAN / Barcode" value={ean} onChange={(e) => setEan(e.target.value)} placeholder="13-digit EAN" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as 'product' | 'service')} options={[{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }]} />
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
        </div>
      </fieldset>

      {/* Pricing */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Pricing — flows from COGM → Basic Price → GST → Landing Price → MRP
        </legend>
        {isEdit && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
            <div className="flex items-start gap-2">
              <Lock size={14} className="mt-0.5 shrink-0" />
              <p>
                Pricing is read-only here. The fields below are interrelated (MRP × margin → Landing → Basic → GST), so editing them directly risks inconsistency.
                Use the <strong>Cost &amp; Profit Analysis</strong> calculator to change pricing — it keeps every value in sync and saves them back here.
              </p>
            </div>
            {onOpenAnalysis && (
              <Button type="button" variant="outline" size="sm" onClick={onOpenAnalysis}>
                <Calculator size={14} /> Open Calculator
              </Button>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Input label="MRP (consumer)" type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="₹" disabled={isEdit} />
          <Input label="Seller Margin (% off MRP)" type="number" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="20" disabled={isEdit} />
          <Input label="GST Rate (%)" type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} placeholder="5" disabled={isEdit} />
          <Input label="COGM (mfg cost)" type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="₹" disabled={isEdit} />
          <Input label="Basic Price (excl GST)" type="number" value={basicPrice} onChange={(e) => setBasicPrice(e.target.value)} placeholder="Invoice taxable" disabled={isEdit} />
          <Input label="GST Amount (₹)" type="number" value={gstValue} onChange={(e) => setGstValue(e.target.value)} placeholder="Tax amt" disabled={isEdit} />
          <Input label="Landing Price (incl GST)" type="number" value={defaultSellingPrice} onChange={(e) => setDefaultSellingPrice(e.target.value)} placeholder="What seller pays you" disabled={isEdit} />
        </div>
        {livePricing && (
          <LivePricingPreview
            basicPrice={livePricing.basicPrice}
            landingPrice={livePricing.landingPrice}
            profit={livePricing.profitPerUnit}
            netMargin={livePricing.netMarginPct}
          />
        )}
      </fieldset>

      {/* Catalogue details */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Catalogue Details</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Vrindavan" />
          <Input label="Product Type" value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="e.g. Food" />
          <Input label="Grammage" value={grammage} onChange={(e) => setGrammage(e.target.value)} placeholder="e.g. 200ml" />
          <Input label="Packing Type" value={packingType} onChange={(e) => setPackingType(e.target.value)} placeholder="e.g. PET" />
          <Input label="Vendor Pack Size" value={vendorPackSize} onChange={(e) => setVendorPackSize(e.target.value)} placeholder="Carton" />
          <Input label="Packaging Dimension" value={packagingDimension} onChange={(e) => setPackagingDimension(e.target.value)} placeholder="L x B x H" />
          <Input label="Shelf Life (days)" type="number" value={shelfLifeDays} onChange={(e) => setShelfLifeDays(e.target.value)} placeholder="180" />
          <Input label="Temperature" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="Ambient" />
          <Input label="Cut-off Time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} placeholder="20:00:00" />
          <Select label="RTV Allowed" value={rtvAllowed} onChange={(e) => setRtvAllowed(e.target.value)} options={RTV_OPTIONS} />
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
      <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div>
          {isEdit && onDelete && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 size={14} /> Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={create.isPending || update.isPending} size="sm">
            {isEdit ? <><Pencil size={14} /> Save Changes</> : <><Plus size={14} /> Create Item</>}
          </Button>
        </div>
      </div>
    </form>
  );
}

function LivePricingPreview({
  basicPrice,
  landingPrice,
  profit,
  netMargin,
}: {
  basicPrice: number;
  landingPrice: number;
  profit: number;
  netMargin: number;
}) {
  const isLoss = profit < 0;
  const tone = isLoss
    ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
    : netMargin < 5
    ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
    : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30';
  const profitColor = isLoss
    ? 'text-red-700 dark:text-red-400'
    : netMargin < 5
    ? 'text-amber-700 dark:text-amber-400'
    : 'text-emerald-700 dark:text-emerald-400';
  return (
    <div className={`grid grid-cols-2 gap-2 rounded-md border px-3 py-2 text-xs sm:grid-cols-4 ${tone}`}>
      <Stat label="Basic Price" value={formatINR(basicPrice)} />
      <Stat label="Landing Price" value={formatINR(landingPrice)} />
      <Stat label="Profit / unit" value={formatINR(profit)} className={profitColor} />
      <Stat label="Net margin" value={`${netMargin.toFixed(2)}%`} className={profitColor} />
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`font-mono text-sm font-semibold ${className ?? 'text-zinc-900 dark:text-zinc-100'}`}>{value}</p>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select, Textarea, Combobox, useToast } from '@/components/ui';
import { HsnSacCombobox } from '@/components/ui/hsn-sac-combobox';
import type { ItemAttributeField, ItemClass } from '@runq/types';
import {
  useCreateItem,
  useUpdateItem,
  useItemAttributeSchema,
  type Item,
  type CreateItemInput,
} from '@/hooks/queries/use-items';
import { useCategoryTree } from '@/hooks/queries/use-categories';
import { useCompanySettings } from '@/hooks/queries/use-settings';
import { calculatePricing, calculateServicePricing } from '@/lib/item-pricing';
import { formatINR } from '@/lib/utils';

/**
 * Industries where the tenant's default output is services, not goods.
 * New items created in these industries default to `type: 'service'`
 * so a consulting firm doesn't have to manually flip every item.
 * Retail / Manufacturing / Trading / Construction / Food & Beverage
 * all default to 'product'. "Other" defaults to 'product' too since
 * we have no signal to go on.
 */
const SERVICE_INDUSTRIES = new Set([
  'Services',
  'IT / Software',
  'Education',
  'Healthcare',
  'Hospitality',
]);

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ItemForm({
  item,
  template,
  onClose,
  onDelete,
  onOpenAnalysis,
}: {
  item?: Item;
  /**
   * Pre-fill the form from another item's data when creating a new item.
   * Used by the "Duplicate" flow to seed a variant from an existing product.
   * Stays in create mode (not edit) so save calls create() and the source
   * item is left untouched. The source's cogmBreakdown is forwarded into
   * the create payload so duplicates inherit cost build-ups.
   */
  template?: Item;
  onClose: () => void;
  onDelete?: () => void;
  onOpenAnalysis?: () => void;
}) {
  const create = useCreateItem();
  const update = useUpdateItem();
  const { toast } = useToast();
  const { data: treeData } = useCategoryTree();
  const { data: companyData } = useCompanySettings();
  const categoryTree = treeData?.data ?? [];
  const isEdit = !!item;
  // Source for initial values: item when editing, template when duplicating.
  const source = item ?? template ?? null;
  const isDuplicate = !!template && !item;

  // Default item type: for pre-existing items use their saved type.
  // For new items, use the tenant's industry to pick 'service' vs 'product'.
  // Falls back to 'product' when the industry isn't set or isn't recognized.
  const tenantIndustry = companyData?.data?.industry ?? null;
  const defaultItemType: 'product' | 'service' =
    tenantIndustry && SERVICE_INDUSTRIES.has(tenantIndustry) ? 'service' : 'product';

  // Basic — when duplicating, suffix the name and clear unique identifiers
  // (sku has a partial unique constraint, ean is semantically unique).
  const [name, setName] = useState(
    isDuplicate ? `${source?.name ?? ''} (Copy)` : source?.name ?? '',
  );
  const [sku, setSku] = useState(isDuplicate ? '' : source?.sku ?? '');
  const [ean, setEan] = useState(isDuplicate ? '' : source?.ean ?? '');
  const [type, setType] = useState<'product' | 'service'>(source?.type ?? defaultItemType);
  // Axis-1 classification. Required for products; backend will default to
  // 'trading_good' if left empty, but the dropdown makes the choice explicit.
  const [itemClass, setItemClass] = useState<ItemClass | ''>(
    source?.itemClass ?? '',
  );
  const [hsnSacCode, setHsnSacCode] = useState(source?.hsnSacCode ?? '');
  const [unit, setUnit] = useState(source?.unit ?? '');
  const [gstRate, setGstRate] = useState(source?.gstRate?.toString() ?? '');

  // Pricing
  const [defaultSellingPrice, setDefaultSellingPrice] = useState(source?.defaultSellingPrice?.toString() ?? '');
  const [mrp, setMrp] = useState(source?.mrp?.toString() ?? '');
  const [costPrice, setCostPrice] = useState(source?.costPrice?.toString() ?? '');
  const [basicPrice, setBasicPrice] = useState(source?.basicPrice?.toString() ?? '');
  const [gstValue, setGstValue] = useState(source?.gstValue?.toString() ?? '');
  const [margin, setMargin] = useState(source?.margin?.toString() ?? '');

  // Catalogue — dynamic attributes driven by the tenant's schema. One flat
  // record keyed by schema field.key. Values are strings for text/number/
  // select fields and booleans for boolean fields; never `undefined` so we
  // can distinguish "cleared" from "never set".
  const { data: schemaRes } = useItemAttributeSchema();
  const attributeSchema = schemaRes?.data ?? [];
  const [attributes, setAttributes] = useState<Record<string, unknown>>(
    () => (source?.attributes as Record<string, unknown> | null) ?? {},
  );
  const setAttribute = (key: string, value: unknown) =>
    setAttributes((prev) => ({ ...prev, [key]: value }));

  // Tracking flags — class-driven defaults so dairy/FMCG raw materials land
  // with batch + expiry tracking pre-checked. User can override per item.
  // Mirrors apps/api/src/modules/masters/item.service.ts CLASS_TRACKING_DEFAULTS.
  const trackingDefaultsFor = (cls: ItemClass | ''): {
    trackInventory: boolean; trackBatches: boolean; trackExpiry: boolean; trackSerials: boolean;
  } => {
    if (!cls) return { trackInventory: true, trackBatches: false, trackExpiry: false, trackSerials: false };
    const batchesExpiry = ['raw_material', 'finished_good', 'semi_finished'].includes(cls);
    return { trackInventory: true, trackBatches: batchesExpiry, trackExpiry: batchesExpiry, trackSerials: false };
  };
  const initialTracking = source
    ? {
        trackInventory: source.trackInventory ?? true,
        trackBatches: source.trackBatches ?? false,
        trackExpiry: source.trackExpiry ?? false,
        trackSerials: source.trackSerials ?? false,
      }
    : trackingDefaultsFor('');
  const [trackInventory, setTrackInventory] = useState(initialTracking.trackInventory);
  const [trackBatches, setTrackBatches] = useState(initialTracking.trackBatches);
  const [trackExpiry, setTrackExpiry] = useState(initialTracking.trackExpiry);
  const [trackSerials, setTrackSerials] = useState(initialTracking.trackSerials);
  // Track whether the user has manually toggled any flag — if so, class
  // changes stop overwriting their choices. Without this, picking "Raw
  // material" and then unchecking Expiry would silently re-check on the
  // next unrelated field edit triggering a re-render.
  const [trackingTouched, setTrackingTouched] = useState(isEdit);

  // Re-apply defaults when the class changes, unless the user has already
  // touched the checkboxes manually.
  useEffect(() => {
    if (trackingTouched) return;
    const d = trackingDefaultsFor(itemClass);
    setTrackInventory(d.trackInventory);
    setTrackBatches(d.trackBatches);
    setTrackExpiry(d.trackExpiry);
    setTrackSerials(d.trackSerials);
  }, [itemClass, trackingTouched]);

  // Classification
  const [category, setCategory] = useState(source?.category ?? '');
  const [subcategory, setSubcategory] = useState(source?.subcategory ?? '');
  const [description, setDescription] = useState(source?.description ?? '');

  const categoryOptions = categoryTree
    .filter((c) => c.isActive)
    .map((c) => ({ value: c.name, label: c.name }));
  const selectedCat = categoryTree.find((c) => c.name === category);
  const subcategoryOptions = (selectedCat?.subcategories ?? [])
    .filter((s) => s.isActive)
    .map((s) => ({ value: s.name, label: s.name }));

  // Live preview of the product pricing math. Shows profit, net margin, and
  // derived Basic / Landing prices as the user edits MRP / margin / GST / COGM.
  // Returns null if any required input is missing.
  const livePricing = useMemo(() => {
    if (type !== 'product') return null;
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
  }, [type, mrp, margin, gstRate, costPrice]);

  // Live preview for the service pricing flow — simpler (selling price,
  // cost, GST → margin). Returns null if selling price is missing since
  // that's the only strictly required input.
  const liveServicePricing = useMemo(() => {
    if (type !== 'service') return null;
    const sp = Number(defaultSellingPrice);
    const c = Number(costPrice);
    const gr = Number(gstRate);
    if (!sp) return null;
    return calculateServicePricing({
      sellingPrice: sp,
      cost: c || 0,
      gstRatePct: gr || 0,
    });
  }, [type, defaultSellingPrice, costPrice, gstRate]);

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
      // Industry-specific catalogue attributes persisted to items.attributes.
      attributes: normalizeAttributesForSubmit(attributes, attributeSchema),
      itemClass: type === 'product' ? (itemClass || null) : null,
      // Resolve the two visible comboboxes back to a category_id. Leaf
      // (subcategory) wins; otherwise fall back to the root category. The
      // backend trigger keeps the legacy string columns in sync, so we
      // don't need to send them — but include them as a belt for legacy
      // listing screens that still read items.category directly.
      categoryId: (() => {
        const root = categoryTree.find((c) => c.name === category);
        if (!root) return null;
        if (subcategory) {
          const leaf = root.subcategories?.find((s) => s.name === subcategory);
          if (leaf) return leaf.id;
        }
        return root.id;
      })(),
      category: category || null,
      subcategory: subcategory || null,
      description: description || null,
      // Tracking flags. Services skip them — items table CHECK / queries
      // don't read them for type='service'.
      ...(type === 'product'
        ? { trackInventory, trackBatches, trackExpiry, trackSerials }
        : {}),
      // Carry the source's COGM breakdown into the new item when duplicating,
      // so variants inherit the cost build-up. NEVER include in the edit
      // payload — the form doesn't manage breakdowns, so sending undefined
      // (via the spread on the API service side) leaves the existing rows
      // alone. The breakdown is editable on the analysis page.
      ...(isDuplicate && template?.cogmBreakdown
        ? { cogmBreakdown: template.cogmBreakdown }
        : {}),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: item.id, data });
        toast('Item updated', 'success');
      } else {
        await create.mutateAsync(data);
        toast(isDuplicate ? 'Variant created from duplicate' : 'Item created', 'success');
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
          {type === 'product' && (
            <Select
              label="Item class"
              value={itemClass}
              onChange={(e) => setItemClass(e.target.value as ItemClass | '')}
              options={[
                { value: '', label: 'Trading good (default)' },
                { value: 'raw_material', label: 'Raw material' },
                { value: 'packaging', label: 'Packaging' },
                { value: 'finished_good', label: 'Finished good' },
                { value: 'semi_finished', label: 'Semi-finished' },
                { value: 'trading_good', label: 'Trading good' },
                { value: 'consumable', label: 'Consumable' },
                { value: 'spare_part', label: 'Spare part' },
              ]}
            />
          )}
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

      {/* Pricing — product and service flows are different. Products run
          through the MRP → seller margin → basic → landing chain; services
          are just selling price, cost, GST → margin. */}
      {type === 'product' ? (
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Pricing — Cost → Basic Price → GST → Landing Price → MRP
          </legend>
          {isEdit && (
            <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
              <div className="flex items-start gap-2">
                <Lock size={14} className="mt-0.5 shrink-0" />
                <p>
                  Pricing is read-only here. The fields below are interrelated (MRP × margin → Landing → Basic → GST), so editing them directly risks inconsistency.
                  Use the <strong>Cost &amp; Profit Analysis</strong> page to change pricing — it keeps every value in sync and saves them back here.
                </p>
              </div>
              {onOpenAnalysis && (
                <Button type="button" variant="outline" size="sm" onClick={onOpenAnalysis} className="w-full sm:w-auto">
                  <Calculator size={14} /> Open Cost Analysis
                </Button>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Input label="MRP (consumer)" type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="₹" disabled={isEdit} />
            <Input label="Seller Margin (% off MRP)" type="number" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="20" disabled={isEdit} />
            <Input label="GST Rate (%)" type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} placeholder="5" disabled={isEdit} />
            <Input label="Cost Price" type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="₹" disabled={isEdit} />
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
      ) : (
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Pricing — Selling Price, Cost &amp; GST
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <Input
              label="Selling Price"
              type="number"
              value={defaultSellingPrice}
              onChange={(e) => setDefaultSellingPrice(e.target.value)}
              placeholder="₹ per unit"
              helper={`What you charge per ${unit || 'unit'} (incl GST)`}
            />
            <Input
              label="Cost Price"
              type="number"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="₹"
              helper="Labour + overhead per unit"
            />
            <Input
              label="GST Rate (%)"
              type="number"
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
              placeholder="18"
            />
          </div>
          {liveServicePricing && (
            <LivePricingPreview
              basicPrice={liveServicePricing.basicPrice}
              landingPrice={Number(defaultSellingPrice) || 0}
              profit={liveServicePricing.profitPerUnit}
              netMargin={liveServicePricing.netMarginPct}
              landingLabel="Sell Price"
            />
          )}
        </fieldset>
      )}

      {/* Catalogue details — dynamic, driven by the tenant's industry-specific
          attribute schema (seeded at signup from an industry preset). */}
      {attributeSchema.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Catalogue Details
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {attributeSchema.map((field) => (
              <DynamicAttributeField
                key={field.key}
                field={field}
                value={attributes[field.key]}
                onChange={(v) => setAttribute(field.key, v)}
              />
            ))}
          </div>
        </fieldset>
      )}

      {/* Tracking — only meaningful for products. Defaults are derived from
          the item class above so dairy raw-material lands with batch + expiry
          pre-checked; user can override per item. */}
      {type === 'product' && (
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Tracking
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TrackingCheckbox
              label="Track inventory"
              hint="Off for items that don't enter the warehouse (services, virtual SKUs)."
              checked={trackInventory}
              onChange={(v) => { setTrackingTouched(true); setTrackInventory(v); }}
            />
            <TrackingCheckbox
              label="Track batches"
              hint="Each receipt gets a batch number (driver for FEFO on dairy, FMCG)."
              checked={trackBatches}
              onChange={(v) => { setTrackingTouched(true); setTrackBatches(v); }}
              disabled={!trackInventory}
            />
            <TrackingCheckbox
              label="Track expiry"
              hint="Capture expiry per batch — needed for perishables."
              checked={trackExpiry}
              onChange={(v) => { setTrackingTouched(true); setTrackExpiry(v); }}
              disabled={!trackInventory}
            />
            <TrackingCheckbox
              label="Track serials"
              hint="Per-unit serial numbers — appliances, electronics, high-value spares."
              checked={trackSerials}
              onChange={(v) => { setTrackingTouched(true); setTrackSerials(v); }}
              disabled={!trackInventory}
            />
          </div>
        </fieldset>
      )}

      {/* Classification */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Classification</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={4}
        />
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
  landingLabel = 'Landing Price',
}: {
  basicPrice: number;
  landingPrice: number;
  profit: number;
  netMargin: number;
  landingLabel?: string;
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
      <Stat label={landingLabel} value={formatINR(landingPrice)} />
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

/**
 * Renders a single catalogue attribute field based on its schema definition.
 * Values are always stored as the user-facing primitive (string / number /
 * boolean) and normalized at submit time. Select fields preserve unknown
 * legacy values by appending them as an extra option — matches the old
 * Temperature handling so imported rows never silently drop a value.
 */
function DynamicAttributeField({
  field,
  value,
  onChange,
}: {
  field: ItemAttributeField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const common = {
    label: field.label,
    required: field.required,
    helper: field.help,
  };

  if (field.type === 'textarea') {
    return (
      <div className="sm:col-span-3">
        <Textarea
          {...common}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
        />
      </div>
    );
  }

  if (field.type === 'boolean') {
    const str = value === true ? 'true' : value === false ? 'false' : '';
    return (
      <Select
        {...common}
        value={str}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : v === 'true');
        }}
        options={[
          { value: '', label: '—' },
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ]}
      />
    );
  }

  if (field.type === 'select') {
    const base = [{ value: '', label: '—' }, ...(field.options ?? [])];
    // Preserve unknown legacy values (from imports or older presets) by
    // appending them as an extra option, so the dropdown never silently
    // drops the current value.
    const current = typeof value === 'string' ? value : '';
    const options =
      current && !base.some((o) => o.value === current)
        ? [...base, { value: current, label: current }]
        : base;
    return (
      <Select
        {...common}
        value={current}
        onChange={(e) => onChange(e.target.value || null)}
        options={options}
      />
    );
  }

  // text | number
  return (
    <Input
      {...common}
      type={field.type === 'number' ? 'number' : 'text'}
      value={(value as string | number | undefined)?.toString() ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (field.type === 'number') {
          if (raw.trim() === '') {
            onChange(null);
            return;
          }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : raw);
          return;
        }
        onChange(raw);
      }}
      placeholder={field.placeholder}
    />
  );
}

/**
 * Strips empty strings/nulls from the attributes payload and returns null
 * if nothing is left. Sending `null` (rather than `{}`) lets the backend
 * know to clear the attributes column cleanly.
 */
function normalizeAttributesForSubmit(
  attributes: Record<string, unknown>,
  schema: ItemAttributeField[],
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  // Only persist keys that are in the schema — keeps items.attributes
  // clean when schemas change and drops any stale legacy keys.
  for (const field of schema) {
    const v = attributes[field.key];
    if (v === '' || v === null || v === undefined) continue;
    out[field.key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function TrackingCheckbox({
  label, hint, checked, onChange, disabled,
}: {
  label: string; hint: string; checked: boolean; disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 rounded-md border border-zinc-200 p-2.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</span>
      </span>
    </label>
  );
}

export interface CogmComponent {
  label: string;
  amount: number;
  note?: string;
}

/**
 * Definition of a single catalogue attribute. A tenant's full schema is
 * an ordered array of these, stored in tenants.settings.itemAttributeSchema
 * and seeded from an industry preset at first use.
 */
export type ItemAttributeFieldType = 'text' | 'number' | 'textarea' | 'boolean' | 'select';

export interface ItemAttributeField {
  key: string;                // stable identifier, e.g. 'size', 'grade'
  label: string;              // human label shown in the form
  type: ItemAttributeFieldType;
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[]; // for type: 'select'
}

export type ItemAttributeSchema = ItemAttributeField[];

/**
 * Axis-1 classification (introduced in migration 0110). Required for
 * products, NULL for services. Drives default tracking flags at create
 * time and — in a future phase — GL account routing.
 */
export type ItemClass =
  | 'raw_material'
  | 'packaging'
  | 'finished_good'
  | 'semi_finished'
  | 'trading_good'
  | 'consumable'
  | 'spare_part';

export interface Item {
  id: string;
  tenantId: string;
  name: string;
  sku: string | null;
  type: 'product' | 'service';
  itemClass: ItemClass | null;
  hsnSacCode: string | null;
  unit: string | null;
  packSizeValue: number | null;
  packSizeUqc: string | null;
  defaultSellingPrice: number | null;
  defaultPurchasePrice: number | null;
  gstRate: number | null;
  mrp: number | null;
  costPrice: number | null;
  /** FK into the category tree. Authoritative — `category` / `subcategory`
   *  strings are kept in sync by a DB trigger and will be dropped once
   *  every client reads via `categoryId`. */
  categoryId: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  // Universal supplier-catalogue attributes.
  ean: string | null;
  margin: number | null;
  basicPrice: number | null;
  gstValue: number | null;
  // Industry-specific attributes keyed by the tenant's attribute schema
  // (e.g. { brand: 'Vrindavan', packingType: 'PET' } for FMCG, or
  // { size: 'M', color: 'Red', fabric: 'Cotton' } for apparel).
  attributes: Record<string, unknown> | null;
  cogmBreakdown: CogmComponent[] | null;
  // Tracking flags. Surfaced on the item form; column-level booleans are
  // the source of truth. Class-driven defaults are applied at create time
  // when the caller omits them.
  trackInventory: boolean;
  trackBatches: boolean;
  trackExpiry: boolean;
  trackSerials: boolean;
  /** Template for auto-suggesting a fresh batch code at receipt time.
   *  Tokens: {SKU}, {YYYY}, {MM}, {DD}, {YYYYMMDD}. NULL = no template. */
  batchCodeTemplate: string | null;
  /** Reorder point and suggested top-up quantity. A per-warehouse rule in
   *  inventory.reorder_rules overrides these when one exists. */
  reorderLevel: number | null;
  reorderQty: number | null;
  isActive: boolean;
  /** Total on-hand quantity across warehouses and batches. Only populated
   *  when the list endpoint is called with `withStock=true`; undefined
   *  everywhere else so the masters reads stay a single-table query. */
  stockQty?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One price-list line that covers a given item, flattened with the list it
 * belongs to and whoever it applies to. Backs the item detail view's
 * "Price Lists" section — read-only; edits happen on the price list itself.
 */
export interface ItemPriceListLine {
  priceListId: string;
  priceListName: string;
  type: 'selling' | 'buying';
  /** Who the list covers: everyone, a group, or one named party. */
  applyTo: 'all' | 'customer_group' | 'vendor_group' | 'customer' | 'vendor';
  /** Group name for *_group lists; null otherwise. */
  applyToValue: string | null;
  /** Resolved counterparty name for customer / vendor lists; null otherwise. */
  partyName: string | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
  /** True when today falls outside validFrom..validTo. */
  isExpired: boolean;
  /** Quantity tier this line applies from. 0 is the base tier. */
  minQuantity: number;
  /** Raw line overrides — any combination may be set. */
  rate: number | null;
  marginPercent: number | null;
  mrp: number | null;
  discountPercent: number | null;
  /** Derived unit rate before discount, using the same math as the resolver. */
  derivedRate: number;
  /** Derived unit rate after discountPercent. What the invoice would use.
   *  This is the taxable basic rate — GST sits on top of it. */
  effectiveRate: number;
  /** The item's GST rate, carried so the line can show its own tax breakup. */
  gstRatePct: number;
  /** GST charged on [effectiveRate]. */
  gstAmount: number;
  /** [effectiveRate] + [gstAmount] — the all-in price the party pays. */
  landingRate: number;
  /** Seller margin actually in force: the line's override, else the item's.
   *  Null when neither is set (a fixed-rate line need not have one). */
  effectiveMarginPct: number | null;
  /** What this price leaves us per unit: taxable rate less the item's cost
   *  price (GST is collected for the govt, so it never counts as income).
   *  Null when the item has no cost price, or on buying lists where we are
   *  the payer — a zero there would read as break-even rather than unknown. */
  netProfitPerUnit: number | null;
  /** [netProfitPerUnit] as a share of the taxable rate. */
  netMarginPct: number | null;
}

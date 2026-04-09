export interface CogmComponent {
  label: string;
  amount: number;
  note?: string;
}

/**
 * Definition of a single catalogue attribute. A tenant's full schema is an
 * ordered array of these, stored in tenants.settings.itemAttributeSchema and
 * seeded from an industry preset at first use.
 *
 * `fmcgColumn` — only present on Food & Beverage preset fields that map to
 * the pre-existing dedicated columns on `items` (grammage, packing_type, …).
 * During Phase 1 the backend dual-writes those fields into both the column
 * and the `attributes` JSONB so list views, CSV export, and AI extraction
 * keep working. Non-FMCG attributes have no column mapping — they live in
 * JSONB only.
 */
export type ItemAttributeFieldType = 'text' | 'number' | 'textarea' | 'boolean' | 'select';

export interface ItemAttributeField {
  key: string;                // stable identifier, e.g. 'grammage', 'size'
  label: string;              // human label shown in the form
  type: ItemAttributeFieldType;
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[]; // for type: 'select'
  // Legacy FMCG-only: dual-write this attribute into the matching `items`
  // column. Only set on the Food & Beverage preset.
  fmcgColumn?:
    | 'brand'
    | 'productType'
    | 'grammage'
    | 'packingType'
    | 'vendorPackSize'
    | 'packagingDimension'
    | 'shelfLifeDays'
    | 'temperature'
    | 'cutoffTime'
    | 'rtvAllowed';
}

export type ItemAttributeSchema = ItemAttributeField[];

export interface Item {
  id: string;
  tenantId: string;
  name: string;
  sku: string | null;
  type: 'product' | 'service';
  hsnSacCode: string | null;
  unit: string | null;
  defaultSellingPrice: number | null;
  defaultPurchasePrice: number | null;
  gstRate: number | null;
  mrp: number | null;
  costPrice: number | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  // Extended supplier-catalogue attributes
  ean: string | null;
  margin: number | null;
  brand: string | null;
  grammage: string | null;
  packingType: string | null;
  basicPrice: number | null;
  gstValue: number | null;
  shelfLifeDays: number | null;
  rtvAllowed: boolean | null;
  vendorPackSize: string | null;
  packagingDimension: string | null;
  temperature: string | null;
  cutoffTime: string | null;
  productType: string | null;
  // Flexible industry-specific attributes keyed by the tenant's attribute
  // schema (e.g. { grammage: '200ml', packingType: 'PET' } for FMCG, or
  // { size: 'M', color: 'Red', fabric: 'Cotton' } for apparel).
  attributes: Record<string, unknown> | null;
  cogmBreakdown: CogmComponent[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

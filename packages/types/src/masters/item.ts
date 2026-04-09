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

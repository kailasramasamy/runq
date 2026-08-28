import type { ItemAttributeSchema } from '@runq/types';

/**
 * Default catalogue attribute schemas per industry. Seeded into
 * tenants.settings.itemAttributeSchema on first access to the item form,
 * keyed by the industry the user picked at signup.
 *
 * Design rules:
 * - Every preset stays small (4-8 fields) so new tenants aren't overwhelmed.
 *   Tenants can extend the schema in Settings once we ship Phase 2.
 * - Field keys are camelCase, stable identifiers. They become keys in the
 *   `items.attributes` JSONB, so renaming them later is a data migration.
 * - All industry-specific attributes live in `items.attributes` JSONB —
 *   there's no dedicated column for any catalogue field anymore.
 * - Select options are short and common. If a tenant needs more, they edit
 *   in Settings (Phase 2). We do NOT try to be exhaustive here.
 */

const FMCG_PRESET: ItemAttributeSchema = [
  { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g. Vrindavan' },
  { key: 'productType', label: 'Product Type', type: 'text', placeholder: 'e.g. Food' },
  // NOTE: `grammage` is intentionally NOT in the preset. The top-level
  // `unit` field on items (used on invoices, price lists, reports)
  // already captures pack size like "200ml" or "1kg" — having a
  // separate grammage field would force users to fill the same value
  // twice.
  { key: 'packingType', label: 'Packing Type', type: 'text', placeholder: 'e.g. PET' },
  { key: 'vendorPackSize', label: 'Vendor Pack Size', type: 'text', placeholder: 'Carton' },
  { key: 'packagingDimension', label: 'Packaging Dimension', type: 'text', placeholder: 'L x B x H' },
  // NOTE: `shelfLifeDays` is intentionally NOT in the preset. It is a real
  // column on items, and it drives derived batch expiry — a descriptive copy
  // in `attributes` would render as a second "Shelf life" box on the item form
  // that looks identical and changes nothing. Migration 0204 retired it.
  {
    key: 'temperature',
    label: 'Temperature',
    type: 'select',
    options: [
      { value: 'Ambient', label: 'Ambient (room temperature)' },
      { value: 'Cool & Dry', label: 'Cool & Dry (15-25°C)' },
      { value: 'Chilled', label: 'Chilled (2-8°C)' },
      { value: 'Frozen', label: 'Frozen (-18°C or below)' },
    ],
  },
  { key: 'cutoffTime', label: 'Cut-off Time', type: 'text', placeholder: '20:00:00' },
  {
    key: 'rtvAllowed',
    label: 'RTV Allowed',
    type: 'boolean',
    help: 'Returnable to vendor',
  },
];

const RETAIL_PRESET: ItemAttributeSchema = [
  { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g. Levi\'s' },
  { key: 'size', label: 'Size', type: 'text', placeholder: 'S / M / L / 32 / 40' },
  { key: 'color', label: 'Color', type: 'text', placeholder: 'e.g. Navy' },
  { key: 'material', label: 'Material / Fabric', type: 'text', placeholder: 'e.g. Cotton' },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    options: [
      { value: 'Men', label: 'Men' },
      { value: 'Women', label: 'Women' },
      { value: 'Unisex', label: 'Unisex' },
      { value: 'Kids', label: 'Kids' },
    ],
  },
  { key: 'season', label: 'Season / Collection', type: 'text', placeholder: 'e.g. SS26' },
];

const MANUFACTURING_PRESET: ItemAttributeSchema = [
  { key: 'brand', label: 'Brand / Make', type: 'text' },
  { key: 'materialSpec', label: 'Material Spec', type: 'text', placeholder: 'e.g. MS, SS304, Aluminium' },
  { key: 'grade', label: 'Grade', type: 'text', placeholder: 'e.g. IS 2062 E250' },
  { key: 'tolerance', label: 'Tolerance', type: 'text', placeholder: 'e.g. ±0.1mm' },
  { key: 'drawingNumber', label: 'Drawing / Part No.', type: 'text' },
  { key: 'leadTimeDays', label: 'Lead Time (days)', type: 'number', placeholder: '15' },
  { key: 'certification', label: 'Certification', type: 'text', placeholder: 'e.g. ISO 9001, CE' },
];

const TRADING_PRESET: ItemAttributeSchema = [
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'packSize', label: 'Pack Size', type: 'text', placeholder: 'e.g. 10kg bag' },
  { key: 'moq', label: 'MOQ', type: 'text', placeholder: 'Min order qty' },
  { key: 'leadTimeDays', label: 'Lead Time (days)', type: 'number', placeholder: '7' },
  { key: 'countryOfOrigin', label: 'Country of Origin', type: 'text', placeholder: 'e.g. India, China' },
  { key: 'vendorCode', label: 'Vendor Code', type: 'text' },
];

const CONSTRUCTION_PRESET: ItemAttributeSchema = [
  { key: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g. UltraTech' },
  { key: 'grade', label: 'Grade', type: 'text', placeholder: 'e.g. M20, Fe500, OPC 53' },
  { key: 'dimensions', label: 'Dimensions', type: 'text', placeholder: 'L x B x H' },
  { key: 'weight', label: 'Weight', type: 'text', placeholder: 'e.g. 50kg bag' },
  { key: 'isCode', label: 'IS Code', type: 'text', placeholder: 'e.g. IS 269' },
  { key: 'finish', label: 'Finish / Surface', type: 'text', placeholder: 'e.g. Smooth, Matte' },
];

const FOOD_BEVERAGE_PRESET = FMCG_PRESET;

const HEALTHCARE_PRESET: ItemAttributeSchema = [
  { key: 'manufacturer', label: 'Manufacturer', type: 'text', placeholder: 'e.g. Cipla' },
  { key: 'genericName', label: 'Generic / Composition', type: 'text', placeholder: 'e.g. Paracetamol 500mg' },
  { key: 'strength', label: 'Strength', type: 'text', placeholder: 'e.g. 500mg, 10mg/ml' },
  {
    key: 'schedule',
    label: 'Drug Schedule',
    type: 'select',
    options: [
      { value: 'OTC', label: 'OTC (over the counter)' },
      { value: 'H', label: 'Schedule H' },
      { value: 'H1', label: 'Schedule H1' },
      { value: 'X', label: 'Schedule X' },
      { value: 'G', label: 'Schedule G' },
      { value: 'NA', label: 'Not applicable' },
    ],
  },
  { key: 'packSize', label: 'Pack Size', type: 'text', placeholder: 'e.g. strip of 10, 60ml bottle' },
  {
    key: 'storage',
    label: 'Storage',
    type: 'select',
    options: [
      { value: 'Room Temperature', label: 'Room Temperature' },
      { value: 'Cool & Dry', label: 'Cool & Dry' },
      { value: 'Refrigerated (2-8°C)', label: 'Refrigerated (2-8°C)' },
      { value: 'Frozen', label: 'Frozen' },
    ],
  },
  { key: 'shelfLifeMonths', label: 'Shelf Life (months)', type: 'number', placeholder: '24' },
];

const HOSPITALITY_PRESET: ItemAttributeSchema = [
  {
    key: 'menuSection',
    label: 'Menu Section',
    type: 'select',
    options: [
      { value: 'Starter', label: 'Starter' },
      { value: 'Main Course', label: 'Main Course' },
      { value: 'Dessert', label: 'Dessert' },
      { value: 'Beverage', label: 'Beverage' },
      { value: 'Side', label: 'Side' },
    ],
  },
  { key: 'portionSize', label: 'Portion Size', type: 'text', placeholder: 'e.g. 250g, serves 2' },
  { key: 'prepTimeMinutes', label: 'Prep Time (minutes)', type: 'number', placeholder: '15' },
  { key: 'cuisine', label: 'Cuisine', type: 'text', placeholder: 'e.g. North Indian, Chinese' },
  {
    key: 'dietary',
    label: 'Dietary',
    type: 'select',
    options: [
      { value: 'Veg', label: 'Veg' },
      { value: 'Non-Veg', label: 'Non-Veg' },
      { value: 'Vegan', label: 'Vegan' },
      { value: 'Jain', label: 'Jain' },
      { value: 'Egg', label: 'Contains Egg' },
    ],
  },
  { key: 'allergens', label: 'Allergens', type: 'text', placeholder: 'e.g. Nuts, Dairy, Gluten' },
];

const SERVICES_PRESET: ItemAttributeSchema = [
  {
    key: 'billingModel',
    label: 'Billing Model',
    type: 'select',
    options: [
      { value: 'Fixed', label: 'Fixed Fee' },
      { value: 'Hourly', label: 'Hourly' },
      { value: 'Daily', label: 'Daily' },
      { value: 'Monthly Retainer', label: 'Monthly Retainer' },
      { value: 'Milestone', label: 'Milestone' },
    ],
  },
  { key: 'duration', label: 'Duration', type: 'text', placeholder: 'e.g. 2 hours, 5 days' },
  { key: 'deliverables', label: 'Deliverables', type: 'textarea', placeholder: 'What the client gets' },
  { key: 'prerequisites', label: 'Prerequisites', type: 'text', placeholder: 'What you need from the client' },
];

const IT_SOFTWARE_PRESET: ItemAttributeSchema = [
  {
    key: 'licenseType',
    label: 'License Type',
    type: 'select',
    options: [
      { value: 'Perpetual', label: 'Perpetual' },
      { value: 'Subscription', label: 'Subscription' },
      { value: 'Usage-based', label: 'Usage-based' },
      { value: 'Open Source', label: 'Open Source' },
    ],
  },
  { key: 'seatCount', label: 'Seats / Users', type: 'number', placeholder: '5' },
  {
    key: 'billingCycle',
    label: 'Billing Cycle',
    type: 'select',
    options: [
      { value: 'Monthly', label: 'Monthly' },
      { value: 'Quarterly', label: 'Quarterly' },
      { value: 'Annual', label: 'Annual' },
      { value: 'One-time', label: 'One-time' },
    ],
  },
  { key: 'version', label: 'Version', type: 'text', placeholder: 'e.g. 2026.1' },
  { key: 'supportLevel', label: 'Support Level', type: 'text', placeholder: 'e.g. Standard, Premium, 24x7' },
];

const EDUCATION_PRESET: ItemAttributeSchema = [
  {
    key: 'level',
    label: 'Level',
    type: 'select',
    options: [
      { value: 'Pre-primary', label: 'Pre-primary' },
      { value: 'Primary', label: 'Primary' },
      { value: 'Middle', label: 'Middle' },
      { value: 'Secondary', label: 'Secondary' },
      { value: 'Sr. Secondary', label: 'Sr. Secondary' },
      { value: 'UG', label: 'Undergraduate' },
      { value: 'PG', label: 'Postgraduate' },
      { value: 'Professional', label: 'Professional' },
    ],
  },
  { key: 'subject', label: 'Subject / Stream', type: 'text', placeholder: 'e.g. Mathematics, Commerce' },
  {
    key: 'format',
    label: 'Format',
    type: 'select',
    options: [
      { value: 'Classroom', label: 'Classroom' },
      { value: 'Online Live', label: 'Online Live' },
      { value: 'Self-paced', label: 'Self-paced' },
      { value: 'Hybrid', label: 'Hybrid' },
    ],
  },
  { key: 'duration', label: 'Duration', type: 'text', placeholder: 'e.g. 3 months, 60 hours' },
  { key: 'batchSize', label: 'Batch Size', type: 'number', placeholder: '25' },
];

const OTHER_PRESET: ItemAttributeSchema = [
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'model', label: 'Model / Variant', type: 'text' },
  { key: 'specification', label: 'Specification', type: 'textarea', placeholder: 'Key attributes of this item' },
];

/**
 * Canonical, ordered list of supported industries. Exposed separately
 * from the presets map so the signup form, company settings dropdown,
 * and validator can all share the same source of truth. Order matters
 * — this is the order shown in dropdowns.
 */
export const INDUSTRY_LIST = [
  'Manufacturing',
  'Trading / Distribution',
  'Retail',
  'Services',
  'Construction',
  'Food & Beverage',
  'Healthcare',
  'Hospitality',
  'Education',
  'IT / Software',
  'Other',
] as const;

export type Industry = (typeof INDUSTRY_LIST)[number];

/**
 * The canonical map from the signup-form industry label to its preset.
 * Keys MUST match INDUSTRY_LIST exactly.
 */
export const INDUSTRY_ITEM_ATTRIBUTE_PRESETS: Record<Industry, ItemAttributeSchema> = {
  'Manufacturing': MANUFACTURING_PRESET,
  'Trading / Distribution': TRADING_PRESET,
  'Retail': RETAIL_PRESET,
  'Services': SERVICES_PRESET,
  'Construction': CONSTRUCTION_PRESET,
  'Food & Beverage': FOOD_BEVERAGE_PRESET,
  'Healthcare': HEALTHCARE_PRESET,
  'Hospitality': HOSPITALITY_PRESET,
  'Education': EDUCATION_PRESET,
  'IT / Software': IT_SOFTWARE_PRESET,
  'Other': OTHER_PRESET,
};

/**
 * Returns the attribute schema for an industry, falling back to OTHER_PRESET
 * if the industry is missing or unknown. Callers never get null back.
 */
export function getItemAttributeSchemaForIndustry(industry: string | null | undefined): ItemAttributeSchema {
  if (!industry) return OTHER_PRESET;
  return INDUSTRY_ITEM_ATTRIBUTE_PRESETS[industry as Industry] ?? OTHER_PRESET;
}

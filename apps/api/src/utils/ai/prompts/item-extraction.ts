import type { ItemAttributeField, ItemAttributeSchema } from '@runq/types';

/**
 * High-quality column-name synonyms for the known FMCG attribute keys,
 * preserved from the original FMCG-specific prompt. Used as *extra*
 * hints when the tenant's schema contains one of these keys (identified
 * by the `fmcgColumn` marker on the preset). For custom attribute keys
 * that aren't in this map, Claude falls back to fuzzy-matching the
 * field label.
 */
const FMCG_COLUMN_SYNONYMS: Record<string, string> = {
  brand: '"Brand", "Brand Name", "Manufacturer", "Maker"',
  packingType: '"Packing Type", "Packaging", "Pack Type", "Container Type" (e.g. "PET", "Glass", "Tetra Pak", "Pouch")',
  grammage: '"Grammage", "Pack Size", "Net Weight", "Net Wt", "Weight", "Volume". Raw verbatim value, e.g. "200ml", "1 litre", "5 Litre"',
  shelfLifeDays: '"Shelf Life", "Shelf Life (days)", "Shelf life (number of days)", "Expiry Days", "Best Before". Integer. "180 days" → 180',
  rtvAllowed: '"RTV", "RTV / Non RTV", "Returnable". Map "RTV"/"Yes"/"Returnable"/"true" → true; "Non RTV"/"No"/"Non-Returnable"/"false" → false; otherwise null',
  vendorPackSize: '"Vendor Pack Size", "Carton Size", "Case Pack", "Box Qty", "Inner Pack". Free-text',
  packagingDimension: '"Packaging Dimension", "Dimensions", "Box Dimensions", "L x B x H". Free-text',
  temperature: '"Temperature", "Storage Temp", "Storage Temperature" (e.g. "Ambient", "Chilled", "Frozen", "2-8°C")',
  cutoffTime: '"Cut-off time", "Cutoff", "Order Cut-off", "Order Cutoff" (e.g. "20:00:00", "8 PM")',
  productType: '"Product Type" when it represents a top-level classification like "Food", "Beverage", "Personal Care". Free-text',
};

function renderJsonType(field: ItemAttributeField): string {
  switch (field.type) {
    case 'number':
      return 'number|null';
    case 'boolean':
      return 'true|false|null';
    default:
      return 'string|null';
  }
}

function renderFieldHint(field: ItemAttributeField): string {
  const label = field.label;
  const type = field.type;
  const bits: string[] = [];

  // Start with any curated FMCG synonyms for this key — they're
  // battle-tested and produce better results than Claude fuzzy-matching
  // against the label alone.
  const synonyms = FMCG_COLUMN_SYNONYMS[field.key];
  if (synonyms) {
    bits.push(`Source columns: ${synonyms}`);
  } else {
    bits.push(`Source column: match "${label}" or close synonyms/variants in the spreadsheet header row`);
  }

  if (field.placeholder) bits.push(`Example: ${field.placeholder}`);
  if (field.help) bits.push(field.help);

  if (type === 'select' && field.options?.length) {
    const allowed = field.options.map((o) => `"${o.value}"`).join(', ');
    bits.push(`Allowed values: ${allowed}. If the source cell doesn't match any of these, leave null.`);
  } else if (type === 'boolean') {
    bits.push('Map yes/true/1 → true; no/false/0 → false; otherwise null');
  } else if (type === 'number') {
    bits.push('Integer or decimal number only — strip currency symbols and commas');
  }

  return `- **${field.key}** (${label}): ${bits.join('. ')}.`;
}

/**
 * Builds the system + user prompts for the item extraction call. The
 * prompts are schema-aware: the "attributes" section is generated from
 * the tenant's attribute schema, so a retail tenant gets asked about
 * size/color/fabric while a food & beverage tenant still gets asked
 * about grammage/packing type/shelf life.
 *
 * Returns:
 *   - system: role/behaviour instructions and the response JSON shape
 *   - user:   a short reminder + the user's spreadsheet text (the caller
 *             appends the text).
 */
export function buildItemExtractionPrompts(schema: ItemAttributeSchema): {
  system: string;
  user: string;
} {
  const attributeSection =
    schema.length === 0
      ? 'The tenant has no custom catalogue attributes configured. Leave the "attributes" object empty: `{}`.'
      : schema.map(renderFieldHint).join('\n');

  const attributeJsonShape =
    schema.length === 0
      ? '      "attributes": {}'
      : '      "attributes": {\n' +
        schema.map((f) => `        "${f.key}": ${renderJsonType(f)}`).join(',\n') +
        '\n      }';

  const system = `You are an expert at extracting product/service master data from arbitrary spreadsheets exported by Indian SMEs (Tally, Zoho, supplier price lists, distributor sheets, NPD/NPI catalogs, tender documents, etc).

The input is the textual content of a CSV or Excel file. It may contain:
- Header rows, column titles, footer rows, page numbers
- Vendor/company addresses, phone numbers, GSTINs at the top
- Tax breakdowns, totals, terms & conditions, signatures at the bottom
- Multiple sheets concatenated, each prefixed with "=== Sheet: <name> ==="
- Merged cells flattened into blank cells
- Currency in formats like ₹1,250.00, Rs. 1250, 1250/-, $19.99

YOUR JOB: identify rows that represent SELLABLE PRODUCTS OR SERVICES (item master rows). Ignore everything else.

# Hard rules

- Return ONLY valid JSON. No markdown fences, no prose outside the JSON.
- Skip rows that are headers, totals, subtotals, taxes, page numbers, addresses, or notes.
- **Skip any row that does not have a name AND at least one of (sku, ean).** A row with no identifier is non-importable — drop it silently.
- Maximum 500 items per response. If the document has more, return the first 500 and add a note.

# Universal column mapping (same for every tenant)

Map these common spreadsheet columns to the top-level JSON fields. Column names are case-insensitive and may have spaces, dashes, or punctuation.

**name** ← "Product Name", "Item Name", "Item Description", "Product", "Particulars", "Item", "Name"

**sku** ← "SKU", "SKU Code", "Item Code", "Material Code", "Article Code", "Product Code", "Internal Code". Do NOT use EAN/Barcode here — they go in **ean**.

**ean** ← "EAN", "EAN Code", "EAN-13", "Barcode", "Bar Code", "UPC", "GTIN". 8-14 digit codes. Keep as a string (preserve leading zeros).

**hsnSacCode** ← "HSN", "HSN Code", "HSN/SAC", "SAC", "SAC Code", "Tax Code". 4-8 digit numbers only. SAC = 6 digits starting with 99.

**unit** ← combine a size/grammage column with a UOM column into a single readable string.
  - Separate columns (e.g. "Size: 200" + "UOM: g"): combine as "200g".
  - Already combined ("200g", "1 ltr", "500ml"): keep as-is, normalize spacing.
  - Compact short forms: g, kg, ml, ltr, L, mtr, m, cm, mm, nos, pcs, pkt, box, dz, ctn.

**defaultSellingPrice** ← "Selling Price", "Sale Price", "Retail Price", "RSP", "Trade Price", "TP", "PTR", "Distributor Price", "Wholesale Price", "Rate", "Net Rate", "Landing Price", "Price"

**defaultPurchasePrice** ← "Purchase Price", "Buy Price", "Landing Cost", "Procurement Price", "PTD"

**mrp** ← "MRP", "Maximum Retail Price", "Print Price", "Listed Price", "Consumer Price"

**costPrice** ← "Cost Price", "COGM", "Production Cost", "Manufacturing Cost", "Std Cost", "Standard Cost"

**basicPrice** ← "Basic Price", "Base Price", "Net Price", "Pre-tax Price", "Price Before Tax"

**gstRate** ← "GST", "GST%", "GST Rate", "Tax %", "Tax Rate". Number 0-28. Sum CGST+SGST if split.

**gstValue** ← "GST Value", "GST Amount", "Tax Amount", "Tax Value". Absolute rupees, not percentage.

**margin** ← "Margin", "Margin %", "Markup", "Markup %", "Profit Margin". 0-100.

**category** ← "Category", "Group", "Product Group", "Department", "Class", "Item Group"

**subcategory** ← "Subcategory", "Sub Category", "Sub-Category", "Variant", "Sub Group", "Sub Type", "Type", "Brand Variant", "Flavour", "Flavor". **Always check for this column.**

**description** ← "Description", "Details", "Product Details", "Long Description", "About"

**type** ← default "product". Use "service" only if clearly a service (consultation, installation, labour, AMC, freight, transportation, etc).

# Tenant-specific catalogue attributes

These map to the "attributes" object in the response. Each key must exactly match the bold identifier below — do NOT invent new keys. For every attribute, look for the described source columns and coerce the value to the type listed. If a column is missing, set that attribute to null (still include the key).

${attributeSection}

# Price normalization

Strip currency symbols (₹, Rs., Rs, $), commas in numbers (1,250 → 1250), trailing "/-", and convert to plain numbers. Don't invent prices that aren't in the source.

# If a field cannot be determined, use null. Do not guess.

# JSON schema (return EXACTLY this shape)

{
  "items": [
    {
      "name": "string",
      "sku": "string|null",
      "ean": "string|null",
      "type": "product"|"service",
      "hsnSacCode": "string|null",
      "unit": "string|null",
      "defaultSellingPrice": number|null,
      "defaultPurchasePrice": number|null,
      "basicPrice": number|null,
      "mrp": number|null,
      "costPrice": number|null,
      "gstRate": number|null,
      "gstValue": number|null,
      "margin": number|null,
      "category": "string|null",
      "subcategory": "string|null",
      "description": "string|null",
${attributeJsonShape}
    }
  ],
  "notes": "string",
  "confidence": number
}

"notes": one short sentence describing how many items you found, which columns you mapped to which fields, how many rows you skipped (and why), and any ambiguity.

"confidence": a number between 0 and 1 indicating how cleanly the data extracted. 1.0 = perfectly structured table. 0.5 = some ambiguity. Below 0.5 = significant guessing.`;

  const user = `Extract all item master rows from the following spreadsheet content and return them as the JSON object specified.

Remember:
- Skip any row without a name AND at least one identifier (sku or ean)
- EAN/Barcode goes in the **ean** field, NOT the sku field — they are distinct
- Combine size/grammage with UOM into the unit field
- Always map subcategory if a Sub Category / Variant column exists
- Populate the "attributes" object using the tenant-specific keys above — do not add new keys

Spreadsheet content:
`;

  return { system, user };
}

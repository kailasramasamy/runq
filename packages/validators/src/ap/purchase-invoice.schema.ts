import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

const taxCategorySchema = z.enum(['taxable', 'exempt', 'nil_rated', 'zero_rated', 'reverse_charge']);

const invoiceItemSchema = z.object({
  itemName: z.string().min(1).max(255),
  sku: z.string().max(100).nullish(),
  quantity: z.number().positive('Quantity must be positive'),
  // Negative unit prices are valid for discount/round-off lines, mirroring
  // the rule for [amount] below.
  unitPrice: z.number(),
  // Negative amounts are valid for discount lines / credit adjustments;
  // only zero is meaningless on a bill line.
  amount: z.number().refine((n) => n !== 0, { message: 'Amount cannot be zero' }),
  // GST fields (optional for backward compat)
  hsnSacCode: hsnSacCodeSchema.nullish(),
  taxCategory: taxCategorySchema.nullish(),
  taxRate: z.number().min(0).max(100).nullish(),
  cessRate: z.number().min(0).max(100).nullish(),
  // TDS fields
  tdsSection: z.string().max(20).nullish(),
  tdsRate: z.number().min(0).max(100).nullish(),
  // AP Pattern-B: "Save to vendor catalog" toggle. Off by default for
  // first bill from a vendor, recommended ON for repeat lines. Server
  // upserts into vendor_catalog_items on bill save.
  saveToCatalog: z.boolean().optional(),
});

/**
 * AP Pattern-B (spec §3.3): a single row in the "Items received into stock"
 * sub-form on the bill review screen. Independent of bill lines — a bill
 * may have 10 financial lines and only 2 items-received rows.
 */
const itemsReceivedLineSchema = z.object({
  inventoryItemId: z.string().uuid(),
  qty: z.number().positive('Received qty must be positive'),
  unitCost: z.number().nonnegative('Unit cost cannot be negative'),
  // Per-line warehouse override; falls back to bill-level warehouseId.
  warehouseId: z.string().uuid().nullish(),
  // Only set for batch-tracked items; server validates against item flags.
  batchNo: z.string().max(60).nullish(),
  mfgDate: z.string().date().nullish(),
  expiryDate: z.string().date().nullish(),
  // Only set for serial-tracked items; server validates length === qty.
  serialNos: z.array(z.string().min(1)).nullish(),
  notes: z.string().nullish(),
});

export const createPurchaseInvoiceSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(50),
  invoiceDate: z.string().date(),
  dueDate: z.string().date(),
  poId: z.string().uuid().nullish(),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item required'),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().positive('Total must be positive'),
  notes: z.string().nullish(),
  // GST fields (optional for backward compat)
  reverseCharge: z.boolean().default(false),
  // TDS header-level
  tdsSection: z.string().max(20).nullish(),
  // Apply any open advance to suppliers from this vendor against this bill
  // (FIFO, up to bill total). Default true — set false to keep advance for a later bill.
  applyAdvance: z.boolean().optional(),
  // ─── AP Pattern-B (spec §3) ───────────────────────────────────────────
  // Default warehouse for the items-received sub-form. Required if any
  // itemsReceived line omits its own warehouseId.
  warehouseId: z.string().uuid().nullish(),
  // "☑ Goods received with this invoice" toggle. When true + itemsReceived
  // is non-empty, the bill-post service inline-creates an inventory GRN.
  // Optional (defaults to false in the service) so existing callers that
  // construct CreatePurchaseInvoiceInput inline don't need updates.
  goodsReceived: z.boolean().optional(),
  // Items physically received into stock. Independent of bill lines.
  itemsReceived: z.array(itemsReceivedLineSchema).optional(),
});

export const updatePurchaseInvoiceSchema = createPurchaseInvoiceSchema.partial();

export const PURCHASE_INVOICE_STATUS_VALUES = [
  'draft', 'pending_match', 'matched', 'approved', 'partially_paid', 'paid', 'cancelled',
] as const;

export const purchaseInvoiceFilterSchema = z.object({
  vendorId: z.string().uuid().optional(),
  // Accepts a single status (`approved`) or a comma-separated list
  // (`draft,approved,partially_paid`) so tabs can express groups like
  // "all unpaid". Each part must be a valid status.
  status: z.string()
    .refine(
      (s) => s.split(',').map((p) => p.trim()).filter(Boolean)
        .every((p) => (PURCHASE_INVOICE_STATUS_VALUES as readonly string[]).includes(p)),
      { message: `status must be one or more of: ${PURCHASE_INVOICE_STATUS_VALUES.join(', ')}` },
    )
    .optional(),
  vendorCategory: z.string().optional(),
  vendorTag: z.string().optional(),
  search: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const threeWayMatchSchema = z.object({
  poId: z.string().uuid(),
  grnId: z.string().uuid(),
});

export const approveInvoiceSchema = z.object({
  notes: z.string().nullish(),
});

export type CreatePurchaseInvoiceInput = z.infer<typeof createPurchaseInvoiceSchema>;
export type UpdatePurchaseInvoiceInput = z.infer<typeof updatePurchaseInvoiceSchema>;
export type PurchaseInvoiceFilter = z.infer<typeof purchaseInvoiceFilterSchema>;
export type ThreeWayMatchInput = z.infer<typeof threeWayMatchSchema>;

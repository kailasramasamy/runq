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
});

export const updatePurchaseInvoiceSchema = createPurchaseInvoiceSchema.partial();

export const purchaseInvoiceFilterSchema = z.object({
  vendorId: z.string().uuid().optional(),
  status: z.enum(['draft', 'pending_match', 'matched', 'approved', 'partially_paid', 'paid', 'cancelled']).optional(),
  vendorCategory: z.string().optional(),
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

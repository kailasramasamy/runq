import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

const taxCategorySchema = z.enum(['taxable', 'exempt', 'nil_rated', 'zero_rated', 'reverse_charge']);

const invoiceItemSchema = z.object({
  /**
   * The existing line this input refers to, on an amendment.
   *
   * Delivery-note lines carry a foreign key to `sales_invoice_items.id`, so an
   * amendment has to keep the surviving rows rather than swap them for fresh
   * ones. Sending the id makes that matching exact; without it the server
   * falls back to matching on content, which is right for the ordinary cases
   * but cannot tell two identical lines apart.
   */
  id: z.string().uuid().nullish(),
  itemId: z.string().uuid().nullish(),
  description: z.string().min(1).max(500),
  uom: z.string().max(20).nullish(),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  amount: z.number().positive('Amount must be positive'),
  // GST fields (optional for backward compat)
  hsnSacCode: hsnSacCodeSchema.nullish(),
  taxCategory: taxCategorySchema.nullish(),
  taxRate: z.number().min(0).max(100).nullish(),
  cessRate: z.number().min(0).max(100).nullish(),
});

export const createSalesInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string().date(),
  dueDate: z.string().date(),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item required'),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().positive('Total must be positive'),
  notes: z.string().nullish(),
  poNumber: z.string().max(50).nullish(),
  // GST fields (optional for backward compat)
  reverseCharge: z.boolean().default(false),
});

export const updateSalesInvoiceSchema = createSalesInvoiceSchema.partial();

export const salesInvoiceFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'unpaid']).optional(),
  overdue: z.coerce.boolean().optional(),
  search: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

/** Accepts one address or a comma-separated list, so a CC field can hold several. */
const emailList = z.string().refine(
  (v) => v.split(',').map((e) => e.trim()).filter(Boolean).every((e) => z.string().email().safeParse(e).success),
  { message: 'Must be an email address, or several separated by commas' },
);

export const sendInvoiceSchema = z.object({
  channel: z.enum(['email', 'whatsapp']).default('email'),
  /** Opt-in: the invoice is only emailed to the customer when this is true. */
  sendEmail: z.boolean().default(false),
  /** Overrides the customer's stored email. Comma-separated for multiple. */
  emailTo: emailList.nullish(),
  /** Overrides the customer's stored CC. Comma-separated for multiple. */
  emailCc: emailList.nullish(),
  /** Attach the rendered invoice PDF. */
  attachPdf: z.boolean().default(true),
  whatsappTo: z.string().max(20).nullish(),
});

export const markPaidSchema = z.object({
  paymentDate: z.string().date(),
  referenceNumber: z.string().nullish(),
  notes: z.string().nullish(),
});

export type CreateSalesInvoiceInput = z.infer<typeof createSalesInvoiceSchema>;
export type UpdateSalesInvoiceInput = z.infer<typeof updateSalesInvoiceSchema>;
export type SalesInvoiceFilter = z.infer<typeof salesInvoiceFilterSchema>;
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;
export type MarkPaidInput = z.infer<typeof markPaidSchema>;

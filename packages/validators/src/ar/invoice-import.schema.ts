import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

/**
 * Validators for the invoice import endpoints.
 *
 * The /parse endpoint takes multipart files; we don't validate the file
 * bodies themselves at this layer (multipart is handled by the route).
 * The /commit endpoint takes a structured payload that the client
 * round-trips from the parse response, possibly with mutated match
 * resolutions.
 */

const matchSourceSchema = z.enum([
  'exact-master',
  'exact-alias',
  'gstin',
  'fuzzy-master',
  'fuzzy-alias',
  'unmatched',
]);

const matchSuggestionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
});

const matchResultSchema = z.object({
  resolvedId: z.string().uuid().nullable(),
  source: matchSourceSchema,
  confidence: z.number().min(0).max(1),
  resolvedName: z.string().nullable(),
  suggestions: z.array(matchSuggestionSchema),
});

const parsedLineItemSchema = z.object({
  sourceName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  hsnSacCode: hsnSacCodeSchema.nullable(),
  taxRate: z.number().min(0).max(100).nullable(),
  lineTotal: z.number().nonnegative(),
  match: matchResultSchema,
});

const parsedInvoiceSchema = z.object({
  sourceFile: z.string(),
  parserUsed: z.enum(['auto', 'generic-rows', 'single-invoice-template', 'heuristic', 'ai']),
  invoiceNumber: z.string().min(1).max(50),
  invoiceDate: z.string().date(),
  dueDate: z.string().date(),
  poNumber: z.string().nullable(),
  notes: z.string().nullable(),
  customerSourceName: z.string().min(1),
  customerSourceGstin: z.string().nullable(),
  customerMatch: matchResultSchema,
  lineItems: z.array(parsedLineItemSchema).min(1),
  sourceGrandTotal: z.number().nonnegative(),
  computedSubtotal: z.number().nonnegative(),
  parseable: z.boolean(),
  warnings: z.array(z.string()),
});

export const parseInvoicesQuerySchema = z.object({
  format: z
    .enum(['auto', 'generic-rows', 'single-invoice-template', 'heuristic', 'ai'])
    .default('auto'),
});

export const commitInvoiceImportSchema = z.object({
  invoices: z.array(parsedInvoiceSchema).min(1),
  defaultStatus: z.enum(['draft', 'sent']).default('draft'),
  persistAliases: z.boolean().default(true),
});

export type CommitInvoiceImportInput = z.infer<typeof commitInvoiceImportSchema>;
export type ParseInvoicesQueryInput = z.infer<typeof parseInvoicesQuerySchema>;

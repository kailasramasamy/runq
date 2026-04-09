import { z } from 'zod';

export const poFileSourceEnum = z.enum([
  'share_sheet',
  'web_drop',
  'web_upload',
  'paste_image',
]);

export const poTextSourceEnum = z.enum(['paste_text']);

/** Multipart file upload — `source` arrives as a string form field. */
export const poUploadFileFormSchema = z.object({
  source: poFileSourceEnum,
  sourceMetadata: z.string().optional(), // JSON-encoded blob if present
});

/** JSON body for the paste-text endpoint. */
export const poUploadTextSchema = z.object({
  text: z.string().min(1).max(50_000),
  source: poTextSourceEnum.default('paste_text'),
  sourceMetadata: z.record(z.unknown()).nullish(),
});

export const poInboxFilterSchema = z.object({
  status: z
    .enum(['all', 'pending', 'ready', 'needs_review', 'error', 'approved', 'rejected'])
    .optional(),
  customerId: z.string().uuid().optional(),
  source: z
    .enum(['share_sheet', 'web_drop', 'web_upload', 'paste_image', 'paste_text', 'email_forward'])
    .optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

// PATCH /po-drafts/:id — header field edits during review.
// All fields optional; only the keys present in the body are touched.
export const updatePoDraftSchema = z.object({
  customerId: z.string().uuid().nullish(),
  poNumberExtracted: z.string().max(100).nullish(),
  poDate: z.string().date().nullish(),
  deliveryDate: z.string().date().nullish(),
});

// PATCH /po-drafts/:id/lines/:lineId — single-line edits.
// `recordAlias` defaults to true: any time the user picks an item, we
// remember "this customer's word for that item" so the next PO from the
// same customer with the same description matches automatically.
export const updatePoDraftLineSchema = z.object({
  matchedItemId: z.string().uuid().nullish(),
  quantity: z.number().nonnegative().nullish(),
  rate: z.number().nonnegative().nullish(),
  recordAlias: z.boolean().default(true),
});

// POST /po-drafts/:id/approve — converts the draft into a draft sales_invoices
// row via InvoiceService.create. v1 takes no body fields; the user can edit
// the draft invoice afterwards in the existing AR/Invoices flow.
export const approvePoDraftSchema = z.object({}).optional();

// POST /po-drafts/:id/reject — record why and stop the workflow.
export const rejectPoDraftSchema = z.object({
  reason: z.string().min(1).max(500),
});

// POST /po-drafts/bulk-approve — convert N ready drafts at once.
export const bulkApprovePoDraftsSchema = z.object({
  uploadIds: z.array(z.string().uuid()).min(1).max(50),
});

export type PoUploadTextInput = z.infer<typeof poUploadTextSchema>;
export type PoInboxFilter = z.infer<typeof poInboxFilterSchema>;
export type UpdatePoDraftInput = z.infer<typeof updatePoDraftSchema>;
export type UpdatePoDraftLineInput = z.infer<typeof updatePoDraftLineSchema>;
export type RejectPoDraftInput = z.infer<typeof rejectPoDraftSchema>;
export type BulkApprovePoDraftsInput = z.infer<typeof bulkApprovePoDraftsSchema>;

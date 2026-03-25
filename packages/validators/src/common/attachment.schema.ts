import { z } from 'zod';

export const attachmentEntityTypeSchema = z.enum([
  'sales_invoice',
  'purchase_invoice',
  'payment',
  'receipt',
  'expense',
]);

export type AttachmentEntityTypeInput = z.infer<typeof attachmentEntityTypeSchema>;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
] as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const attachmentParamsSchema = z.object({
  entityType: attachmentEntityTypeSchema,
  entityId: z.string().uuid(),
});

export const attachmentIdSchema = z.object({
  id: z.string().uuid(),
});

export type AttachmentParamsInput = z.infer<typeof attachmentParamsSchema>;
export type AttachmentIdInput = z.infer<typeof attachmentIdSchema>;

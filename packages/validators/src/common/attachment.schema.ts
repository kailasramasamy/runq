import { z } from 'zod';

export const attachmentEntityTypeSchema = z.enum([
  'sales_invoice',
  'purchase_invoice',
  'payment',
  'receipt',
  'expense',
  'employee',
]);

export type AttachmentEntityTypeInput = z.infer<typeof attachmentEntityTypeSchema>;

/**
 * HR employee document kinds. Used to group the Documents tab into sections
 * (Identity & Address, Employment, Other) and to filter listings.
 */
export const employeeDocumentKindSchema = z.enum([
  'aadhaar',
  'pan',
  'passport',
  'driving_license',
  'voter_id',
  'address_proof',
  'bank_passbook',
  'photo_id_card',
  'resume',
  'offer_letter',
  'employment_contract',
  'educational_certificate',
  'experience_letter',
  'relieving_letter',
  'appraisal_letter',
  'other',
]);

export type EmployeeDocumentKindInput = z.infer<typeof employeeDocumentKindSchema>;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
] as const;

/** Stricter whitelist for HR docs — images + PDF only. */
export const HR_DOC_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
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

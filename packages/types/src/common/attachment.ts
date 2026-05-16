export type AttachmentEntityType =
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'payment'
  | 'receipt'
  | 'expense'
  | 'employee';

/**
 * Categorisation tag for HR document uploads. Finance attachments leave
 * `documentKind` null; the HR UI groups Documents-tab cards by this value.
 * Multiple files per kind are allowed — Aadhaar usually has front + back.
 */
export type EmployeeDocumentKind =
  | 'aadhaar'
  | 'pan'
  | 'passport'
  | 'driving_license'
  | 'voter_id'
  | 'address_proof'
  | 'bank_passbook'
  | 'photo_id_card'
  | 'offer_letter'
  | 'employment_contract'
  | 'educational_certificate'
  | 'experience_letter'
  | 'relieving_letter'
  | 'appraisal_letter'
  | 'other';

export interface DocumentAttachment {
  id: string;
  tenantId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  documentKind: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  /** YYYY-MM-DD when set. HR docs use it for ID / contract expiry
   *  tracking; finance attachments leave it null. */
  expiryDate: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

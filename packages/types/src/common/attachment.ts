export type AttachmentEntityType =
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'payment'
  | 'receipt'
  | 'expense';

export interface DocumentAttachment {
  id: string;
  tenantId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  uploadedBy: string | null;
  createdAt: string;
}

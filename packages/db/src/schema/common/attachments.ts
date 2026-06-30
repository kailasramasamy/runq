import { pgTable, uuid, varchar, integer, timestamp, pgEnum, index, date } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

export const attachmentEntityTypeEnum = pgEnum('attachment_entity_type', [
  'sales_invoice',
  'purchase_invoice',
  'payment',
  'receipt',
  'expense',
  'employee',
  'farmer',
  'bank_transaction',
]);

export const documentAttachments = pgTable('document_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  entityType: attachmentEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  // Optional categorisation tag (e.g. 'aadhaar', 'pan', 'offer_letter') —
  // nullable for the finance attachments that don't need a kind. HR rows
  // always set it; the UI groups Documents tab cards by this value.
  documentKind: varchar('document_kind', { length: 40 }),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  /// Optional expiry — HR docs use this for Aadhaar / passport / driving
  /// licence / employment contract end-dates. Surfaced on the dashboard's
  /// "expiring soon" section so compliance gaps get caught early.
  expiryDate: date('expiry_date'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_da_tenant_entity').on(t.tenantId, t.entityType, t.entityId),
  index('idx_da_entity_kind').on(t.tenantId, t.entityType, t.entityId, t.documentKind),
  // Powers the expiring-docs dashboard query — index by tenant + expiry
  // so the "next 90 days" sweep doesn't full-scan the table.
  index('idx_da_tenant_expiry').on(t.tenantId, t.expiryDate),
]);

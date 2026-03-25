import { pgTable, uuid, varchar, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

export const attachmentEntityTypeEnum = pgEnum('attachment_entity_type', [
  'sales_invoice',
  'purchase_invoice',
  'payment',
  'receipt',
  'expense',
]);

export const documentAttachments = pgTable('document_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  entityType: attachmentEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_da_tenant_entity').on(t.tenantId, t.entityType, t.entityId),
]);

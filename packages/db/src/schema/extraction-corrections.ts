import { pgTable, uuid, varchar, jsonb, integer, timestamp, pgEnum, numeric, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

export const extractionDocTypeEnum = pgEnum('extraction_doc_type', ['ap_bill', 'ar_po', 'bank_statement', 'hr_resume']);
export const extractionMethodEnum = pgEnum('extraction_method', ['local', 'ai', 'template', 'manual']);

export const extractionCorrections = pgTable('extraction_corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  documentType: extractionDocTypeEnum('document_type').notNull(),
  sourceEntityType: varchar('source_entity_type', { length: 40 }),
  sourceEntityId: uuid('source_entity_id'),
  vendorId: uuid('vendor_id'),
  customerId: uuid('customer_id'),
  aiOutput: jsonb('ai_output').notNull(),
  userOutput: jsonb('user_output').notNull(),
  diff: jsonb('diff').notNull(),
  aiConfidence: numeric('ai_confidence', { precision: 5, scale: 2 }),
  extractionMethod: extractionMethodEnum('extraction_method').notNull().default('ai'),
  fieldsChangedCount: integer('fields_changed_count').notNull().default(0),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ext_corr_tenant_vendor').on(t.tenantId, t.vendorId, t.createdAt),
  index('idx_ext_corr_tenant_customer').on(t.tenantId, t.customerId, t.createdAt),
  index('idx_ext_corr_tenant_doctype').on(t.tenantId, t.documentType, t.createdAt),
]);

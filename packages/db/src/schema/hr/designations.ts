import { pgTable, uuid, varchar, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const designations = pgTable('designations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  level: integer('level'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_desig_tenant').on(t.tenantId),
  uniqueIndex('uq_desig_tenant_name').on(t.tenantId, t.name),
]);

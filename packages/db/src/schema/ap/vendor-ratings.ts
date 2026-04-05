import { pgTable, uuid, varchar, integer, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { vendors } from './vendors';
import { users } from '../user';

export const vendorRatings = pgTable('vendor_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
  period: varchar('period', { length: 10 }).notNull(),
  deliveryScore: integer('delivery_score').notNull(),
  qualityScore: integer('quality_score').notNull(),
  pricingScore: integer('pricing_score').notNull(),
  overallScore: integer('overall_score').notNull(),
  notes: text('notes'),
  ratedBy: uuid('rated_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tenantId, t.vendorId, t.period),
]);

import { pgTable, uuid, varchar, integer, decimal, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';

export const customerTypeEnum = pgEnum('customer_type', ['b2b', 'payment_gateway']);

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: customerTypeEnum('type').notNull().default('b2b'),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  gstin: varchar('gstin', { length: 15 }),
  pan: varchar('pan', { length: 10 }),
  addressLine1: varchar('address_line1', { length: 255 }),
  addressLine2: varchar('address_line2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  pincode: varchar('pincode', { length: 10 }),
  creditLimit: decimal('credit_limit', { precision: 15, scale: 2 }),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  contactPerson: varchar('contact_person', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

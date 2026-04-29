import { pgTable, uuid, varchar, integer, jsonb, boolean, timestamp, pgEnum, text, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenant';

export const billingIntervalEnum = pgEnum('billing_interval', ['monthly', 'yearly']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['trialing', 'active', 'past_due', 'cancelled', 'expired']);
export const platformInvoiceStatusEnum = pgEnum('platform_invoice_status', ['draft', 'issued', 'paid', 'failed', 'refunded', 'cancelled']);

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  priceCents: integer('price_cents').notNull(),
  interval: billingIntervalEnum('interval').notNull().default('monthly'),
  modules: jsonb('modules').notNull().default([]),
  features: jsonb('features').notNull().default({}),
  razorpayPlanId: varchar('razorpay_plan_id', { length: 80 }),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAt: timestamp('cancel_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  razorpaySubscriptionId: varchar('razorpay_subscription_id', { length: 80 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_subs_tenant').on(t.tenantId),
  index('idx_subs_status').on(t.status),
]);

export const platformInvoices = pgTable('platform_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  number: varchar('number', { length: 40 }).notNull().unique(),
  amountCents: integer('amount_cents').notNull(),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  status: platformInvoiceStatusEnum('status').notNull().default('draft'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  razorpayInvoiceId: varchar('razorpay_invoice_id', { length: 80 }),
  pdfUrl: text('pdf_url'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_pinv_tenant_created').on(t.tenantId, t.createdAt),
  index('idx_pinv_status').on(t.status),
]);

export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 20 }).notNull().default('razorpay'),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  externalId: varchar('external_id', { length: 120 }),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  invoiceId: uuid('invoice_id').references(() => platformInvoices.id),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_payevt_tenant').on(t.tenantId, t.createdAt),
  index('idx_payevt_external').on(t.provider, t.externalId),
]);

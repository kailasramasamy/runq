import { pgTable, uuid, varchar, integer, boolean, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { salesInvoices } from './invoices';

export const dunningChannelEnum = pgEnum('dunning_channel', ['email', 'sms', 'whatsapp']);
export const dunningActionEnum = pgEnum('dunning_action', ['send_reminder', 'stop_supply', 'escalate_to_manager']);

export const dunningRules = pgTable('dunning_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 100 }).notNull(),
  daysAfterDue: integer('days_after_due').notNull(),
  channel: dunningChannelEnum('channel').notNull().default('email'),
  subjectTemplate: varchar('subject_template', { length: 500 }),
  bodyTemplate: text('body_template').notNull(),
  escalationLevel: integer('escalation_level').notNull().default(1),
  action: dunningActionEnum('action').notNull().default('send_reminder'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dunningLog = pgTable('dunning_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  invoiceId: uuid('invoice_id').notNull().references(() => salesInvoices.id),
  ruleId: uuid('rule_id').notNull().references(() => dunningRules.id),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  channel: dunningChannelEnum('channel').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('sent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

import {
  pgTable, uuid, varchar, integer, text, timestamp, boolean, jsonb,
  pgEnum, index,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { employees } from './employees';

export const hrAgentActionStatusEnum = pgEnum('hr_agent_action_status', [
  'success', 'failed', 'user_rejected', 'pending_confirmation',
]);

export const ticketStatusEnum = pgEnum('hr_ticket_status', [
  'open', 'in_progress', 'waiting_human', 'resolved', 'closed',
]);

export const ticketPriorityEnum = pgEnum('hr_ticket_priority', [
  'low', 'normal', 'high', 'urgent',
]);

export const ticketCategoryEnum = pgEnum('hr_ticket_category', [
  'payroll', 'leave', 'attendance', 'reimbursement',
  'asset', 'it', 'document', 'general',
]);

// Employee-raised HR query / request.
export const hrTickets = pgTable('hr_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ticketNumber: varchar('ticket_number', { length: 30 }).notNull(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  category: ticketCategoryEnum('category').notNull().default('general'),
  priority: ticketPriorityEnum('priority').notNull().default('normal'),
  subject: varchar('subject', { length: 200 }).notNull(),
  description: text('description'),
  status: ticketStatusEnum('status').notNull().default('open'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  slaHours: integer('sla_hours').notNull().default(48),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  // Timestamp of the most recent agent → human escalation. Surfaced in UI
  // as an "AI flagged" badge so HR can prioritise these.
  agentEscalatedAt: timestamp('agent_escalated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_ticket_tenant_status').on(t.tenantId, t.status),
  index('idx_ticket_tenant_emp').on(t.tenantId, t.employeeId),
  index('idx_ticket_assigned').on(t.tenantId, t.assignedTo),
]);

// Comment thread on a ticket. Author is the user who wrote it
// (employee, HR, or admin).
export const hrTicketComments = pgTable('hr_ticket_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => hrTickets.id, { onDelete: 'cascade' }),
  authorUserId: uuid('author_user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  // Agent provenance — null/false for human comments. Drafts surface as a
  // special card above the composer; sent agent replies show a "AI" chip.
  isAgentDraft: boolean('is_agent_draft').notNull().default(false),
  agentConfidence: varchar('agent_confidence', { length: 10 }),
  agentCitations: jsonb('agent_citations').$type<Array<{ tool: string; label: string }>>(),
  agentMetadata: jsonb('agent_metadata').$type<Record<string, unknown>>(),
  // Cached translations of `body` into non-English languages. Filled by the
  // translator service after a comment is sent so the employee's device can
  // render and TTS-read in their preferred language.
  translationText: jsonb('translation_text').$type<Record<string, string>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tcomment_ticket').on(t.ticketId),
]);

// Per-tool-call audit log. Mirrors support_agent_actions. Write actions
// (submit_leave_request, submit_regularization, issue_letter, close_ticket)
// are the critical case — they mutate real records via the agent.
export const hrAgentActions = pgTable('hr_agent_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => hrTickets.id, { onDelete: 'cascade' }),
  commentId: uuid('comment_id').references(() => hrTicketComments.id, { onDelete: 'set null' }),
  toolName: varchar('tool_name', { length: 64 }).notNull(),
  args: jsonb('args').notNull(),
  result: jsonb('result'),
  status: hrAgentActionStatusEnum('status').notNull().default('success'),
  durationMs: integer('duration_ms'),
  errorDetails: text('error_details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_haa_ticket').on(t.ticketId),
  index('idx_haa_tool_status').on(t.toolName, t.status),
]);

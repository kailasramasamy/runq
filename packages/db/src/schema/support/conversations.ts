import { pgTable, uuid, varchar, text, timestamp, pgEnum, index, jsonb } from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';

// ── Enums ──────────────────────────────────────────────────────────────

export const supportConversationStatusEnum = pgEnum('support_conversation_status', [
  'open',           // user just messaged, agent not yet responded
  'agent_replied',  // agent answered, awaiting user reply
  'waiting_human',  // escalated — human (you) needs to respond
  'resolved',       // marked resolved by user or human
  'closed',         // archived after inactivity
]);

export const supportMessageRoleEnum = pgEnum('support_message_role', [
  'user',
  'agent',
  'human',
]);

export const supportAgentActionStatusEnum = pgEnum('support_agent_action_status', [
  'success',
  'failed',
  'user_rejected',
  'pending_confirmation',
]);

// ── Tables ─────────────────────────────────────────────────────────────

export const supportConversations = pgTable('support_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: supportConversationStatusEnum('status').notNull().default('open'),
  subject: text('subject'),
  // Running agent-written summary — used as compact context on every turn
  // and as handoff context when escalating to a human.
  agentSummary: text('agent_summary'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  assignedTo: uuid('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sc_tenant_status').on(t.tenantId, t.status),
  index('idx_sc_user_last').on(t.userId, t.lastMessageAt),
  index('idx_sc_status_escalated').on(t.status, t.escalatedAt),
]);

export type SupportAttachment = {
  kind: 'image' | 'pdf' | 'log';
  url: string;
  name: string;
  size?: number;
};

export type SupportToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export const supportMessages = pgTable('support_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => supportConversations.id, { onDelete: 'cascade' }),
  role: supportMessageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls').$type<SupportToolCall[]>(),
  attachments: jsonb('attachments').$type<SupportAttachment[]>(),
  // Which model produced this message (only set for role=agent)
  model: varchar('model', { length: 64 }),
  // Token usage so we can monitor cost
  inputTokens: jsonb('input_tokens').$type<{ total: number; cached: number }>(),
  outputTokens: jsonb('output_tokens').$type<{ total: number }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_sm_conversation_created').on(t.conversationId, t.createdAt),
]);

export const supportAgentActions = pgTable('support_agent_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => supportConversations.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').references(() => supportMessages.id, { onDelete: 'set null' }),
  toolName: varchar('tool_name', { length: 64 }).notNull(),
  args: jsonb('args').notNull(),
  result: jsonb('result'),
  status: supportAgentActionStatusEnum('status').notNull().default('success'),
  durationMs: jsonb('duration_ms').$type<number>(),
  errorDetails: text('error_details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_saa_conversation').on(t.conversationId),
  index('idx_saa_tool_status').on(t.toolName, t.status),
]);

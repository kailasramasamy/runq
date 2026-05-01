/**
 * Support agent runtime — Claude Haiku 4.5 by default, with prompt caching
 * for the system prompt + tool definitions + RAG snippets. Sonnet 4.6 is the
 * fallback model for hard cases (after several unsuccessful tool rounds).
 *
 * One agent run = one user turn. The full conversation history is loaded
 * from Postgres on every call so the API stays stateless. The frozen prefix
 * (system + tools + RAG block) is identical across turns of the same
 * conversation, which lets the prompt cache do most of the work.
 */
import { eq, asc, and, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  supportConversations,
  supportMessages,
  supportAgentActions,
  type SupportToolCall,
} from '@runq/db';
import type Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlockParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { getStreamClient, isAIEnabled } from '../../utils/ai/claude.service';
import { SUPPORT_SYSTEM_PROMPT } from './prompts';
import { SUPPORT_TOOLS, executeSupportTool, type SupportToolContext } from './tools';
import { searchDocs, formatSnippetsForPrompt } from './rag';
import { notifyEscalation } from './notifier';
import { publishMessage } from './realtime';

const HAIKU = 'claude-haiku-4-5';
const SONNET = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const MAX_TOOL_ROUNDS = 6;
// After this many tool rounds without resolution, escalate to Sonnet on the
// NEXT conversation turn (not mid-loop — switching mid-loop kills the cache).
const SONNET_ESCALATION_THRESHOLD = 4;

export interface AgentRunResult {
  reply: string;                     // final assistant text
  escalated: boolean;                // true if escalate_to_human was invoked
  escalationSummary?: string;
  toolCallCount: number;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type SupportStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; toolName: string }
  | { type: 'tool_result'; toolName: string; ok: boolean }
  | { type: 'escalated'; summary?: string }
  | { type: 'done'; result: AgentRunResult }
  | { type: 'error'; message: string };

export async function runSupportTurn(opts: {
  db: Db;
  tenantId: string;
  userId: string;
  conversationId: string;
  userMessage: string;
}): Promise<AgentRunResult> {
  if (!isAIEnabled()) {
    throw new Error('AI features are not enabled. Set ANTHROPIC_API_KEY.');
  }
  const client = getStreamClient();
  if (!client) throw new Error('Anthropic client unavailable');

  const ctx: SupportToolContext = {
    db: opts.db,
    tenantId: opts.tenantId,
    userId: opts.userId,
    conversationId: opts.conversationId,
  };

  // 1. Persist the user's incoming message immediately
  await opts.db.insert(supportMessages).values({
    conversationId: opts.conversationId,
    role: 'user',
    content: opts.userMessage,
  });
  publishMessage({
    type: 'message_added',
    conversationId: opts.conversationId,
    tenantId: opts.tenantId,
    userId: opts.userId,
    role: 'user',
  });

  // 2. Build the conversation history (oldest → newest, excluding the just-inserted user msg)
  const history = await loadConversationHistory(opts.db, opts.conversationId);

  // 3. Choose model — Sonnet only if the prior conversation had many failed tool rounds
  const model = await chooseModel(opts.db, opts.conversationId);

  // 4. Pull RAG snippets for this turn — keyword search over /docs
  const ragSnippets = searchDocs(opts.userMessage, 3);
  const ragBlock = formatSnippetsForPrompt(ragSnippets);

  // 5. Drive the tool-use loop
  const messages: MessageParam[] = [...history, { role: 'user', content: opts.userMessage }];
  const result = await runToolLoop({ client, model, messages, ragBlock, ctx, db: opts.db });

  // 6. Persist final assistant message
  await opts.db.insert(supportMessages).values({
    conversationId: opts.conversationId,
    role: 'agent',
    content: result.reply,
    model,
    inputTokens: { total: result.inputTokens, cached: result.cacheReadTokens },
    outputTokens: { total: result.outputTokens },
  });
  publishMessage({
    type: 'message_added',
    conversationId: opts.conversationId,
    tenantId: opts.tenantId,
    userId: opts.userId,
    role: 'agent',
  });

  // 7. Update conversation status + last_message_at
  await opts.db
    .update(supportConversations)
    .set({
      status: result.escalated ? 'waiting_human' : 'agent_replied',
      escalatedAt: result.escalated ? new Date() : undefined,
      agentSummary: result.escalationSummary ?? undefined,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(supportConversations.id, opts.conversationId));

  // 8. Email the runQ team on first escalation (fire-and-forget)
  if (result.escalated) {
    notifyEscalation({
      db: opts.db,
      conversationId: opts.conversationId,
      tenantId: opts.tenantId,
      userId: opts.userId,
      agentSummary: result.escalationSummary,
      lastUserMessage: opts.userMessage,
    }).catch((err) => console.error('notifyEscalation failed:', err));
  }

  return { ...result, modelUsed: model };
}

/**
 * Streaming variant — yields text/tool/lifecycle events as the agent works.
 * The final `done` event carries the same AgentRunResult that runSupportTurn
 * would have returned. Side effects (DB writes, escalation email) happen at
 * the same lifecycle points as the non-streaming path.
 */
export async function* streamSupportTurn(opts: {
  db: Db;
  tenantId: string;
  userId: string;
  conversationId: string;
  userMessage: string;
}): AsyncGenerator<SupportStreamEvent> {
  if (!isAIEnabled()) {
    yield { type: 'error', message: 'AI features are not enabled. Set ANTHROPIC_API_KEY.' };
    return;
  }
  const client = getStreamClient();
  if (!client) {
    yield { type: 'error', message: 'Anthropic client unavailable' };
    return;
  }

  const ctx: SupportToolContext = {
    db: opts.db,
    tenantId: opts.tenantId,
    userId: opts.userId,
    conversationId: opts.conversationId,
  };

  await opts.db.insert(supportMessages).values({
    conversationId: opts.conversationId,
    role: 'user',
    content: opts.userMessage,
  });
  publishMessage({
    type: 'message_added',
    conversationId: opts.conversationId,
    tenantId: opts.tenantId,
    userId: opts.userId,
    role: 'user',
  });

  const history = await loadConversationHistory(opts.db, opts.conversationId);
  const model = await chooseModel(opts.db, opts.conversationId);
  const ragSnippets = searchDocs(opts.userMessage, 3);
  const ragBlock = formatSnippetsForPrompt(ragSnippets);

  const messages: MessageParam[] = [...history, { role: 'user', content: opts.userMessage }];
  const system: TextBlockParam[] = [{ type: 'text', text: SUPPORT_SYSTEM_PROMPT }];
  if (ragBlock) {
    system.push({ type: 'text', text: ragBlock, cache_control: { type: 'ephemeral' } });
  } else {
    system[0] = { ...system[0], cache_control: { type: 'ephemeral' } };
  }

  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
  let toolCalls = 0;
  let escalated = false;
  let escalationSummary: string | undefined;
  let finalReply = '';

  outer: for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: SUPPORT_TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        yield { type: 'tool_use_start', toolName: event.content_block.name };
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    totalInput += final.usage.input_tokens ?? 0;
    totalOutput += final.usage.output_tokens ?? 0;
    totalCacheRead += final.usage.cache_read_input_tokens ?? 0;
    totalCacheWrite += final.usage.cache_creation_input_tokens ?? 0;

    if (final.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: final.content });

      const toolUseBlocks = final.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const toolResults: ContentBlockParam[] = [];
      for (const tu of toolUseBlocks) {
        toolCalls++;
        const startedAt = Date.now();

        if (tu.name === 'escalate_to_human') {
          escalated = true;
          escalationSummary = String((tu.input as { summary?: string })?.summary ?? '');
          await recordAction(opts.db, ctx.conversationId, tu, { escalated: true }, 'success', Date.now() - startedAt);
          yield { type: 'escalated', summary: escalationSummary };
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: 'Escalated. The runQ team has been notified and will reply within an hour.',
          });
          continue;
        }

        const { result, isError } = await executeSupportTool(
          tu.name,
          tu.input as Record<string, unknown>,
          ctx,
        );
        await recordAction(opts.db, ctx.conversationId, tu, result, isError ? 'failed' : 'success', Date.now() - startedAt);
        yield { type: 'tool_result', toolName: tu.name, ok: !isError };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          is_error: isError || undefined,
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    finalReply = extractText(final.content) ||
      (escalated ? 'I\'ve flagged this for the runQ team — they\'ll reply within an hour.' : 'I wasn\'t able to put together an answer. Let me get someone from the team to help.');
    break outer;
  }

  if (!finalReply) {
    finalReply = 'This is taking longer than I can handle on my own. Let me hand it to the team — they\'ll reply within an hour.';
    escalated = true;
    escalationSummary = escalationSummary ?? 'Agent exceeded max tool rounds without resolving the question.';
  }

  await opts.db.insert(supportMessages).values({
    conversationId: opts.conversationId,
    role: 'agent',
    content: finalReply,
    model,
    inputTokens: { total: totalInput, cached: totalCacheRead },
    outputTokens: { total: totalOutput },
  });
  publishMessage({
    type: 'message_added',
    conversationId: opts.conversationId,
    tenantId: opts.tenantId,
    userId: opts.userId,
    role: 'agent',
  });

  await opts.db
    .update(supportConversations)
    .set({
      status: escalated ? 'waiting_human' : 'agent_replied',
      escalatedAt: escalated ? new Date() : undefined,
      agentSummary: escalationSummary ?? undefined,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(supportConversations.id, opts.conversationId));

  if (escalated) {
    notifyEscalation({
      db: opts.db,
      conversationId: opts.conversationId,
      tenantId: opts.tenantId,
      userId: opts.userId,
      agentSummary: escalationSummary,
      lastUserMessage: opts.userMessage,
    }).catch((err) => console.error('notifyEscalation failed:', err));
  }

  yield {
    type: 'done',
    result: {
      reply: finalReply,
      escalated,
      escalationSummary,
      toolCallCount: toolCalls,
      modelUsed: model,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
    },
  };
}

// ── Tool loop ──────────────────────────────────────────────────────────

async function runToolLoop(args: {
  client: Anthropic;
  model: string;
  messages: MessageParam[];
  ragBlock: string;
  ctx: SupportToolContext;
  db: Db;
}): Promise<Omit<AgentRunResult, 'modelUsed'>> {
  const { client, model, ctx, db } = args;
  const messages = [...args.messages];

  // System prompt assembled with RAG. Use cache_control on the LAST text block
  // so the prefix (system text + RAG) caches together. Tools render before
  // system, so a single breakpoint here covers tools too.
  const system: TextBlockParam[] = [
    { type: 'text', text: SUPPORT_SYSTEM_PROMPT },
  ];
  if (args.ragBlock) {
    system.push({
      type: 'text',
      text: args.ragBlock,
      cache_control: { type: 'ephemeral' },
    });
  } else {
    system[0] = { ...system[0], cache_control: { type: 'ephemeral' } };
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let toolCalls = 0;
  let escalated = false;
  let escalationSummary: string | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: SUPPORT_TOOLS,
      messages,
    });

    totalInput += response.usage.input_tokens ?? 0;
    totalOutput += response.usage.output_tokens ?? 0;
    totalCacheRead += response.usage.cache_read_input_tokens ?? 0;
    totalCacheWrite += response.usage.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === 'tool_use') {
      // Append assistant turn (with tool_use blocks) to history
      messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const toolResults: ContentBlockParam[] = [];
      for (const tu of toolUseBlocks) {
        toolCalls++;
        const startedAt = Date.now();

        // Intercept the escalate tool — record + return success without
        // making the model think it failed
        if (tu.name === 'escalate_to_human') {
          escalated = true;
          escalationSummary = String((tu.input as { summary?: string })?.summary ?? '');
          await recordAction(db, ctx.conversationId, tu, { escalated: true }, 'success', Date.now() - startedAt);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: 'Escalated. The runQ team has been notified and will reply within an hour.',
          });
          continue;
        }

        const { result, isError } = await executeSupportTool(
          tu.name,
          tu.input as Record<string, unknown>,
          ctx,
        );
        await recordAction(
          db,
          ctx.conversationId,
          tu,
          result,
          isError ? 'failed' : 'success',
          Date.now() - startedAt,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          is_error: isError || undefined,
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // end_turn or max_tokens — extract final text
    const reply = extractText(response.content) ||
      (escalated
        ? 'I\'ve flagged this for the runQ team — someone will reply within an hour.'
        : 'I wasn\'t able to put together an answer. Let me get someone from the team to help.');

    return {
      reply,
      escalated,
      escalationSummary,
      toolCallCount: toolCalls,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
    };
  }

  // Hit MAX_TOOL_ROUNDS — auto-escalate
  return {
    reply: 'This is taking longer than I can handle on my own. Let me hand it to the team — they\'ll reply within an hour.',
    escalated: true,
    escalationSummary: 'Agent exceeded max tool rounds without resolving the question.',
    toolCallCount: toolCalls,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheReadTokens: totalCacheRead,
    cacheWriteTokens: totalCacheWrite,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

async function loadConversationHistory(db: Db, conversationId: string): Promise<MessageParam[]> {
  const rows = await db
    .select({
      role: supportMessages.role,
      content: supportMessages.content,
      toolCalls: supportMessages.toolCalls,
    })
    .from(supportMessages)
    .where(eq(supportMessages.conversationId, conversationId))
    .orderBy(asc(supportMessages.createdAt));

  // Drop the most recently inserted user message — runSupportTurn appends it
  // separately to messages. Without this we'd duplicate it.
  if (rows.length > 0 && rows[rows.length - 1].role === 'user') {
    rows.pop();
  }

  return rows.map((r) => ({
    role: r.role === 'user' ? 'user' : 'assistant',
    content: r.content,
  }));
}

async function chooseModel(db: Db, conversationId: string): Promise<string> {
  const [row] = await db
    .select({ failed: sql<number>`COUNT(*)::int` })
    .from(supportAgentActions)
    .where(and(
      eq(supportAgentActions.conversationId, conversationId),
      eq(supportAgentActions.status, 'failed'),
    ));
  const failed = row?.failed ?? 0;
  return failed >= SONNET_ESCALATION_THRESHOLD ? SONNET : HAIKU;
}

async function recordAction(
  db: Db,
  conversationId: string,
  toolUse: { id: string; name: string; input: unknown },
  result: unknown,
  status: 'success' | 'failed' | 'user_rejected' | 'pending_confirmation',
  durationMs: number,
) {
  await db.insert(supportAgentActions).values({
    conversationId,
    toolName: toolUse.name,
    args: toolUse.input as Record<string, unknown>,
    result: result as Record<string, unknown>,
    status,
    durationMs: durationMs as never,
  });
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// Re-export so callers can build SupportToolCall payloads without importing
// schema types directly from this module.
export type { SupportToolCall };

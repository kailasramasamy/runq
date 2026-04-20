import type { Db } from '@runq/db';
import type { MessageParam, ContentBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { getStreamClient, isAIEnabled } from '../../utils/ai/claude.service';
import { AGENT_SYSTEM_PROMPT } from './system-prompt';
import { AGENT_TOOLS } from './tools';
import { executeTool } from './tool-executor';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 5;

export type AgentStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; toolName: string }
  | { type: 'tool_result'; toolName: string; summary: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export async function* chat(
  userMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  db: Db,
  tenantId: string,
): AsyncGenerator<AgentStreamEvent> {
  if (!isAIEnabled()) {
    yield { type: 'error', message: 'AI features are not enabled. Please configure an API key.' };
    return;
  }

  const client = getStreamClient();
  if (!client) {
    yield { type: 'error', message: 'AI client not available.' };
    return;
  }

  // Convert simple messages to Anthropic format
  const messages: MessageParam[] = userMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: AGENT_SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      messages,
      stream: true,
    });

    let currentToolUseBlocks: ToolUseBlock[] = [];
    let stopReason: string | null = null;
    // Accumulate full content blocks for appending to messages
    const contentBlocks: ContentBlockParam[] = [];
    let currentToolInput = '';
    let currentToolId = '';
    let currentToolName = '';
    let accumulatedText = '';

    for await (const event of response) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          accumulatedText = '';
        } else if (event.content_block.type === 'tool_use') {
          currentToolId = event.content_block.id;
          currentToolName = event.content_block.name;
          currentToolInput = '';
          yield { type: 'tool_use_start', toolName: currentToolName };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          accumulatedText += event.delta.text;
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        // If we accumulated text, save it as a text block
        if (accumulatedText) {
          contentBlocks.push({ type: 'text', text: accumulatedText });
          accumulatedText = '';
        }
        if (currentToolName && currentToolId) {
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = currentToolInput ? JSON.parse(currentToolInput) : {};
          } catch {
            // Empty or invalid input — use empty object
          }
          const block: ToolUseBlock = {
            type: 'tool_use',
            id: currentToolId,
            name: currentToolName,
            input: parsedInput,
          };
          currentToolUseBlocks.push(block);
          contentBlocks.push(block);
          currentToolId = '';
          currentToolName = '';
          currentToolInput = '';
        }
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason;
      }
    }

    // Collect text blocks from the full response for message history
    // We need to reconstruct the assistant message with both text and tool_use blocks
    // The text was already streamed, so we just need to track it for the message array
    if (stopReason === 'tool_use' && currentToolUseBlocks.length > 0) {
      // Append the assistant message with tool_use blocks
      messages.push({ role: 'assistant', content: contentBlocks });

      // Execute all tool calls and build tool results
      const toolResults: ContentBlockParam[] = [];
      for (const toolBlock of currentToolUseBlocks) {
        try {
          const result = await executeTool(toolBlock.name, toolBlock.input, db, tenantId);
          const summary = buildToolSummary(toolBlock.name, result);
          yield { type: 'tool_result', toolName: toolBlock.name, summary };
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: result,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Tool execution failed';
          yield { type: 'tool_result', toolName: toolBlock.name, summary: `Error: ${errMsg}` };
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: errMsg }),
            is_error: true,
          });
        }
      }

      // Append tool results as a user message
      messages.push({ role: 'user', content: toolResults });
      currentToolUseBlocks = [];

      // Continue the loop — Claude will process tool results and respond
      continue;
    }

    // No tool use or end_turn — we're done
    yield { type: 'done' };
    return;
  }

  // Hit max tool rounds
  yield { type: 'text_delta', text: '\n\nI reached the maximum number of data lookups for this question. Please try breaking your question into smaller parts.' };
  yield { type: 'done' };
}

function buildToolSummary(toolName: string, rawResult: string): string {
  try {
    const data = JSON.parse(rawResult);
    if (data.error) return `Error: ${data.error}`;

    switch (toolName) {
      case 'get_dashboard_summary':
        return 'Fetched financial overview';
      case 'get_receivables_aging':
        return 'Fetched receivables aging';
      case 'get_payables_aging':
        return 'Fetched payables aging';
      case 'get_bank_balances':
        return `Fetched ${data.accounts?.length ?? 0} bank accounts`;
      case 'search_invoices':
        return `Found ${data.total} invoices (showing ${data.showing})`;
      case 'search_bills':
        return `Found ${data.total} bills (showing ${data.showing})`;
      case 'search_customers':
        return `Found ${data.total} customers (showing ${data.showing})`;
      case 'search_vendors':
        return `Found ${data.total} vendors (showing ${data.showing})`;
      case 'get_recent_bank_transactions':
        return `Fetched ${data.showing} transactions`;
      case 'get_journal_entries':
        return `Found ${data.total} journal entries (showing ${data.showing})`;
      case 'get_account_balance':
        return `Fetched balance for ${data.accountName}`;
      case 'get_trial_balance':
        return `Fetched trial balance (${data.accountCount} accounts)`;
      default:
        return 'Data fetched';
    }
  } catch {
    return 'Data fetched';
  }
}

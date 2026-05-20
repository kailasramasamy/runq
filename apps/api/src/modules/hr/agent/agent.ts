/**
 * HR helpdesk agent runtime — Phase 1.
 *
 * One-shot per ticket: read the ticket subject + description, run a tool loop,
 * write the final reply as an hr_ticket_comments row with is_agent_draft=true.
 * No streaming, no conversation history — drafts are reviewed by HR before send.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  hrTickets,
  hrTicketComments,
  hrAgentActions,
  tenants,
  users,
  employees,
} from '@runq/db';
import type Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlockParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { getStreamClient, isAIEnabled } from '../../../utils/ai/claude.service';
import { HR_AGENT_SYSTEM_PROMPT } from './prompts';
import { publishHelpdeskEvent } from './realtime';
import { notifyHrEscalation } from './notifier';
import {
  HR_AGENT_TOOLS,
  executeHrAgentTool,
  type HrAgentToolContext,
} from './tools';

const HAIKU = 'claude-haiku-4-5';
const MAX_TOKENS = 1500;
const MAX_TOOL_ROUNDS = 5;

// Phrases that force a draft (never auto-send), even at tier 2/3. Matched as
// whole words/phrases to avoid false positives (e.g. "increment" in "leave
// accrual increment" is fine, but "salary increment" is not — so we list the
// phrase, not the standalone word).
const SENSITIVE_PATTERNS: RegExp[] = [
  /\bgrievance\b/, /\bharass\w*/, /\bposh\b/, /\bdiscriminat\w+/, /\bbully\w*/,
  /\bresign\w*/, /\bnotice period\b/, /\bquit\b/, /\bquitting\b/,
  /\bsalary (revision|hike|increment|increase)\b/, /\braise my salary\b/,
  /\b(get|asking for a) promotion\b/, /\bpromot(e|ion) (request|me)\b/,
  /\bterminat\w+/, /\bfir(ed|ing)\b/, /\blay[- ]?off\b/, /\bretrench\w*/,
  /\b(legal action|lawyer|court case|sue (you|hr|the))\b/,
  /\bescalate to (ceo|founder|md|director)\b/,
  /\b(mental health|depress\w+|suicid\w+)\b/,
  /\bunsafe (at work|workplace|environment)\b/,
];

// Money mentioned above this threshold (in ₹) forces a draft.
const MAX_AUTO_AMOUNT_INR = 10000;

export interface HrAgentRunResult {
  reply: string;
  escalated: boolean;
  escalationSummary?: string;
  toolCalls: { tool: string; ok: boolean }[];
  confidence: 'low' | 'medium' | 'high';
}

/**
 * Run the agent for one ticket and persist a draft comment. Safe to fire and
 * forget — all errors are caught and logged. Returns null if disabled.
 */
export async function runHrAgentForTicket(opts: {
  db: Db;
  tenantId: string;
  ticketId: string;
}): Promise<HrAgentRunResult | null> {
  if (!isAIEnabled()) return null;
  const client = getStreamClient();
  if (!client) return null;

  // Load ticket + employee + tenant settings
  const [ticket] = await opts.db
    .select()
    .from(hrTickets)
    .where(and(eq(hrTickets.id, opts.ticketId), eq(hrTickets.tenantId, opts.tenantId)))
    .limit(1);
  if (!ticket) return null;

  const [tenant] = await opts.db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, opts.tenantId))
    .limit(1);
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const agentSettings = (settings.agentSupport ?? {}) as {
    enabled?: boolean;
    faqs?: string;
    operatorUserId?: string | null;
    perCategory?: Record<string, { tier: number; autoResolve: boolean }>;
  };

  if (!agentSettings.enabled) return null;
  const tier = agentSettings.perCategory?.[ticket.category]?.tier ?? 0;
  if (tier < 1) return null;
  if (!agentSettings.operatorUserId) return null;

  // Verify the operator user still exists in the tenant
  const [op] = await opts.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, agentSettings.operatorUserId), eq(users.tenantId, opts.tenantId)))
    .limit(1);
  if (!op) return null;

  const ctx: HrAgentToolContext = {
    db: opts.db,
    tenantId: opts.tenantId,
    employeeId: ticket.employeeId,
    faqs: agentSettings.faqs ?? '',
  };

  // Tell connected clients the agent is working. `typing_stopped` is emitted
  // by the wrapper in runHrAgentInBackground so it always fires, even on
  // errors / early returns below.
  publishHelpdeskEvent({
    type: 'typing_started',
    ticketId: ticket.id,
    tenantId: opts.tenantId,
    actor: 'agent',
  });

  // Build the message thread:
  //   user: ticket subject + description (the original ask)
  //   assistant: prior agent / HR reply (if any)
  //   user: employee follow-up
  //   ... and so on. We always end on a `user` turn so the agent has something
  //   to respond to. If the latest comment is from HR/the agent, skip this run.
  // Pull each comment with the author's role so we can tag user/assistant turns
  // by role (not user id). Email duplicates in the users table would otherwise
  // confuse a "compare to asking user id" check.
  const priorComments = await opts.db
    .select({
      id: hrTicketComments.id,
      body: hrTicketComments.body,
      authorUserId: hrTicketComments.authorUserId,
      authorRole: users.role,
      isAgentDraft: hrTicketComments.isAgentDraft,
      agentConfidence: hrTicketComments.agentConfidence,
      createdAt: hrTicketComments.createdAt,
    })
    .from(hrTicketComments)
    .innerJoin(users, eq(users.id, hrTicketComments.authorUserId))
    .where(eq(hrTicketComments.ticketId, ticket.id))
    .orderBy(asc(hrTicketComments.createdAt));

  const HR_WRITE_ROLES = new Set(['owner', 'accountant', 'hr']);

  // Skip a run if the latest sent (non-draft) comment is NOT from the
  // employee — i.e., the agent or HR just spoke. Wait for the next employee
  // message instead.
  const latest = priorComments.filter((c) => !c.isAgentDraft).at(-1);
  if (latest && HR_WRITE_ROLES.has(latest.authorRole)) {
    return null;
  }

  // (Multilingual / TTS deferred — agent stays English-only for now.
  // Schema fields preferredLanguage + translation_text are in place for
  // when we resume the work.)

  const messages: MessageParam[] = [
    { role: 'user', content: buildTicketPrompt(ticket) },
  ];
  for (const c of priorComments) {
    // Drop any leftover drafts — they were never sent, so the employee didn't see them.
    if (c.isAgentDraft) continue;
    const fromEmployee = !HR_WRITE_ROLES.has(c.authorRole);
    messages.push({
      role: fromEmployee ? 'user' : 'assistant',
      content: c.body,
    });
  }
  // If the last message is from the assistant, the latest employee comment was
  // appended just before this run started — that's fine, we still want a reply.
  // If the last message is `user` (employee), the agent will respond to it.

  const system: TextBlockParam[] = [
    { type: 'text', text: HR_AGENT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
  ];
  if (ctx.faqs.trim()) {
    system.push({
      type: 'text',
      text: `\n# Company FAQ / Policy\n\n${ctx.faqs}`,
      cache_control: { type: 'ephemeral' },
    });
  }

  let escalated = false;
  let escalationSummary: string | undefined;
  let closedByAgent = false;
  let closeReason: string | undefined;
  let finalText = '';
  const toolCalls: { tool: string; ok: boolean }[] = [];

  outer: for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: HAIKU,
      max_tokens: MAX_TOKENS,
      system,
      tools: HR_AGENT_TOOLS,
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const toolResults: ContentBlockParam[] = [];

      for (const tu of toolUseBlocks) {
        if (tu.name === 'escalate_to_human') {
          escalated = true;
          escalationSummary = String((tu.input as { summary?: string })?.summary ?? '');
          toolCalls.push({ tool: tu.name, ok: true });
          await logAgentAction(opts.db, ticket.id, tu, { escalated: true, summary: escalationSummary }, 'success', 0);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: 'Escalated. HR will review this ticket directly — do not produce a reply.',
          });
          continue;
        }
        if (tu.name === 'close_ticket') {
          closedByAgent = true;
          closeReason = String((tu.input as { reason?: string })?.reason ?? '');
          toolCalls.push({ tool: tu.name, ok: true });
          await logAgentAction(opts.db, ticket.id, tu, { closed: true, reason: closeReason }, 'success', 0);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content:
              'Ticket closed successfully. Your final reply MUST explicitly confirm the ticket has been closed so the employee knows it is resolved. Example: "Done — I\'ve marked this ticket as closed. Reach out anytime if anything else comes up." Keep it warm and brief.',
          });
          continue;
        }
        const t0 = Date.now();
        const { result, isError } = await executeHrAgentTool(
          tu.name,
          tu.input as Record<string, unknown>,
          ctx,
        );
        const durationMs = Date.now() - t0;
        toolCalls.push({ tool: tu.name, ok: !isError });
        await logAgentAction(opts.db, ticket.id, tu, result, isError ? 'failed' : 'success', durationMs);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
          is_error: isError || undefined,
        });
      }

      messages.push({ role: 'user', content: toolResults });

      // If the model called escalate, stop — let the next turn produce a final text
      // (which we then discard in favour of the escalation summary).
      if (escalated) break outer;
      continue;
    }

    finalText = stripMetaHeaders(extractText(response.content));
    break outer;
  }

  // Outcome
  if (escalated) {
    // 1. Mark the ticket as escalated: high priority, waiting_human status,
    //    assigned to the operator, escalation timestamp set.
    await opts.db
      .update(hrTickets)
      .set({
        priority: 'high',
        status: 'waiting_human',
        assignedTo: agentSettings.operatorUserId,
        agentEscalatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hrTickets.id, ticket.id));
    publishHelpdeskEvent({ type: 'status_changed', ticketId: ticket.id, tenantId: opts.tenantId, status: 'waiting_human' });

    // 2. Internal note for HR with the agent's reasoning (draft, HR-only).
    await opts.db.insert(hrTicketComments).values({
      ticketId: ticket.id,
      authorUserId: agentSettings.operatorUserId,
      body: `(agent escalated this ticket)\n\n${escalationSummary ?? ''}`,
      isAgentDraft: true,
      agentConfidence: 'low',
      agentCitations: toolCalls.map((c) => ({ tool: c.tool, label: c.ok ? 'ok' : 'failed' })),
      agentMetadata: { escalated: true, escalationSummary },
    });
    publishHelpdeskEvent({ type: 'comment_added', ticketId: ticket.id, tenantId: opts.tenantId, isAgentDraft: true, hasAiBadge: false });

    // 3. Public holding message so the employee knows HR is taking over.
    const [holdRow] = await opts.db.insert(hrTicketComments).values({
      ticketId: ticket.id,
      authorUserId: agentSettings.operatorUserId,
      body: "I've flagged this for HR — they'll personally follow up here shortly.",
      isAgentDraft: false,
      agentConfidence: 'high',
      agentMetadata: { type: 'escalation_holding_message' },
    }).returning({ id: hrTicketComments.id });
    publishHelpdeskEvent({ type: 'comment_added', ticketId: ticket.id, tenantId: opts.tenantId, isAgentDraft: false, hasAiBadge: true });
    void holdRow;

    // 4. Email the operator. Fire-and-forget; failure here shouldn't break
    //    the user-facing flow.
    notifyHrEscalation({
      db: opts.db,
      ticketId: ticket.id,
      tenantId: opts.tenantId,
      operatorUserId: agentSettings.operatorUserId,
      agentSummary: escalationSummary,
      ticketSubject: ticket.subject,
      ticketNumber: ticket.ticketNumber,
      category: ticket.category,
      employeeId: ticket.employeeId,
    }).catch((err) => console.error('[hr-agent] notifier failed:', err));

    return { reply: '', escalated: true, escalationSummary, toolCalls, confidence: 'low' };
  }

  if (!finalText) {
    // Hit max rounds or empty response — escalate
    await opts.db.insert(hrTicketComments).values({
      ticketId: ticket.id,
      authorUserId: agentSettings.operatorUserId,
      body: '(agent could not draft a reply — please respond directly)',
      isAgentDraft: true,
      agentConfidence: 'low',
      agentCitations: toolCalls.map((c) => ({ tool: c.tool, label: c.ok ? 'ok' : 'failed' })),
      agentMetadata: { reason: 'max_rounds_or_empty' },
    });
    publishHelpdeskEvent({ type: 'comment_added', ticketId: ticket.id, tenantId: opts.tenantId, isAgentDraft: true, hasAiBadge: false });
    return { reply: '', escalated: true, toolCalls, confidence: 'low' };
  }

  const confidence: 'low' | 'medium' | 'high' = scoreConfidence(toolCalls);

  // ── Decide draft vs auto-send ─────────────────────────────────────────
  // Tier semantics:
  //   1 = always draft for HR
  //   2 / 3 = auto-send if confidence=high and no guardrails tripped; ticket
  //           → in_progress. Closure is NEVER automatic on a reply — it only
  //           happens when the agent explicitly calls close_ticket after the
  //           employee confirms.
  // Anything that trips guardrails falls back to draft.
  // Guardrails are split:
  //   - Sensitive keywords scan: ticket + agent reply (catches the model
  //     surfacing resign/legal/etc. unprompted).
  //   - INR amount scan: ticket only (NOT the agent's reply — the agent
  //     restates known facts like CTC / payslip totals as part of a normal
  //     answer, which shouldn't count as a "money request").
  const guardrail = detectGuardrails(
    `${ticket.subject}\n${ticket.description ?? ''}`,
    `${ticket.subject}\n${ticket.description ?? ''}\n${finalText}`,
  );
  const shouldAutoSend =
    tier >= 2 && confidence === 'high' && !guardrail.tripped;
  // close_ticket tool is the ONLY path to a resolved/closed ticket. Auto-
  // resolving on every agent reply (old tier-3 behaviour) made tickets close
  // before the conversation was finished.
  const shouldAutoResolve = false;

  const [replyRow] = await opts.db.insert(hrTicketComments).values({
    ticketId: ticket.id,
    authorUserId: agentSettings.operatorUserId,
    body: finalText,
    isAgentDraft: !shouldAutoSend,
    agentConfidence: confidence,
    agentCitations: toolCalls.map((c) => ({ tool: c.tool, label: c.ok ? 'ok' : 'failed' })),
    agentMetadata: {
      model: HAIKU,
      toolRounds: toolCalls.length,
      tier,
      autoSent: shouldAutoSend,
      autoResolved: shouldAutoResolve,
      guardrail: guardrail.tripped ? guardrail.reason : null,
    },
  }).returning({ id: hrTicketComments.id });

  publishHelpdeskEvent({
    type: 'comment_added',
    ticketId: ticket.id,
    tenantId: opts.tenantId,
    isAgentDraft: !shouldAutoSend,
    hasAiBadge: shouldAutoSend,
  });

  // Only translate when the comment actually reaches the employee (auto-sent).
  void replyRow;

  // If the reply is drafted (not auto-sent), post a short employee-visible
  // holding message so the employee knows the system isn't ignoring them.
  // The real reply lands when HR sends the draft.
  if (!shouldAutoSend) {
    const issuedLetter = toolCalls.some((c) => c.tool === 'issue_letter' && c.ok);
    const holdingBody = issuedLetter
      ? "Got it — I've started this for you. HR is reviewing and will reply here shortly. If it's a letter, you'll also find it under **HR → Letters** when ready."
      : "Got it — I've passed this to HR. They'll get back to you here shortly.";
    const [hold2] = await opts.db.insert(hrTicketComments).values({
      ticketId: ticket.id,
      authorUserId: agentSettings.operatorUserId,
      body: holdingBody,
      isAgentDraft: false,
      agentConfidence: 'high',
      agentMetadata: { type: 'holding_message', reason: guardrail.tripped ? guardrail.reason : 'tier_below_auto_send' },
    }).returning({ id: hrTicketComments.id });
    publishHelpdeskEvent({
      type: 'comment_added',
      ticketId: ticket.id,
      tenantId: opts.tenantId,
      isAgentDraft: false,
      hasAiBadge: true,
    });
    void hold2;
    // Move ticket out of 'open' so the employee sees progress.
    if (ticket.status === 'open') {
      await opts.db
        .update(hrTickets)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(hrTickets.id, ticket.id));
      publishHelpdeskEvent({ type: 'status_changed', ticketId: ticket.id, tenantId: opts.tenantId, status: 'in_progress' });
    }
  }

  // Advance ticket lifecycle.
  // close_ticket wins over auto-resolve — the employee explicitly confirmed
  // the question was answered, so we mark it closed.
  if (closedByAgent && shouldAutoSend) {
    await opts.db
      .update(hrTickets)
      .set({
        status: 'closed',
        resolvedAt: new Date(),
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(hrTickets.id, ticket.id));
    publishHelpdeskEvent({ type: 'status_changed', ticketId: ticket.id, tenantId: opts.tenantId, status: 'closed' });
  } else if (shouldAutoSend) {
    const newStatus = shouldAutoResolve ? 'resolved' : 'in_progress';
    await opts.db
      .update(hrTickets)
      .set({
        status: newStatus,
        resolvedAt: shouldAutoResolve ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(hrTickets.id, ticket.id));
    publishHelpdeskEvent({ type: 'status_changed', ticketId: ticket.id, tenantId: opts.tenantId, status: newStatus });
  }

  // Stash close metadata in the comment if the agent closed the ticket.
  if (closedByAgent) {
    // (Already persisted above; here just emit telemetry-friendly log.)
    console.log(`[hr-agent] closed ticket ${ticket.id} — ${closeReason ?? 'no reason'}`);
  }

  return { reply: finalText, escalated: false, toolCalls, confidence };
}

/**
 * Scan combined ticket+reply text for content that should force HR review.
 * False positives are fine — they only cause an unnecessary draft, not harm.
 */
function detectGuardrails(
  amountScanText: string,
  keywordScanText: string,
): { tripped: boolean; reason: string | null } {
  const keywordLower = keywordScanText.toLowerCase();
  for (const pattern of SENSITIVE_PATTERNS) {
    const m = keywordLower.match(pattern);
    if (m) return { tripped: true, reason: `sensitive_pattern:${m[0]}` };
  }
  // Detect INR amounts only on the employee-provided text — agent replies
  // legitimately quote CTC / payslip totals which shouldn't trip the rail.
  const amountLower = amountScanText.toLowerCase();
  const amountMatches = amountLower.match(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)\s?(lakh|lac|crore|cr|k)?/g) ?? [];
  for (const m of amountMatches) {
    const amount = parseAmount(m);
    if (amount !== null && amount > MAX_AUTO_AMOUNT_INR) {
      return { tripped: true, reason: `amount_over_threshold:${amount}` };
    }
  }
  return { tripped: false, reason: null };
}

/**
 * Strip meta-commentary that the model sometimes prepends/appends despite the
 * system prompt. Conservative — only removes lines that match known boilerplate.
 */
function stripMetaHeaders(text: string): string {
  let t = text.trim();
  // Drop leading lines like "**Draft reply:**", "Draft reply:", "Reply:", "Here's…"
  const leadPatterns = [
    /^\s*\*{0,2}draft reply\*{0,2}:?\s*$/im,
    /^\s*\*{0,2}reply\*{0,2}:?\s*$/im,
    /^\s*here'?s (what i found|the answer|my reply)[:.]?\s*$/im,
    /^\s*let me (check|look (this )?up)[.…]?\s*$/im,
  ];
  for (const p of leadPatterns) {
    t = t.replace(p, '').trim();
  }
  // Drop a trailing "Notes for HR operator" block (and everything after).
  const notesIdx = t.search(/\n[-=*_]{3,}\s*\n\s*\*{0,2}notes? for hr( operator)?\*{0,2}:/i);
  if (notesIdx >= 0) t = t.slice(0, notesIdx).trim();
  const trailingNotes = t.search(/\n\s*\*{0,2}notes? for hr( operator)?\*{0,2}:/i);
  if (trailingNotes >= 0) t = t.slice(0, trailingNotes).trim();
  // Strip a leading horizontal rule if left dangling.
  t = t.replace(/^[-=*_]{3,}\s*\n/, '').trim();
  return t;
}

function parseAmount(match: string): number | null {
  const cleaned = match.toLowerCase().replace(/[₹,]|rs\.?|inr/g, '').trim();
  const m = cleaned.match(/([\d.]+)\s?(lakh|lac|crore|cr|k)?/);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;
  const unit = m[2];
  if (unit === 'lakh' || unit === 'lac') return base * 100_000;
  if (unit === 'crore' || unit === 'cr') return base * 10_000_000;
  if (unit === 'k') return base * 1_000;
  return base;
}

function buildTicketPrompt(ticket: {
  ticketNumber: string;
  category: string;
  priority: string;
  subject: string;
  description: string | null;
}): string {
  // Today's date — critical for resolving relative dates ("Friday", "next week",
  // "yesterday"). Per-request so it doesn't break the system-prompt cache.
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const todayLong = now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  return `A new HR helpdesk ticket was just raised by an employee.

**Today is ${todayLong} (${todayIso}).** Resolve any relative dates ("Friday", "next week", "yesterday") against this date.

- Ticket: ${ticket.ticketNumber}
- Category: ${ticket.category}
- Priority: ${ticket.priority}
- Subject: ${ticket.subject}
${ticket.description ? `- Description: ${ticket.description}` : ''}

Draft a helpful reply for the HR operator to review. Use the tools to look up the asking employee's actual data — never guess.`;
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function scoreConfidence(
  toolCalls: { tool: string; ok: boolean }[],
): 'low' | 'medium' | 'high' {
  // Any failed tool means the agent tried to ground but couldn't — let HR review.
  const failed = toolCalls.filter((c) => !c.ok).length;
  if (failed > 0) return 'low';
  // Everything else — whether the agent fetched fresh data, used the FAQ, or
  // simply replied conversationally to a follow-up ("Sure", "You're welcome") —
  // is treated as high. The agent's own escalate_to_human tool + the guardrail
  // keyword check are the safety net against bad auto-sends.
  return 'high';
}

// Silently swallow errors so a failing agent never breaks ticket creation.
// Always emit typing_stopped on settle so the UI indicator clears even when
// the agent throws partway through.
export function runHrAgentInBackground(opts: {
  db: Db;
  tenantId: string;
  ticketId: string;
}) {
  runHrAgentForTicket(opts)
    .catch((err) => { console.error('[hr-agent] background run failed:', err); })
    .finally(() => {
      publishHelpdeskEvent({
        type: 'typing_stopped',
        ticketId: opts.ticketId,
        tenantId: opts.tenantId,
        actor: 'agent',
      });
    });
}

/**
 * Insert an audit row for every tool call. Critical for write actions
 * (submit_leave_request, submit_regularization, issue_letter, close_ticket).
 * Errors swallowed so audit failure never breaks the agent loop.
 */
async function logAgentAction(
  db: Db,
  ticketId: string,
  toolUse: { id: string; name: string; input: unknown },
  result: unknown,
  status: 'success' | 'failed' | 'user_rejected' | 'pending_confirmation',
  durationMs: number,
): Promise<void> {
  try {
    await db.insert(hrAgentActions).values({
      ticketId,
      toolName: toolUse.name,
      args: (toolUse.input as Record<string, unknown>) ?? {},
      result: (result as Record<string, unknown>) ?? null,
      status,
      durationMs,
    });
  } catch (err) {
    console.error('[hr-agent] audit log insert failed:', err);
  }
}

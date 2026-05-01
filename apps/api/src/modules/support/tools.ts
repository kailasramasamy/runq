/**
 * Read-only support agent tools. Phase 2 — no write actions yet.
 *
 * Each tool implementation receives the conversation context (db, tenantId,
 * userId) so the agent can never read across tenant boundaries. The tool
 * schemas are stable across all conversations to keep the prompt cache warm.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  salesInvoices,
  purchaseInvoices,
  gstReturns,
  paymentRuns,
  tenants,
  users,
  customers,
} from '@runq/db';
import type Anthropic from '@anthropic-ai/sdk';
import { searchDocs } from './rag';

export interface SupportToolContext {
  db: Db;
  tenantId: string;
  userId: string;
  conversationId: string;
}

/** Tool definitions sent to Claude — frozen for cache stability. */
export const SUPPORT_TOOLS: Anthropic.ToolUnion[] = [
  {
    name: 'get_user_context',
    description:
      'Get the asking user\'s account info: tenant name, plan, role, GSTIN status, and a quick activity summary (counts of invoices, bills, and recent errors). Call this first when answering anything user-specific.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_docs',
    description:
      'Search runQ\'s documentation for relevant pages. Use this for any "how do I..." question or to confirm a feature exists before answering.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query — keywords work better than full questions.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_recent_invoices',
    description:
      'List the user\'s most recent sales invoices (newest first). Use to answer "did invoice X get sent?" or "what\'s outstanding?".',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
          description: 'Optional filter by status.',
        },
        limit: { type: 'number', description: 'Max results (default 10, max 50).' },
      },
    },
  },
  {
    name: 'get_gst_status',
    description:
      'Get the user\'s current GST filing status: readiness score, draft state of GSTR-1 and GSTR-3B for the current period, and most recent ARN. Use for any GST filing question.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Optional MMYYYY period (e.g. "042026"). Defaults to most recent filing period.',
        },
      },
    },
  },
  {
    name: 'get_pay_run_status',
    description:
      'Look up status of a specific pay run, or list recent pay runs if no id is given. Use for "why is my payment stuck" type questions.',
    input_schema: {
      type: 'object',
      properties: {
        pay_run_id: { type: 'string', description: 'Optional pay run UUID. If omitted, returns the 5 most recent runs.' },
      },
    },
  },
  {
    name: 'lookup_recent_errors',
    description:
      'Surface the user\'s recent application errors (failed invoice sends, GSP rejections, bank reconciliation failures) from the last 7 days. Use when troubleshooting "X is broken" reports.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Hand the conversation over to a human (the runQ team). Use when: you cannot answer confidently, the issue requires action you cannot take (refund, bug fix, urgent intervention), or the user expresses frustration. Provide a one-paragraph summary of what you understood and what was tried.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'One paragraph summarizing the user\'s issue, what you checked, and what you couldn\'t resolve.',
        },
      },
      required: ['summary'],
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────

export async function executeSupportTool(
  name: string,
  input: Record<string, unknown>,
  ctx: SupportToolContext,
): Promise<{ result: unknown; isError: boolean }> {
  try {
    switch (name) {
      case 'get_user_context':
        return { result: await getUserContext(ctx), isError: false };
      case 'search_docs':
        return { result: await runSearchDocs(input.query as string), isError: false };
      case 'list_recent_invoices':
        return {
          result: await listRecentInvoices(ctx, input.status as string | undefined, input.limit as number | undefined),
          isError: false,
        };
      case 'get_gst_status':
        return { result: await getGstStatus(ctx, input.period as string | undefined), isError: false };
      case 'get_pay_run_status':
        return { result: await getPayRunStatus(ctx, input.pay_run_id as string | undefined), isError: false };
      case 'lookup_recent_errors':
        return { result: await lookupRecentErrors(ctx), isError: false };
      case 'escalate_to_human':
        // The agent loop intercepts this tool — see agent.ts. Returning a sentinel
        // is just defense in depth in case it slips through.
        return { result: { escalated: true, summary: input.summary }, isError: false };
      default:
        return { result: { error: `Unknown tool: ${name}` }, isError: true };
    }
  } catch (err) {
    return {
      result: { error: err instanceof Error ? err.message : 'Tool failed' },
      isError: true,
    };
  }
}

// ── Tool implementations ───────────────────────────────────────────────

async function getUserContext(ctx: SupportToolContext) {
  const [user] = await ctx.db
    .select({
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);

  const [tenant] = await ctx.db
    .select({
      name: tenants.name,
      slug: tenants.slug,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  const [counts] = await ctx.db
    .select({
      invoiceCount: sql<number>`(SELECT COUNT(*)::int FROM sales_invoices WHERE tenant_id = ${ctx.tenantId})`,
      billCount: sql<number>`(SELECT COUNT(*)::int FROM purchase_invoices WHERE tenant_id = ${ctx.tenantId})`,
      customerCount: sql<number>`(SELECT COUNT(*)::int FROM customers WHERE tenant_id = ${ctx.tenantId} AND is_active = true)`,
    })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId));

  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;

  return {
    user: { name: user?.name, email: user?.email, role: user?.role },
    tenant: {
      name: tenant?.name,
      slug: tenant?.slug,
      gstinConfigured: !!settings.gstin,
      gstFilingStartPeriod: settings.gstFilingStartPeriod,
      state: settings.state,
    },
    activity: {
      invoiceCount: counts?.invoiceCount ?? 0,
      billCount: counts?.billCount ?? 0,
      activeCustomers: counts?.customerCount ?? 0,
    },
  };
}

async function runSearchDocs(query: string) {
  const snippets = searchDocs(query, 4);
  return snippets.map((s) => ({
    path: s.path,
    title: s.title,
    excerpt: s.excerpt,
  }));
}

async function listRecentInvoices(
  ctx: SupportToolContext,
  status: string | undefined,
  limit: number | undefined,
) {
  const cap = Math.min(limit ?? 10, 50);
  const conditions = [eq(salesInvoices.tenantId, ctx.tenantId)];
  if (status) conditions.push(eq(salesInvoices.status, status as never));

  const rows = await ctx.db
    .select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoiceNumber,
      invoiceDate: salesInvoices.invoiceDate,
      totalAmount: salesInvoices.totalAmount,
      status: salesInvoices.status,
      customerId: salesInvoices.customerId,
      customerName: customers.name,
    })
    .from(salesInvoices)
    .leftJoin(customers, eq(customers.id, salesInvoices.customerId))
    .where(and(...conditions))
    .orderBy(desc(salesInvoices.invoiceDate))
    .limit(cap);

  return {
    count: rows.length,
    invoices: rows.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      date: r.invoiceDate,
      customer: r.customerName ?? '(unknown)',
      amount: r.totalAmount,
      status: r.status,
    })),
  };
}

async function getGstStatus(ctx: SupportToolContext, period: string | undefined) {
  const conditions = [eq(gstReturns.tenantId, ctx.tenantId)];
  if (period) conditions.push(eq(gstReturns.period, period));

  const rows = await ctx.db
    .select({
      period: gstReturns.period,
      returnType: gstReturns.returnType,
      status: gstReturns.status,
      arn: gstReturns.arn,
      filedAt: gstReturns.filedAt,
    })
    .from(gstReturns)
    .where(and(...conditions))
    .orderBy(desc(gstReturns.period))
    .limit(period ? 2 : 6);

  return {
    returns: rows.map((r) => ({
      period: r.period,
      type: r.returnType.toUpperCase(),
      status: r.status,
      arn: r.arn,
      filedAt: r.filedAt,
    })),
  };
}

async function getPayRunStatus(ctx: SupportToolContext, payRunId: string | undefined) {
  const conditions = [eq(paymentRuns.tenantId, ctx.tenantId)];
  if (payRunId) conditions.push(eq(paymentRuns.id, payRunId));

  const rows = await ctx.db
    .select({
      id: paymentRuns.id,
      runId: paymentRuns.runId,
      status: paymentRuns.status,
      totalAmount: paymentRuns.totalAmount,
      totalCount: paymentRuns.totalCount,
      approvedCount: paymentRuns.approvedCount,
      createdAt: paymentRuns.createdAt,
    })
    .from(paymentRuns)
    .where(and(...conditions))
    .orderBy(desc(paymentRuns.createdAt))
    .limit(payRunId ? 1 : 5);

  return { payRuns: rows };
}

async function lookupRecentErrors(ctx: SupportToolContext) {
  // Phase 2 stub — wire up to your error log table when one exists.
  // For now, surface signals that already live in app data:
  // - Bills in error status
  // - GST returns in error status
  // - Failed invoice sends (if you track that)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const billErrors = await ctx.db
    .select({
      invoiceNumber: purchaseInvoices.invoiceNumber,
      status: purchaseInvoices.status,
      invoiceDate: purchaseInvoices.invoiceDate,
    })
    .from(purchaseInvoices)
    .where(and(
      eq(purchaseInvoices.tenantId, ctx.tenantId),
      gte(purchaseInvoices.createdAt, sevenDaysAgo),
    ))
    .limit(10);

  const gstErrors = await ctx.db
    .select({
      period: gstReturns.period,
      returnType: gstReturns.returnType,
      errorDetails: gstReturns.errorDetails,
    })
    .from(gstReturns)
    .where(and(
      eq(gstReturns.tenantId, ctx.tenantId),
      eq(gstReturns.status, 'error'),
    ))
    .limit(5);

  return {
    gstErrors: gstErrors.map((g) => ({
      period: g.period,
      returnType: g.returnType,
      details: g.errorDetails,
    })),
    recentBillsForReview: billErrors.length,
  };
}

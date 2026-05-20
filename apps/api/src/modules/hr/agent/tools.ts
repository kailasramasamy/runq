/**
 * Read-only HR helpdesk agent tools (Phase 1).
 *
 * All reads are scoped by (tenantId, employeeId). No tool exposes data for any
 * other employee in the tenant. Schemas are frozen for prompt-cache stability.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  employees,
  departments,
  designations,
  leaveBalances,
  leaveTypes,
  leaveRequests,
  attendance,
  attendanceRegularizations,
  expenseClaims,
  holidays,
  payslips,
  payrollRuns,
  letterTemplates,
  employeeLetters,
} from '@runq/db';
import type Anthropic from '@anthropic-ai/sdk';
import { renderTemplate, buildLetterheadTokens } from '../phase-next/letter-render';

export interface HrAgentToolContext {
  db: Db;
  tenantId: string;
  employeeId: string;
  // Per-tenant FAQ blob, used by search_policy. Stored on tenants.settings.agentSupport.faqs.
  faqs: string;
}

export const HR_AGENT_TOOLS: Anthropic.ToolUnion[] = [
  {
    name: 'get_employee_self',
    description:
      "Get the asking employee's profile: name, code, department, designation, manager, joining date, employment type, status. Call this first for any personal query.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_leave_balance',
    description:
      "List the asking employee's leave balances for the current calendar year, by leave type. Returns opening + accrued − used per type.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_leave_requests',
    description:
      "List the asking employee's recent leave requests (newest first), with status, dates, and approver. Use for 'is my leave approved?' type questions.",
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'cancelled'],
          description: 'Optional filter by status.',
        },
        limit: { type: 'number', description: 'Max results (default 10, max 30).' },
      },
    },
  },
  {
    name: 'get_payslip',
    description:
      "Get the asking employee's payslip for a specific month/year, or the most recent one if none specified. Returns gross, deductions, net pay, PF/ESI/TDS breakdown.",
    input_schema: {
      type: 'object',
      properties: {
        month: { type: 'number', description: '1-12, optional' },
        year: { type: 'number', description: 'e.g. 2026, optional' },
      },
    },
  },
  {
    name: 'get_attendance_summary',
    description:
      "Summarise the asking employee's attendance for the current month (or specified month): present days, absent days, half days, leave days, holidays, total hours worked, OT hours.",
    input_schema: {
      type: 'object',
      properties: {
        month: { type: 'number', description: '1-12, optional (default: current)' },
        year: { type: 'number', description: 'optional (default: current)' },
      },
    },
  },
  {
    name: 'list_expense_claims',
    description:
      "List the asking employee's recent expense claims (newest first) with status and amount. Use for 'where is my reimbursement?' questions.",
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'submitted', 'approved', 'rejected', 'reimbursed'],
        },
        limit: { type: 'number', description: 'Max results (default 10, max 30).' },
      },
    },
  },
  {
    name: 'get_holidays',
    description:
      "List company holidays for the current calendar year (national + company + state). Use for 'when is the next holiday?' questions.",
    input_schema: {
      type: 'object',
      properties: {
        upcomingOnly: { type: 'boolean', description: 'If true, only future holidays. Default true.' },
      },
    },
  },
  {
    name: 'search_policy',
    description:
      "Search the company's HR FAQ / policy text for a keyword. Use this for any 'what's the policy on...' question. Returns matching paragraphs.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword or phrase — works best with 1-3 words.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'submit_leave_request',
    description:
      "Submit a leave request on the employee's behalf. ALWAYS confirm the exact parameters with the employee in plain language first (\"I'll apply 2 days CL on 27–28 May for a wedding — confirm?\") and only call this tool after they say yes. The tool validates balance, checks overlapping leaves, and creates the request in 'pending' status — their manager will see it for approval.",
    input_schema: {
      type: 'object',
      properties: {
        leave_type_code: {
          type: 'string',
          description: 'Leave type short code (e.g. CL, SL, EL, LOP). Get the list of valid codes via get_leave_balance first.',
        },
        from_date: { type: 'string', description: 'Start date in YYYY-MM-DD.' },
        to_date: { type: 'string', description: 'End date in YYYY-MM-DD (same as from_date for single-day or half-day).' },
        half_day: { type: 'boolean', description: 'true for half-day on a single date.' },
        reason: { type: 'string', description: 'Short reason the employee gave (e.g. "wedding", "fever", "doctor visit").' },
      },
      required: ['leave_type_code', 'from_date', 'to_date', 'reason'],
    },
  },
  {
    name: 'submit_regularization',
    description:
      "Submit an attendance regularization request when the employee forgot to clock in / clock out / mark attendance on a past date. ALWAYS confirm exact parameters first ('I'll request regularization for 26 May, marking you present with check-in 09:30 — confirm?') and only call after they say yes. Creates request in 'pending' status — manager / HR will approve.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date to regularize, YYYY-MM-DD. Must be in the past, not today.' },
        requested_check_in: { type: 'string', description: 'Corrected check-in time HH:MM (24h). Optional if only requesting status change.' },
        requested_check_out: { type: 'string', description: 'Corrected check-out time HH:MM (24h). Optional.' },
        requested_status: {
          type: 'string',
          enum: ['present', 'half_day', 'absent'],
          description: 'Optional override of attendance status. Default is present if check-in provided.',
        },
        reason: { type: 'string', description: 'Why they missed marking attendance (e.g. "forgot to clock out", "biometric down").' },
      },
      required: ['date', 'reason'],
    },
  },
  {
    name: 'issue_letter',
    description:
      "Issue or request an HR letter for the asking employee. The tool handles two paths automatically:\n" +
      "• INSTANT (issued in seconds): salary_certificate, address_proof, experience (post-relieving only).\n" +
      "• HR-FULFILLED (queued for HR to issue manually): offer, appointment, confirmation, increment, relieving, other.\n" +
      "Always confirm intent with the employee first ('Want me to generate / request your <kind>?'), then call this tool. The tool result tells you whether it was issued instantly or queued for HR.",
    input_schema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['salary_certificate', 'address_proof', 'experience', 'offer', 'appointment', 'confirmation', 'increment', 'relieving', 'other'],
          description: 'The kind of letter to issue or request.',
        },
        reason: {
          type: 'string',
          description: 'Optional context (e.g., "for home loan", "lost original", "for visa").',
        },
      },
      required: ['kind'],
    },
  },
  {
    name: 'close_ticket',
    description:
      "Close the ticket after the employee has confirmed their question is fully answered. ONLY call this AFTER a two-step confirmation in the chat: first asked 'Did this answer your question?' and got yes, then asked 'Can I close this ticket?' and got yes again. Never close without explicit confirmation. After calling this, write a brief sign-off message.",
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'One-line summary of how the ticket was resolved (e.g., "Answered CL balance question").',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Hand the ticket to the HR operator without drafting a reply. Use for sensitive categories (grievance, harassment, exit, salary revision), low confidence after 2 tool calls, or unsupported actions.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'One paragraph: what the employee asked, what you checked, why you escalated.',
        },
      },
      required: ['summary'],
    },
  },
];

export async function executeHrAgentTool(
  name: string,
  input: Record<string, unknown>,
  ctx: HrAgentToolContext,
): Promise<{ result: unknown; isError: boolean }> {
  try {
    switch (name) {
      case 'get_employee_self':
        return { result: await getEmployeeSelf(ctx), isError: false };
      case 'get_leave_balance':
        return { result: await getLeaveBalance(ctx), isError: false };
      case 'list_leave_requests':
        return {
          result: await listLeaveRequests(ctx, input.status as string | undefined, input.limit as number | undefined),
          isError: false,
        };
      case 'get_payslip':
        return {
          result: await getPayslip(ctx, input.month as number | undefined, input.year as number | undefined),
          isError: false,
        };
      case 'get_attendance_summary':
        return {
          result: await getAttendanceSummary(ctx, input.month as number | undefined, input.year as number | undefined),
          isError: false,
        };
      case 'list_expense_claims':
        return {
          result: await listExpenseClaims(ctx, input.status as string | undefined, input.limit as number | undefined),
          isError: false,
        };
      case 'get_holidays':
        return {
          result: await getHolidays(ctx, input.upcomingOnly as boolean | undefined),
          isError: false,
        };
      case 'search_policy':
        return { result: searchPolicy(ctx.faqs, input.query as string), isError: false };
      case 'submit_leave_request':
        return {
          result: await submitLeaveRequest(ctx, {
            leaveTypeCode: input.leave_type_code as string,
            fromDate: input.from_date as string,
            toDate: input.to_date as string,
            halfDay: (input.half_day as boolean | undefined) ?? false,
            reason: input.reason as string,
          }),
          isError: false,
        };
      case 'submit_regularization':
        return {
          result: await submitRegularization(ctx, {
            date: input.date as string,
            requestedCheckIn: input.requested_check_in as string | undefined,
            requestedCheckOut: input.requested_check_out as string | undefined,
            requestedStatus: input.requested_status as 'present' | 'half_day' | 'absent' | undefined,
            reason: input.reason as string,
          }),
          isError: false,
        };
      case 'issue_letter':
        return { result: await issueLetter(ctx, input.kind as string, input.reason as string | undefined), isError: false };
      case 'close_ticket':
        // The agent loop in agent.ts intercepts this — the sentinel is defense in depth.
        return { result: { closed: true, reason: input.reason }, isError: false };
      case 'escalate_to_human':
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

async function getEmployeeSelf(ctx: HrAgentToolContext) {
  const [row] = await ctx.db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      joiningDate: employees.joiningDate,
      confirmationDate: employees.confirmationDate,
      status: employees.status,
      employmentType: employees.employmentType,
      gender: employees.gender,
      departmentName: departments.name,
      designationName: designations.name,
      reportingToId: employees.reportingToId,
    })
    .from(employees)
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .where(and(eq(employees.tenantId, ctx.tenantId), eq(employees.id, ctx.employeeId)))
    .limit(1);
  if (!row) return { error: 'Employee record not found' };

  let managerName: string | null = null;
  if (row.reportingToId) {
    const [mgr] = await ctx.db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(eq(employees.id, row.reportingToId))
      .limit(1);
    if (mgr) managerName = [mgr.firstName, mgr.lastName].filter(Boolean).join(' ');
  }

  return {
    employeeCode: row.employeeCode,
    name: [row.firstName, row.lastName].filter(Boolean).join(' '),
    email: row.email,
    department: row.departmentName,
    designation: row.designationName,
    manager: managerName,
    joiningDate: row.joiningDate,
    confirmationDate: row.confirmationDate,
    status: row.status,
    employmentType: row.employmentType,
  };
}

async function getLeaveBalance(ctx: HrAgentToolContext) {
  const year = new Date().getFullYear();
  const rows = await ctx.db
    .select({
      code: leaveTypes.code,
      name: leaveTypes.name,
      opening: leaveBalances.opening,
      accrued: leaveBalances.accrued,
      used: leaveBalances.used,
    })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
    .where(and(
      eq(leaveBalances.tenantId, ctx.tenantId),
      eq(leaveBalances.employeeId, ctx.employeeId),
      eq(leaveBalances.year, year),
    ));

  return {
    year,
    balances: rows.map((r) => ({
      code: r.code,
      name: r.name,
      opening: Number(r.opening),
      accrued: Number(r.accrued),
      used: Number(r.used),
      available: Number(r.opening) + Number(r.accrued) - Number(r.used),
    })),
  };
}

async function listLeaveRequests(
  ctx: HrAgentToolContext,
  status: string | undefined,
  limit: number | undefined,
) {
  const cap = Math.min(limit ?? 10, 30);
  const conds = [
    eq(leaveRequests.tenantId, ctx.tenantId),
    eq(leaveRequests.employeeId, ctx.employeeId),
  ];
  if (status) conds.push(sql`${leaveRequests.status}::text = ${status}`);

  const rows = await ctx.db
    .select({
      id: leaveRequests.id,
      typeCode: leaveTypes.code,
      typeName: leaveTypes.name,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      days: leaveRequests.days,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      appliedAt: leaveRequests.appliedAt,
      reviewedAt: leaveRequests.reviewedAt,
      rejectionReason: leaveRequests.rejectionReason,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(and(...conds))
    .orderBy(desc(leaveRequests.appliedAt))
    .limit(cap);

  return {
    count: rows.length,
    requests: rows.map((r) => ({
      type: r.typeCode,
      from: r.fromDate,
      to: r.toDate,
      days: Number(r.days),
      status: r.status,
      reason: r.reason,
      appliedAt: r.appliedAt,
      reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
    })),
  };
}

async function getPayslip(ctx: HrAgentToolContext, month: number | undefined, year: number | undefined) {
  const conds = [
    eq(payslips.tenantId, ctx.tenantId),
    eq(payslips.employeeId, ctx.employeeId),
  ];
  if (month && year) {
    conds.push(eq(payrollRuns.month, month));
    conds.push(eq(payrollRuns.year, year));
  }

  const rows = await ctx.db
    .select({
      runMonth: payrollRuns.month,
      runYear: payrollRuns.year,
      runStatus: payrollRuns.status,
      gross: payslips.gross,
      totalDeductions: payslips.totalDeductions,
      netPay: payslips.netPay,
      pfEmployee: payslips.pfEmployee,
      esiEmployee: payslips.esiEmployee,
      tds: payslips.tds,
      pt: payslips.pt,
      workingDays: payslips.workingDays,
      paidDays: payslips.paidDays,
      lopDays: payslips.lopDays,
      otHours: payslips.otHours,
    })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.payrollRunId))
    .where(and(...conds))
    .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
    .limit(1);

  if (rows.length === 0) return { found: false };
  const r = rows[0];
  return {
    found: true,
    month: r.runMonth,
    year: r.runYear,
    runStatus: r.runStatus,
    gross: Number(r.gross),
    totalDeductions: Number(r.totalDeductions),
    netPay: Number(r.netPay),
    pfEmployee: Number(r.pfEmployee),
    esiEmployee: Number(r.esiEmployee),
    tds: Number(r.tds),
    pt: Number(r.pt),
    workingDays: Number(r.workingDays),
    paidDays: Number(r.paidDays),
    lopDays: Number(r.lopDays),
    otHours: Number(r.otHours),
  };
}

async function getAttendanceSummary(
  ctx: HrAgentToolContext,
  month: number | undefined,
  year: number | undefined,
) {
  const now = new Date();
  const m = month ?? now.getMonth() + 1;
  const y = year ?? now.getFullYear();
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextMonthStart = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const rows = await ctx.db
    .select({
      status: attendance.status,
      hoursWorked: attendance.hoursWorked,
      otHours: attendance.otHours,
    })
    .from(attendance)
    .where(and(
      eq(attendance.tenantId, ctx.tenantId),
      eq(attendance.employeeId, ctx.employeeId),
      gte(attendance.date, monthStart),
      sql`${attendance.date} < ${nextMonthStart}`,
    ));

  const summary = {
    month: m,
    year: y,
    present: 0,
    absent: 0,
    halfDay: 0,
    leave: 0,
    holiday: 0,
    weekOff: 0,
    totalHours: 0,
    otHours: 0,
  };
  for (const r of rows) {
    if (r.status === 'present') summary.present++;
    else if (r.status === 'absent') summary.absent++;
    else if (r.status === 'half_day') summary.halfDay++;
    else if (r.status === 'leave') summary.leave++;
    else if (r.status === 'holiday') summary.holiday++;
    else if (r.status === 'week_off') summary.weekOff++;
    summary.totalHours += Number(r.hoursWorked ?? 0);
    summary.otHours += Number(r.otHours ?? 0);
  }
  return summary;
}

async function listExpenseClaims(
  ctx: HrAgentToolContext,
  status: string | undefined,
  limit: number | undefined,
) {
  const cap = Math.min(limit ?? 10, 30);
  const conds = [
    eq(expenseClaims.tenantId, ctx.tenantId),
    sql`${expenseClaims.employeeId} = ${ctx.employeeId}`,
  ];
  if (status) conds.push(sql`${expenseClaims.status}::text = ${status}`);

  const rows = await ctx.db
    .select({
      claimNumber: expenseClaims.claimNumber,
      claimDate: expenseClaims.claimDate,
      description: expenseClaims.description,
      totalAmount: expenseClaims.totalAmount,
      status: expenseClaims.status,
      approvedAt: expenseClaims.approvedAt,
      reimbursedAt: expenseClaims.reimbursedAt,
      rejectionReason: expenseClaims.rejectionReason,
    })
    .from(expenseClaims)
    .where(and(...conds))
    .orderBy(desc(expenseClaims.claimDate))
    .limit(cap);

  return {
    count: rows.length,
    claims: rows.map((r) => ({
      claimNumber: r.claimNumber,
      claimDate: r.claimDate,
      description: r.description,
      amount: Number(r.totalAmount),
      status: r.status,
      approvedAt: r.approvedAt,
      reimbursedAt: r.reimbursedAt,
      rejectionReason: r.rejectionReason,
    })),
  };
}

async function getHolidays(ctx: HrAgentToolContext, upcomingOnly: boolean | undefined) {
  const year = new Date().getFullYear();
  const todayIso = new Date().toISOString().slice(0, 10);
  const conds = [
    eq(holidays.tenantId, ctx.tenantId),
    sql`extract(year from ${holidays.date}) = ${year}`,
  ];
  if (upcomingOnly !== false) conds.push(gte(holidays.date, todayIso));

  const rows = await ctx.db
    .select({
      name: holidays.name,
      date: holidays.date,
      type: holidays.type,
      isPaid: holidays.isPaid,
    })
    .from(holidays)
    .where(and(...conds))
    .orderBy(holidays.date)
    .limit(40);

  return { year, count: rows.length, holidays: rows };
}

/**
 * Naive keyword search over the tenant's FAQ blob. Splits on blank lines into
 * paragraphs, ranks paragraphs by # of query-term hits, returns the top 4.
 */
function searchPolicy(faqs: string, query: string) {
  if (!faqs.trim()) return { paragraphs: [], note: 'No FAQ configured for this tenant' };
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  if (terms.length === 0) return { paragraphs: [] };

  const paragraphs = faqs.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const scored = paragraphs
    .map((p) => {
      const lower = p.toLowerCase();
      const score = terms.reduce((s, t) => s + (lower.includes(t) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return { paragraphs: scored.map((x) => x.p) };
}

const ALL_LETTER_KINDS = new Set([
  'salary_certificate', 'address_proof', 'experience',
  'offer', 'appointment', 'confirmation', 'increment', 'relieving', 'other',
]);

async function issueLetter(ctx: HrAgentToolContext, kind: string, reason?: string) {
  if (!ALL_LETTER_KINDS.has(kind)) {
    return { error: `Unknown letter kind "${kind}".` };
  }
  const [emp] = await ctx.db
    .select()
    .from(employees)
    .where(eq(employees.id, ctx.employeeId))
    .limit(1);
  if (!emp) return { error: 'Could not find your employee record.' };
  // Experience and relieving letters only make sense post-relieving.
  if ((kind === 'experience' || kind === 'relieving') && emp.status !== 'terminated') {
    return {
      error: `${kind === 'experience' ? 'Experience' : 'Relieving'} letter is available only after your relieving date.`,
    };
  }

  // Find the tenant's template for this kind. Any kind with a template can be
  // instant-issued — the template renders entirely from the employee's record.
  const [tmpl] = await ctx.db
    .select()
    .from(letterTemplates)
    .where(and(eq(letterTemplates.tenantId, ctx.tenantId), sql`${letterTemplates.kind}::text = ${kind}`))
    .limit(1);
  if (!tmpl) {
    // No template — fall back to a request so HR can draft one.
    const [row] = await ctx.db
      .insert(employeeLetters)
      .values({
        tenantId: ctx.tenantId,
        employeeId: emp.id,
        templateId: null,
        kind: kind as never,
        subject: null,
        renderedBody: '',
        tokens: null,
        status: 'requested',
        requestedReason: reason ?? null,
      })
      .returning();
    return {
      queued: true,
      letterId: row.id,
      kind: row.kind,
      instructions:
        'No template configured yet, so I\'ve queued this for HR to draft. Tell the employee HR will follow up shortly; they\'ll find it under HR → Letters once issued.',
    };
  }

  const letterhead = await buildLetterheadTokens(ctx.db, ctx.tenantId, null);
  const tokens = {
    employee: {
      firstName: emp.firstName,
      lastName: emp.lastName ?? '',
      fullName: [emp.firstName, emp.lastName].filter(Boolean).join(' '),
      employeeCode: emp.employeeCode,
      email: emp.email ?? '',
      phone: emp.phone ?? '',
      joiningDate: emp.joiningDate,
      ctcAnnual: emp.ctcAnnual ?? '0',
      pan: emp.pan ?? '',
    },
    date: {
      today: new Date().toISOString().slice(0, 10),
      todayLong: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
    },
    ...letterhead,
  };
  const renderedSubject = tmpl.subject ? renderTemplate(tmpl.subject, tokens) : null;
  const renderedBody = renderTemplate(tmpl.body, tokens);

  const [row] = await ctx.db
    .insert(employeeLetters)
    .values({
      tenantId: ctx.tenantId,
      employeeId: emp.id,
      templateId: tmpl.id,
      kind: tmpl.kind,
      subject: renderedSubject,
      renderedBody,
      tokens,
      status: 'issued',
      issuedAt: new Date(),
      requestedReason: reason ?? null,
    })
    .returning();

  // PDF is generated on-demand the first time the user opens the letter
  // from HR → Letters (see GET /me/letters/:id/pdf).

  return {
    issued: true,
    letterId: row.id,
    kind: row.kind,
    subject: row.subject,
    issuedAt: row.issuedAt,
    instructions: 'The letter is now issued. Tell the employee it will appear under HR → Letters within a minute with a downloadable PDF.',
  };
}

// ── Write actions (Phase 4) ────────────────────────────────────────────

async function submitLeaveRequest(
  ctx: HrAgentToolContext,
  input: { leaveTypeCode: string; fromDate: string; toDate: string; halfDay: boolean; reason: string },
) {
  // Resolve the tenant's leave type by code (case-insensitive).
  const [type] = await ctx.db
    .select({
      id: leaveTypes.id,
      name: leaveTypes.name,
      code: leaveTypes.code,
    })
    .from(leaveTypes)
    .where(and(
      eq(leaveTypes.tenantId, ctx.tenantId),
      sql`upper(${leaveTypes.code}) = upper(${input.leaveTypeCode})`,
      eq(leaveTypes.isActive, true),
    ))
    .limit(1);
  if (!type) {
    return { error: `Leave type "${input.leaveTypeCode}" not configured for your company. Ask the employee which type they meant.` };
  }

  // Sanity check: leaves more than 30 days in the past are almost always a
  // year-resolution mistake by the agent. Reject so the agent re-asks.
  const todayIso = new Date().toISOString().slice(0, 10);
  const fromTime = new Date(input.fromDate).getTime();
  const todayTime = new Date(todayIso).getTime();
  const daysAgo = Math.floor((todayTime - fromTime) / (24 * 60 * 60 * 1000));
  if (daysAgo > 30) {
    return {
      error: `from_date ${input.fromDate} is more than 30 days in the past. Today is ${todayIso}. Did you mean a future date? Re-check the year with the employee and resubmit.`,
    };
  }

  // Validate balance for the year of the start date.
  const year = Number(input.fromDate.slice(0, 4));
  const [bal] = await ctx.db
    .select({
      opening: leaveBalances.opening,
      accrued: leaveBalances.accrued,
      used: leaveBalances.used,
    })
    .from(leaveBalances)
    .where(and(
      eq(leaveBalances.tenantId, ctx.tenantId),
      eq(leaveBalances.employeeId, ctx.employeeId),
      eq(leaveBalances.leaveTypeId, type.id),
      eq(leaveBalances.year, year),
    ))
    .limit(1);
  const available = bal
    ? Number(bal.opening) + Number(bal.accrued) - Number(bal.used)
    : 0;

  // Estimate days (simple — calendar days; the service does the real working-day math).
  const days = approxDaysBetween(input.fromDate, input.toDate, input.halfDay);
  if (days <= 0) {
    return { error: 'Date range has no days (from_date is after to_date or both same with no half-day).' };
  }
  if (available < days) {
    return {
      error: `Insufficient balance: ${available} days available in ${type.code}, need ${days}. Suggest a different leave type or fewer days.`,
    };
  }

  // Half-day rule from the create service.
  if (input.halfDay && input.fromDate !== input.toDate) {
    return { error: 'Half-day leave must be on a single date (from_date and to_date must match).' };
  }

  // Overlap check against pending/approved.
  const overlap = await ctx.db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.tenantId, ctx.tenantId),
      eq(leaveRequests.employeeId, ctx.employeeId),
      sql`${leaveRequests.status} IN ('pending', 'approved')`,
      sql`${leaveRequests.fromDate} <= ${input.toDate}`,
      sql`${leaveRequests.toDate} >= ${input.fromDate}`,
    ))
    .limit(1);
  if (overlap.length > 0) {
    return { error: 'You already have a pending or approved leave that overlaps these dates.' };
  }

  const [row] = await ctx.db
    .insert(leaveRequests)
    .values({
      tenantId: ctx.tenantId,
      employeeId: ctx.employeeId,
      leaveTypeId: type.id,
      fromDate: input.fromDate,
      toDate: input.toDate,
      halfDay: input.halfDay,
      days: String(days),
      reason: input.reason,
    })
    .returning();

  // Manager name (for the agent's confirmation message).
  let managerName: string | null = null;
  const [emp] = await ctx.db
    .select({ reportingToId: employees.reportingToId })
    .from(employees)
    .where(eq(employees.id, ctx.employeeId))
    .limit(1);
  if (emp?.reportingToId) {
    const [mgr] = await ctx.db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(eq(employees.id, emp.reportingToId))
      .limit(1);
    if (mgr) managerName = [mgr.firstName, mgr.lastName].filter(Boolean).join(' ');
  }

  return {
    submitted: true,
    requestId: row.id,
    leaveType: type.name,
    leaveTypeCode: type.code,
    fromDate: row.fromDate,
    toDate: row.toDate,
    days: Number(row.days),
    halfDay: row.halfDay,
    balanceAfter: Math.max(0, available - days),
    manager: managerName,
    instructions: managerName
      ? `Leave request submitted (pending ${managerName}'s approval). Tell the employee they'll get a notification once their manager approves. Mention the dates, type, and that their remaining ${type.code} balance is ${Math.max(0, available - days)} days.`
      : `Leave request submitted (pending approval). Tell the employee they'll get a notification once approved. Mention the dates, type, and remaining balance.`,
  };
}

async function submitRegularization(
  ctx: HrAgentToolContext,
  input: { date: string; requestedCheckIn?: string; requestedCheckOut?: string; requestedStatus?: 'present' | 'half_day' | 'absent'; reason: string },
) {
  // Past-or-today only.
  const todayIso = new Date().toISOString().slice(0, 10);
  if (input.date > todayIso) {
    return { error: 'Regularization is for past missed attendance only. The date must be today or earlier.' };
  }
  if (input.reason.trim().length < 3) {
    return { error: 'Please give a short reason (at least a few words) for the regularization.' };
  }

  // Don't double-submit: if a pending regularization already exists for this date, fail.
  const existing = await ctx.db
    .select({ id: attendanceRegularizations.id })
    .from(attendanceRegularizations)
    .where(and(
      eq(attendanceRegularizations.tenantId, ctx.tenantId),
      eq(attendanceRegularizations.employeeId, ctx.employeeId),
      eq(attendanceRegularizations.date, input.date),
      sql`${attendanceRegularizations.status} IN ('pending', 'approved')`,
    ))
    .limit(1);
  if (existing.length > 0) {
    return { error: `A regularization for ${input.date} already exists (pending or approved). Ask the employee to check HR → Attendance.` };
  }

  const [row] = await ctx.db
    .insert(attendanceRegularizations)
    .values({
      tenantId: ctx.tenantId,
      employeeId: ctx.employeeId,
      date: input.date,
      requestedCheckIn: input.requestedCheckIn ?? null,
      requestedCheckOut: input.requestedCheckOut ?? null,
      requestedStatus: input.requestedStatus ?? 'present',
      reason: input.reason,
    })
    .returning();

  return {
    submitted: true,
    requestId: row.id,
    date: row.date,
    requestedCheckIn: row.requestedCheckIn,
    requestedCheckOut: row.requestedCheckOut,
    requestedStatus: row.requestedStatus,
    instructions: 'Regularization submitted (pending approval). Tell the employee HR or their manager will review it within 1–2 business days and they\'ll see the update under HR → Attendance.',
  };
}

function approxDaysBetween(from: string, to: string, halfDay: boolean): number {
  if (halfDay) return 0.5;
  const a = new Date(from);
  const b = new Date(to);
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

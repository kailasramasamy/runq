// Validators for HR phase-next features:
// geo-fence + punches, regularizations, tax declarations, loans, FNF,
// onboarding, letters, helpdesk tickets, performance.

import { z } from 'zod';

// ============ GEO + PUNCHES ============
export const createGeoFenceSchema = z.object({
  name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(10).max(50000).default(200),
  isActive: z.boolean().default(true),
});
export const updateGeoFenceSchema = createGeoFenceSchema.partial();

export const createPunchSchema = z.object({
  kind: z.enum(['in', 'out']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyMeters: z.number().min(0).max(10000).optional(),
  selfieUrl: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

// ============ REGULARIZATIONS ============
export const createRegularizationSchema = z.object({
  date: z.string().date(),
  requestedCheckIn: z.string().max(8).optional(),
  requestedCheckOut: z.string().max(8).optional(),
  requestedStatus: z.enum(['present', 'half_day', 'absent']).optional(),
  reason: z.string().min(3).max(2000),
});
export const reviewRegularizationSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().max(2000).optional(),
});

// ============ TAX DECLARATIONS ============
export const taxDeclItemSchema = z.object({
  section: z.string().min(1).max(30),
  particulars: z.string().min(1).max(200),
  amount: z.number().min(0),
  meta: z.record(z.unknown()).optional(),
  proofUrl: z.string().max(500).optional(),
});

export const createTaxDeclarationSchema = z.object({
  employeeId: z.string().uuid().optional(),
  financialYear: z.string().regex(/^\d{4}-\d{4}$/),
  regime: z.enum(['old', 'new']).default('new'),
  hraTotal: z.number().min(0).default(0),
  ltaTotal: z.number().min(0).default(0),
  homeLoanInterest: z.number().min(0).default(0),
  section80c: z.number().min(0).default(0),
  section80d: z.number().min(0).default(0),
  section80g: z.number().min(0).default(0),
  section80ccd1b: z.number().min(0).default(0),
  otherDeductions: z.number().min(0).default(0),
  notes: z.string().max(2000).optional(),
  items: z.array(taxDeclItemSchema).default([]),
});
export const updateTaxDeclarationSchema = createTaxDeclarationSchema.partial();
export const reviewTaxDeclarationSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().max(2000).optional(),
});

// ============ LOANS ============
export const createLoanSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(['advance', 'personal', 'festival', 'education', 'other']).default('advance'),
  principal: z.number().positive(),
  totalInstalments: z.number().int().min(1).max(120),
  disbursedOn: z.string().date(),
  firstEmiMonth: z.number().int().min(1).max(12),
  firstEmiYear: z.number().int().min(2000).max(2100),
  reason: z.string().max(2000).optional(),
});
export const approveLoanSchema = z.object({
  approved: z.boolean(),
  // HR may override the request defaults at approval time.
  disbursedOn: z.string().date().optional(),
  firstEmiMonth: z.number().int().min(1).max(12).optional(),
  firstEmiYear: z.number().int().min(2000).max(2100).optional(),
});
export const rejectLoanSchema = z.object({
  rejectionReason: z.string().min(1).max(2000),
});
// Employee self-request: no employeeId (resolved from session), no
// disbursedOn (HR sets at approval).
export const requestLoanSchema = z.object({
  kind: z.enum(['advance', 'personal', 'festival', 'education', 'other']).default('advance'),
  principal: z.number().positive(),
  totalInstalments: z.number().int().min(1).max(120),
  firstEmiMonth: z.number().int().min(1).max(12),
  firstEmiYear: z.number().int().min(2000).max(2100),
  reason: z.string().max(2000).optional(),
});

// ============ FNF ============
export const createFnfSchema = z.object({
  employeeId: z.string().uuid(),
  resignationDate: z.string().date().optional(),
  lastWorkingDate: z.string().date(),
  noticePeriodDays: z.number().min(0).optional(),
  noticeShortfallDays: z.number().min(0).default(0),
  lastMonthSalary: z.number().min(0).default(0),
  leaveEncashment: z.number().min(0).default(0),
  gratuity: z.number().min(0).default(0),
  bonusPayable: z.number().min(0).default(0),
  otherEarnings: z.number().min(0).default(0),
  noticeRecovery: z.number().min(0).default(0),
  loanRecovery: z.number().min(0).default(0),
  tds: z.number().min(0).default(0),
  pfDeduction: z.number().min(0).default(0),
  otherDeductions: z.number().min(0).default(0),
  notes: z.string().max(2000).optional(),
});
export const updateFnfSchema = createFnfSchema.partial();

// ============ ONBOARDING ============
export const onboardingTemplateItemSchema = z.object({
  sequence: z.number().int().min(0),
  title: z.string().min(1).max(200),
  kind: z.enum(['document_upload', 'task', 'acknowledgement', 'asset_issue', 'induction']).default('task'),
  assignedRole: z.string().max(30).default('employee'),
  // Required when kind=document_upload. Tags the uploaded file with one of
  // the standard HR document kinds so it slots into the employee's
  // Documents tab automatically.
  documentKind: z.string().max(40).optional(),
  dueDays: z.number().int().min(0).optional(),
  instructions: z.string().max(5000).optional(),
});

export const createOnboardingTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().default(false),
  items: z.array(onboardingTemplateItemSchema).default([]),
});
export const updateOnboardingTemplateSchema = createOnboardingTemplateSchema.partial();

export const startOnboardingSchema = z.object({
  employeeId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
});
export const completeOnboardingItemSchema = z.object({
  notes: z.string().max(2000).optional(),
});

// ============ LETTERS ============
export const letterKindSchema = z.enum([
  'offer', 'appointment', 'confirmation', 'increment',
  'experience', 'relieving', 'salary_certificate', 'address_proof', 'other',
]);

export const createLetterTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  kind: letterKindSchema,
  subject: z.string().max(200).optional(),
  body: z.string().min(1),
});
export const updateLetterTemplateSchema = createLetterTemplateSchema.partial();

export const generateLetterSchema = z.object({
  employeeId: z.string().uuid(),
  templateId: z.string().uuid(),
  extraTokens: z.record(z.string()).optional(),
});
export const issueLetterSchema = z.object({
  sendEmail: z.boolean().default(false),
});

// Employee asks HR for a letter; reason describes the purpose (visa, bank,
// rental, etc.). HR later picks a template and fulfils the request.
export const requestLetterSchema = z.object({
  kind: letterKindSchema,
  reason: z.string().min(1).max(2000),
});
export const fulfilLetterRequestSchema = z.object({
  templateId: z.string().uuid(),
  extraTokens: z.record(z.string()).optional(),
});
export type RequestLetterInput = z.infer<typeof requestLetterSchema>;
export type FulfilLetterRequestInput = z.infer<typeof fulfilLetterRequestSchema>;

// ============ HELPDESK ============
export const ticketCategorySchema = z.enum([
  'payroll', 'leave', 'attendance', 'reimbursement',
  'asset', 'it', 'document', 'general',
]);
export const ticketPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export const ticketStatusSchema = z.enum(['open', 'in_progress', 'resolved', 'closed']);

export const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().max(10000).optional(),
  category: ticketCategorySchema.default('general'),
  priority: ticketPrioritySchema.default('normal'),
});
export const updateTicketSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  category: ticketCategorySchema.optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});
export const ticketCommentSchema = z.object({
  body: z.string().min(1).max(10000),
});

// ============ PERFORMANCE ============
export const createCycleSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().date(),
  endDate: z.string().date(),
  reviewStartDate: z.string().date().optional(),
  reviewEndDate: z.string().date().optional(),
  status: z.enum(['planned', 'active', 'review', 'closed']).default('planned'),
});
export const updateCycleSchema = createCycleSchema.partial();

export const createGoalSchema = z.object({
  cycleId: z.string().uuid(),
  employeeId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  weight: z.number().min(0).max(100),
  targetMetric: z.string().max(200).optional(),
});
export const updateGoalSchema = createGoalSchema.partial().extend({
  status: z.enum(['draft', 'active', 'achieved', 'partially_achieved', 'not_achieved', 'dropped']).optional(),
  selfRating: z.number().min(0).max(5).optional(),
  managerRating: z.number().min(0).max(5).optional(),
  finalRating: z.number().min(0).max(5).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  comments: z.string().max(5000).optional(),
});

export const reviewSubmitSchema = z.object({
  selfComments: z.string().max(10000).optional(),
  managerComments: z.string().max(10000).optional(),
  selfOverallRating: z.number().min(0).max(5).optional(),
  managerOverallRating: z.number().min(0).max(5).optional(),
  finalOverallRating: z.number().min(0).max(5).optional(),
});

export type CreateGeoFenceInput = z.infer<typeof createGeoFenceSchema>;
export type UpdateGeoFenceInput = z.infer<typeof updateGeoFenceSchema>;
export type CreatePunchInput = z.infer<typeof createPunchSchema>;
export type CreateRegularizationInput = z.infer<typeof createRegularizationSchema>;
export type ReviewRegularizationInput = z.infer<typeof reviewRegularizationSchema>;
export type CreateTaxDeclarationInput = z.infer<typeof createTaxDeclarationSchema>;
export type UpdateTaxDeclarationInput = z.infer<typeof updateTaxDeclarationSchema>;
export type ReviewTaxDeclarationInput = z.infer<typeof reviewTaxDeclarationSchema>;
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type ApproveLoanInput = z.infer<typeof approveLoanSchema>;
export type RejectLoanInput = z.infer<typeof rejectLoanSchema>;
export type RequestLoanInput = z.infer<typeof requestLoanSchema>;

// HR loan policy — controls the employee request flow.
export const loanPolicySchema = z.object({
  employeeRequestsEnabled: z.boolean(),
  minTenureDays: z.number().int().min(0).max(3650),
  maxPctOfMonthlyCtc: z.number().int().min(1).max(1000),
  maxActiveLoans: z.number().int().min(1).max(10),
  managerApprovalRequired: z.boolean(),
  // Comma-joined kinds; null/empty means all kinds allowed.
  allowedKinds: z.array(z.enum(['advance', 'personal', 'festival', 'education', 'other'])).nullable().optional(),
});
export type LoanPolicyInput = z.infer<typeof loanPolicySchema>;

export const managerRejectLoanSchema = rejectLoanSchema;
export type ManagerRejectLoanInput = z.infer<typeof managerRejectLoanSchema>;

// ============ HELPDESK AI AGENT ============
export const TICKET_CATEGORIES = [
  'payroll', 'leave', 'attendance', 'reimbursement',
  'asset', 'it', 'document', 'general',
] as const;

export const agentCategorySettingSchema = z.object({
  // tier: 0=off, 1=draft only, 2=auto-send high confidence, 3=auto-resolve
  tier: z.number().int().min(0).max(3).default(1),
  autoResolve: z.boolean().default(false),
});

export const helpdeskAgentSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  // Per-tenant FAQ — pasted into the agent's system prompt. Soft cap so
  // the prompt stays cacheable; large policy docs should move to RAG.
  faqs: z.string().max(20000).default(''),
  // Which HR user "operates" the agent — Tier 2/3 replies are attributed
  // to this user (and Tier 1 sends fall through to whoever clicked Send).
  operatorUserId: z.string().uuid().nullish(),
  perCategory: z.record(
    z.enum(TICKET_CATEGORIES),
    agentCategorySettingSchema,
  ).default({} as Record<typeof TICKET_CATEGORIES[number], { tier: number; autoResolve: boolean }>),
});
export type HelpdeskAgentSettingsInput = z.infer<typeof helpdeskAgentSettingsSchema>;
export type CreateFnfInput = z.infer<typeof createFnfSchema>;
export type UpdateFnfInput = z.infer<typeof updateFnfSchema>;
export type CreateOnboardingTemplateInput = z.infer<typeof createOnboardingTemplateSchema>;
export type UpdateOnboardingTemplateInput = z.infer<typeof updateOnboardingTemplateSchema>;
export type StartOnboardingInput = z.infer<typeof startOnboardingSchema>;
export type CompleteOnboardingItemInput = z.infer<typeof completeOnboardingItemSchema>;
export type CreateLetterTemplateInput = z.infer<typeof createLetterTemplateSchema>;
export type UpdateLetterTemplateInput = z.infer<typeof updateLetterTemplateSchema>;
export type GenerateLetterInput = z.infer<typeof generateLetterSchema>;
export type IssueLetterInput = z.infer<typeof issueLetterSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type TicketCommentInput = z.infer<typeof ticketCommentSchema>;
export type CreateCycleInput = z.infer<typeof createCycleSchema>;
export type UpdateCycleInput = z.infer<typeof updateCycleSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type ReviewSubmitInput = z.infer<typeof reviewSubmitSchema>;

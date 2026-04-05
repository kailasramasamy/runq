import { eq, and } from 'drizzle-orm';
import type { Db } from '../src/client';
import { users } from '../src/schema/user';
import { vendors } from '../src/schema/ap/vendors';
import { purchaseInvoices } from '../src/schema/ap/purchase-invoices';
import { salesInvoices } from '../src/schema/ar/invoices';
import { accounts } from '../src/schema/gl/accounts';
import { journalEntries, journalLines } from '../src/schema/gl/journal-entries';
import { fiscalPeriods } from '../src/schema/gl/fiscal-periods';
import { dashboardWidgets } from '../src/schema/dashboard/widgets';
import { scheduledReports } from '../src/schema/dashboard/scheduled-reports';
import { integrations, integrationLogs } from '../src/schema/integrations/integrations';
import {
  approvalWorkflows, approvalRules, approvalInstances, approvalSteps,
} from '../src/schema/workflows/approval-workflows';
import { transactionComments } from '../src/schema/workflows/comments';
import { taskAssignments } from '../src/schema/workflows/tasks';
import { activityLog } from '../src/schema/workflows/activity-log';
import { vendorContracts } from '../src/schema/ap/vendor-contracts';
import { vendorRatings } from '../src/schema/ap/vendor-ratings';
import { paymentSchedules, paymentScheduleItems } from '../src/schema/ap/payment-schedules';
import { purchaseRequisitions, purchaseRequisitionItems } from '../src/schema/ap/purchase-requisitions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

function futureTimestamp(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

// ---------------------------------------------------------------------------
// Test 8: Fiscal Periods — 12 monthly periods for FY 2025-26
// ---------------------------------------------------------------------------

async function seedFiscalPeriods(db: Db, tenantId: string, userId: string) {
  const months = [
    { name: 'Apr 2025', start: '2025-04-01', end: '2025-04-30', status: 'locked' as const },
    { name: 'May 2025', start: '2025-05-01', end: '2025-05-31', status: 'locked' as const },
    { name: 'Jun 2025', start: '2025-06-01', end: '2025-06-30', status: 'locked' as const },
    { name: 'Jul 2025', start: '2025-07-01', end: '2025-07-31', status: 'closed' as const },
    { name: 'Aug 2025', start: '2025-08-01', end: '2025-08-31', status: 'closed' as const },
    { name: 'Sep 2025', start: '2025-09-01', end: '2025-09-30', status: 'closed' as const },
    { name: 'Oct 2025', start: '2025-10-01', end: '2025-10-31', status: 'closed' as const },
    { name: 'Nov 2025', start: '2025-11-01', end: '2025-11-30', status: 'closed' as const },
    { name: 'Dec 2025', start: '2025-12-01', end: '2025-12-31', status: 'closed' as const },
    { name: 'Jan 2026', start: '2026-01-01', end: '2026-01-31', status: 'open' as const },
    { name: 'Feb 2026', start: '2026-02-01', end: '2026-02-28', status: 'open' as const },
    { name: 'Mar 2026', start: '2026-03-01', end: '2026-03-31', status: 'open' as const },
  ];

  const rows = months.map((m) => ({
    tenantId,
    name: m.name,
    startDate: m.start,
    endDate: m.end,
    status: m.status,
    closedBy: m.status !== 'open' ? userId : undefined,
    closedAt: m.status !== 'open' ? new Date('2026-03-31') : undefined,
  }));

  return db.insert(fiscalPeriods).values(rows).onConflictDoNothing().returning({ id: fiscalPeriods.id });
}

// ---------------------------------------------------------------------------
// Test 9: Dashboard Widgets — default 12 widgets
// ---------------------------------------------------------------------------

const WIDGET_TYPES = [
  'cash_position', 'stats_overview', 'profit_loss_summary', 'receivables_aging',
  'payables_aging', 'revenue_trend', 'expense_trend', 'bank_balances',
  'top_customers', 'top_vendors', 'recent_transactions', 'ai_insights',
];

async function seedDashboardWidgets(db: Db, tenantId: string, userId: string) {
  const rows = WIDGET_TYPES.map((wt, i) => ({
    tenantId,
    userId,
    widgetType: wt,
    position: i,
    isVisible: wt !== 'ai_insights', // ai_insights hidden by default for testing
  }));

  return db.insert(dashboardWidgets).values(rows).returning({ id: dashboardWidgets.id });
}

// ---------------------------------------------------------------------------
// Test 10: Scheduled Reports
// ---------------------------------------------------------------------------

async function seedScheduledReports(db: Db, tenantId: string, userId: string) {
  const reports = [
    {
      name: 'Daily Cash Position',
      reportType: 'cash_position',
      frequency: 'daily' as const,
      recipients: ['admin@demo.com'],
      nextRunAt: futureTimestamp(1),
    },
    {
      name: 'Weekly P&L Summary',
      reportType: 'profit_and_loss',
      frequency: 'weekly' as const,
      recipients: ['admin@demo.com', 'ca@sharmaassociates.in'],
      nextRunAt: futureTimestamp(7),
    },
    {
      name: 'Monthly Balance Sheet',
      reportType: 'balance_sheet',
      frequency: 'monthly' as const,
      recipients: ['admin@demo.com'],
      nextRunAt: futureTimestamp(30),
    },
  ];

  const rows = reports.map((r) => ({
    tenantId,
    createdBy: userId,
    name: r.name,
    reportType: r.reportType,
    frequency: r.frequency,
    recipients: r.recipients,
    isActive: true,
    nextRunAt: r.nextRunAt,
  }));

  return db.insert(scheduledReports).values(rows).returning({ id: scheduledReports.id });
}

// ---------------------------------------------------------------------------
// Test 11-14: Approval Workflows, Comments, Tasks, Activity Log
// ---------------------------------------------------------------------------

async function seedWorkflows(
  db: Db, tenantId: string, userId: string, piIds: string[],
) {
  // --- Approval Workflow: Payment Approval ---
  const [paymentWf] = await db.insert(approvalWorkflows).values({
    tenantId,
    name: 'Payment Approval',
    entityType: 'payment',
  }).onConflictDoNothing().returning();

  if (!paymentWf) {
    console.log('  Approval workflows already exist, skipping...');
    return;
  }

  // --- Approval Workflow: Purchase Invoice Approval ---
  const [invoiceWf] = await db.insert(approvalWorkflows).values({
    tenantId,
    name: 'Purchase Invoice Approval',
    entityType: 'purchase_invoice',
  }).returning();

  // Rules for Payment Approval
  const [payRule1, payRule2] = await db.insert(approvalRules).values([
    { tenantId, workflowId: paymentWf.id, stepOrder: 1, approverRole: 'accountant', minAmount: '0', maxAmount: '50000' },
    { tenantId, workflowId: paymentWf.id, stepOrder: 2, approverRole: 'owner', minAmount: '50000', maxAmount: null },
  ]).returning();

  // Rules for Invoice Approval
  const [invRule1] = await db.insert(approvalRules).values([
    { tenantId, workflowId: invoiceWf.id, stepOrder: 1, approverRole: 'accountant', minAmount: '0', maxAmount: null },
  ]).returning();

  // Create an approval instance for a purchase invoice (PI index 4 = FF-2026-005, ₹500,000 draft)
  const targetPiId = piIds[4]; // The big emergency purchase
  const [instance] = await db.insert(approvalInstances).values({
    tenantId,
    workflowId: invoiceWf.id,
    entityType: 'purchase_invoice',
    entityId: targetPiId,
    status: 'pending',
    requestedBy: userId,
  }).returning();

  // Approval step for this instance
  await db.insert(approvalSteps).values({
    tenantId,
    instanceId: instance.id,
    ruleId: invRule1.id,
    stepOrder: 1,
    status: 'pending',
    assignedTo: userId,
    assignedRole: 'accountant',
  });

  // --- Comments on purchase invoices ---
  await db.insert(transactionComments).values([
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[4],
      userId, content: 'This is an emergency bulk order. Vendor confirmed delivery by March 10.',
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[4],
      userId, content: 'Checked with warehouse — we have storage capacity for this volume.',
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[6],
      userId, content: 'Partial payment sent. Remaining ₹16,520 due by Feb 28.',
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[12],
      userId, content: 'Vendor confirmed receipt of payment via email.',
    },
  ]);

  // --- Tasks ---
  await db.insert(taskAssignments).values([
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[4],
      title: 'Follow up with Fresh Farms on bulk milk delivery',
      description: 'Confirm delivery schedule for ₹5L emergency order',
      assignedTo: userId, assignedBy: userId,
      dueDate: futureDate(3), status: 'open',
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[6],
      title: 'Clear remaining balance for Packwell PWI-2026-002',
      assignedTo: userId, assignedBy: userId,
      dueDate: futureDate(5), status: 'in_progress',
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[9],
      title: 'Reconcile Swift Logistics freight invoice SL-2026-002',
      assignedTo: userId, assignedBy: userId,
      dueDate: futureDate(-2), status: 'open', // overdue
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[11],
      title: 'File TDS return for Sharma & Associates CA fees',
      assignedTo: userId, assignedBy: userId,
      dueDate: futureDate(10), status: 'completed',
      completedAt: new Date(),
    },
  ]);

  // --- Activity Log ---
  await db.insert(activityLog).values([
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[4],
      action: 'workflow_submitted', description: 'Submitted for approval: Purchase Invoice FF-2026-005 (₹5,00,000)',
      userId, metadata: { amount: 500000, workflowName: 'Purchase Invoice Approval' },
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[4],
      action: 'comment_added', description: 'Comment added on emergency bulk order',
      userId, metadata: {},
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[4],
      action: 'task_created', description: 'Task assigned: Follow up with Fresh Farms on bulk milk delivery',
      userId, metadata: { dueDate: futureDate(3) },
    },
    {
      tenantId, entityType: 'purchase_invoice', entityId: piIds[11],
      action: 'task_completed', description: 'Task completed: File TDS return for Sharma & Associates CA fees',
      userId, metadata: {},
    },
  ]);

  return { paymentWf, invoiceWf };
}

// ---------------------------------------------------------------------------
// Test 15-16: Payment Schedules
// ---------------------------------------------------------------------------

async function seedPaymentSchedules(
  db: Db, tenantId: string, userId: string,
  vendorIds: string[], piIds: string[],
) {
  // Friday Payments batch — approved invoices
  const [fridaySchedule] = await db.insert(paymentSchedules).values({
    tenantId,
    name: 'Friday Payments - Apr Wk1',
    scheduledDate: futureDate(4),
    status: 'draft',
    totalAmount: '154600',
    createdBy: userId,
  }).returning();

  // Items: approved purchase invoices with balance due
  // PI idx 2 = FF-2026-003 (₹92,000), PI idx 3 = FF-2026-004 (₹98,000 approved)
  // PI idx 7 = PWI-2026-003 (₹38,000 + 18% = ₹44,840 approved)
  // PI idx 10 = SL-2026-003 (₹14,000 + 5% = ₹14,700 approved)
  await db.insert(paymentScheduleItems).values([
    { tenantId, scheduleId: fridaySchedule.id, invoiceId: piIds[2], vendorId: vendorIds[0], amount: '92000' },
    { tenantId, scheduleId: fridaySchedule.id, invoiceId: piIds[3], vendorId: vendorIds[0], amount: '98000' },
  ]);

  // Second schedule — already approved
  const [approvedSchedule] = await db.insert(paymentSchedules).values({
    tenantId,
    name: 'Packaging & Logistics Batch',
    scheduledDate: futureDate(7),
    status: 'approved',
    totalAmount: '59540',
    createdBy: userId,
    approvedBy: userId,
    approvedAt: new Date(),
  }).returning();

  await db.insert(paymentScheduleItems).values([
    { tenantId, scheduleId: approvedSchedule.id, invoiceId: piIds[7], vendorId: vendorIds[1], amount: '44840' },
    { tenantId, scheduleId: approvedSchedule.id, invoiceId: piIds[10], vendorId: vendorIds[2], amount: '14700' },
  ]);

  return [fridaySchedule, approvedSchedule];
}

// ---------------------------------------------------------------------------
// Test 17: Purchase Requisitions
// ---------------------------------------------------------------------------

async function seedPurchaseRequisitions(
  db: Db, tenantId: string, userId: string, vendorIds: string[],
) {
  // PR-0001: Office supplies (draft)
  const [pr1] = await db.insert(purchaseRequisitions).values({
    tenantId,
    requisitionNumber: 'PR-0001',
    requestedBy: userId,
    vendorId: vendorIds[1], // Packwell
    description: 'Office supplies for Q2 — printer paper, ink cartridges',
    totalAmount: '40000',
    status: 'draft',
  }).returning();

  await db.insert(purchaseRequisitionItems).values([
    { tenantId, requisitionId: pr1.id, itemName: 'Printer Paper A4 (500 sheets)', quantity: '100', estimatedUnitPrice: '250', estimatedAmount: '25000' },
    { tenantId, requisitionId: pr1.id, itemName: 'Ink Cartridges (HP 678)', quantity: '10', estimatedUnitPrice: '1500', estimatedAmount: '15000' },
  ]);

  // PR-0002: Packaging material (approved)
  const [pr2] = await db.insert(purchaseRequisitions).values({
    tenantId,
    requisitionNumber: 'PR-0002',
    requestedBy: userId,
    vendorId: vendorIds[1], // Packwell
    description: 'HDPE milk pouches for Q2 production',
    totalAmount: '75000',
    status: 'approved',
    approvedBy: userId,
    approvedAt: new Date(),
  }).returning();

  await db.insert(purchaseRequisitionItems).values([
    { tenantId, requisitionId: pr2.id, itemName: 'HDPE Milk Pouches 500ml', quantity: '5000', estimatedUnitPrice: '8', estimatedAmount: '40000' },
    { tenantId, requisitionId: pr2.id, itemName: 'HDPE Milk Pouches 1L', quantity: '2500', estimatedUnitPrice: '14', estimatedAmount: '35000' },
  ]);

  // PR-0003: Cold storage maintenance (converted)
  const [pr3] = await db.insert(purchaseRequisitions).values({
    tenantId,
    requisitionNumber: 'PR-0003',
    requestedBy: userId,
    vendorId: vendorIds[3], // Sharma & Associates
    description: 'Annual cold storage equipment maintenance',
    totalAmount: '120000',
    status: 'converted',
    approvedBy: userId,
    approvedAt: new Date('2026-03-15'),
  }).returning();

  await db.insert(purchaseRequisitionItems).values([
    { tenantId, requisitionId: pr3.id, itemName: 'Compressor servicing', quantity: '3', estimatedUnitPrice: '25000', estimatedAmount: '75000' },
    { tenantId, requisitionId: pr3.id, itemName: 'Coolant refill', quantity: '5', estimatedUnitPrice: '9000', estimatedAmount: '45000' },
  ]);

  return [pr1, pr2, pr3];
}

// ---------------------------------------------------------------------------
// Test 18: Vendor Ratings
// ---------------------------------------------------------------------------

async function seedVendorRatings(
  db: Db, tenantId: string, userId: string, vendorIds: string[],
) {
  const ratings = [
    // Fresh Farms — excellent quality raw milk, decent pricing
    { vendorId: vendorIds[0], period: '2025-Q3', delivery: 4, quality: 5, pricing: 3, overall: 4, notes: 'Reliable supply, pricing slightly above market' },
    { vendorId: vendorIds[0], period: '2025-Q4', delivery: 5, quality: 5, pricing: 3, overall: 4, notes: 'Consistent quality, negotiating better rates for Q1' },
    { vendorId: vendorIds[0], period: '2026-Q1', delivery: 4, quality: 5, pricing: 4, overall: 4, notes: 'New rates agreed, quality remains excellent' },
    // Packwell — good packaging but occasional delays
    { vendorId: vendorIds[1], period: '2025-Q4', delivery: 3, quality: 4, pricing: 4, overall: 4, notes: 'Two late deliveries in December' },
    { vendorId: vendorIds[1], period: '2026-Q1', delivery: 4, quality: 4, pricing: 4, overall: 4, notes: 'Delivery improved after feedback' },
    // Swift Logistics — fast but expensive
    { vendorId: vendorIds[2], period: '2026-Q1', delivery: 5, quality: 4, pricing: 2, overall: 4, notes: 'Fast delivery but 15% above competitor rates' },
    // Sharma & Associates — top-notch CA services
    { vendorId: vendorIds[3], period: '2026-Q1', delivery: 5, quality: 5, pricing: 3, overall: 4, notes: 'Excellent audit work, high fees justified by quality' },
    // Realty Trust — basic rent, no issues
    { vendorId: vendorIds[4], period: '2026-Q1', delivery: 5, quality: 3, pricing: 3, overall: 4, notes: 'Standard office space, maintenance could improve' },
  ];

  const rows = ratings.map((r) => ({
    tenantId,
    vendorId: r.vendorId,
    period: r.period,
    deliveryScore: r.delivery,
    qualityScore: r.quality,
    pricingScore: r.pricing,
    overallScore: r.overall,
    notes: r.notes,
    ratedBy: userId,
  }));

  return db.insert(vendorRatings).values(rows).onConflictDoNothing().returning({ id: vendorRatings.id });
}

// ---------------------------------------------------------------------------
// Test 19: Vendor Contracts
// ---------------------------------------------------------------------------

async function seedVendorContracts(
  db: Db, tenantId: string, vendorIds: string[],
) {
  const contracts = [
    {
      vendorId: vendorIds[0], contractNumber: 'CTR-001',
      title: 'Annual Raw Milk Supply Agreement',
      startDate: '2026-01-01', endDate: '2026-12-31',
      value: '500000', terms: 'Net 15 payment terms. Minimum 1000L/day. Quality: min 3.5% fat content.',
      status: 'active' as const, renewalDate: '2026-11-01',
    },
    {
      vendorId: vendorIds[1], contractNumber: 'CTR-002',
      title: 'Packaging Material Supply Contract',
      startDate: '2026-04-01', endDate: '2027-03-31',
      value: '300000', terms: 'Net 30 payment terms. Quarterly price revision allowed.',
      status: 'draft' as const, renewalDate: '2027-02-01',
    },
    {
      vendorId: vendorIds[2], contractNumber: 'CTR-003',
      title: 'Logistics & Distribution Agreement',
      startDate: '2025-04-01', endDate: '2026-03-31',
      value: '180000', terms: 'Net 7 payment terms. Covers Maharashtra intra-state transport only.',
      status: 'expired' as const, renewalDate: null,
    },
    {
      vendorId: vendorIds[4], contractNumber: 'CTR-004',
      title: 'Office Lease Agreement',
      startDate: '2025-01-01', endDate: '2027-12-31',
      value: '1260000', terms: '11-month renewable lease. ₹35,000/month. 5% annual escalation.',
      status: 'active' as const, renewalDate: '2027-10-01',
    },
  ];

  const rows = contracts.map((c) => ({ tenantId, ...c }));
  return db.insert(vendorContracts).values(rows).returning({ id: vendorContracts.id });
}

// ---------------------------------------------------------------------------
// Test 20: Integrations
// ---------------------------------------------------------------------------

async function seedIntegrations(db: Db, tenantId: string) {
  const [razorpay] = await db.insert(integrations).values({
    tenantId,
    provider: 'razorpay',
    isActive: true,
    config: { apiKey: 'rzp_test_abc123', secret: 'test_secret_xyz' },
    lastSyncAt: new Date('2026-03-30T10:00:00Z'),
  }).onConflictDoNothing().returning();

  if (!razorpay) {
    console.log('  Integrations already exist, skipping...');
    return;
  }

  const [slack] = await db.insert(integrations).values({
    tenantId,
    provider: 'slack',
    isActive: true,
    config: { webhookUrl: 'https://hooks.slack.com/services/T00/B00/test', channel: '#accounting' },
  }).returning();

  const [tally] = await db.insert(integrations).values({
    tenantId,
    provider: 'tally',
    isActive: false,
    config: { exportFormat: 'xml', tallyVersion: 'prime' },
  }).returning();

  // Logs for Razorpay
  await db.insert(integrationLogs).values([
    {
      tenantId, integrationId: razorpay.id,
      action: 'fetch_settlements', status: 'success',
      message: 'Fetched 12 settlements for March 2026',
      metadata: { count: 12, fromDate: '2026-03-01', toDate: '2026-03-31' },
    },
    {
      tenantId, integrationId: razorpay.id,
      action: 'fetch_settlements', status: 'success',
      message: 'Fetched 8 settlements for February 2026',
      metadata: { count: 8, fromDate: '2026-02-01', toDate: '2026-02-28' },
    },
    {
      tenantId, integrationId: razorpay.id,
      action: 'fetch_payouts', status: 'failure',
      message: 'API rate limit exceeded. Retry after 60s.',
      metadata: { httpStatus: 429 },
    },
  ]);

  // Logs for Slack
  await db.insert(integrationLogs).values({
    tenantId, integrationId: slack.id,
    action: 'send_notification', status: 'success',
    message: 'Payment approval notification sent to #accounting',
    metadata: { messageType: 'payment_approval' },
  });

  return { razorpay, slack, tally };
}

// ---------------------------------------------------------------------------
// GL Journal Entries for Reports (Tests 1-7)
// Creates double-entry postings for all Phase 1-3 invoices + operating costs
// ---------------------------------------------------------------------------

type AccountMap = Record<string, string>; // code -> id

async function getAccountMap(db: Db, tenantId: string): Promise<AccountMap> {
  const rows = await db.select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId));
  const map: AccountMap = {};
  for (const r of rows) map[r.code] = r.id;
  return map;
}

async function seedJournalEntries(
  db: Db, tenantId: string, userId: string,
) {
  // Check if we already have more than the 1 test entry
  const existing = await db.select({ id: journalEntries.id })
    .from(journalEntries)
    .where(eq(journalEntries.tenantId, tenantId));
  if (existing.length > 5) {
    console.log('  Journal entries already seeded, skipping...');
    return 0;
  }

  const acctMap = await getAccountMap(db, tenantId);
  const a = (code: string) => {
    const id = acctMap[code];
    if (!id) throw new Error(`Account ${code} not found`);
    return id;
  };

  // Fetch sales invoices for revenue entries
  const siRows = await db.select({
    id: salesInvoices.id,
    invoiceNumber: salesInvoices.invoiceNumber,
    invoiceDate: salesInvoices.invoiceDate,
    subtotal: salesInvoices.subtotal,
    taxAmount: salesInvoices.taxAmount,
    totalAmount: salesInvoices.totalAmount,
    status: salesInvoices.status,
  }).from(salesInvoices)
    .where(eq(salesInvoices.tenantId, tenantId));

  // Fetch purchase invoices for expense entries
  const piRows = await db.select({
    id: purchaseInvoices.id,
    invoiceNumber: purchaseInvoices.invoiceNumber,
    invoiceDate: purchaseInvoices.invoiceDate,
    subtotal: purchaseInvoices.subtotal,
    taxAmount: purchaseInvoices.taxAmount,
    totalAmount: purchaseInvoices.totalAmount,
    tdsSection: purchaseInvoices.tdsSection,
    tdsAmount: purchaseInvoices.tdsAmount,
    status: purchaseInvoices.status,
  }).from(purchaseInvoices)
    .where(eq(purchaseInvoices.tenantId, tenantId));

  let entryNum = 100; // start after any manual entries

  // --- Sales Invoice JEs: Dr Accounts Receivable, Cr Sales Revenue, Cr GST Payable ---
  for (const si of siRows) {
    if (si.status === 'draft') continue; // only posted invoices
    const subtotal = Number(si.subtotal);
    const tax = Number(si.taxAmount);
    const total = Number(si.totalAmount);

    entryNum++;
    const [je] = await db.insert(journalEntries).values({
      tenantId,
      entryNumber: `JE-${entryNum}`,
      date: si.invoiceDate,
      description: `Sales: ${si.invoiceNumber}`,
      status: 'posted',
      sourceType: 'sales_invoice',
      sourceId: si.id,
      totalDebit: String(total),
      totalCredit: String(total),
      createdBy: userId,
    }).returning({ id: journalEntries.id });

    const lines = [
      { tenantId, journalEntryId: je.id, accountId: a('1103'), debit: String(total), credit: '0', description: `AR: ${si.invoiceNumber}` },
      { tenantId, journalEntryId: je.id, accountId: a('4001'), debit: '0', credit: String(subtotal), description: `Revenue: ${si.invoiceNumber}` },
    ];
    if (tax > 0) {
      lines.push({ tenantId, journalEntryId: je.id, accountId: a('2103'), debit: '0', credit: String(tax), description: `GST: ${si.invoiceNumber}` });
    }
    await db.insert(journalLines).values(lines);
  }

  // Expense account mapping by vendor invoice prefix
  const expenseAccountMap: Record<string, string> = {
    'FF': '5001',  // Fresh Farms → COGS
    'PWI': '5002', // Packwell → Purchase Expenses
    'SL': '5006',  // Swift Logistics → Transport
    'SA': '5009',  // Sharma & Associates → Misc (professional fees)
    'RT': '5004',  // Realty Trust → Rent
  };

  // --- Purchase Invoice JEs: Dr Expense, Dr GST Input (as asset), Cr Accounts Payable ---
  for (const pi of piRows) {
    if (pi.status === 'draft') continue;
    const subtotal = Number(pi.subtotal);
    const tax = Number(pi.taxAmount);
    const total = Number(pi.totalAmount);
    const tds = Number(pi.tdsAmount || 0);

    const prefix = pi.invoiceNumber.split('-')[0];
    const expCode = expenseAccountMap[prefix] || '5009';

    entryNum++;
    const [je] = await db.insert(journalEntries).values({
      tenantId,
      entryNumber: `JE-${entryNum}`,
      date: pi.invoiceDate,
      description: `Purchase: ${pi.invoiceNumber}`,
      status: 'posted',
      sourceType: 'purchase_invoice',
      sourceId: pi.id,
      totalDebit: String(total),
      totalCredit: String(total),
      createdBy: userId,
    }).returning({ id: journalEntries.id });

    const payableAmount = total - tds;
    const lines = [
      { tenantId, journalEntryId: je.id, accountId: a(expCode), debit: String(subtotal), credit: '0', description: `Expense: ${pi.invoiceNumber}` },
    ];
    if (tax > 0) {
      // Input GST goes to a receivable-like account; for simplicity use same GST payable (net)
      lines.push({ tenantId, journalEntryId: je.id, accountId: a('2103'), debit: String(tax), credit: '0', description: `GST Input: ${pi.invoiceNumber}` });
    }
    lines.push({ tenantId, journalEntryId: je.id, accountId: a('2101'), debit: '0', credit: String(payableAmount), description: `AP: ${pi.invoiceNumber}` });
    if (tds > 0) {
      lines.push({ tenantId, journalEntryId: je.id, accountId: a('2104'), debit: '0', credit: String(tds), description: `TDS: ${pi.invoiceNumber}` });
    }
    await db.insert(journalLines).values(lines);
  }

  // --- Operating JEs: Salaries (Jan-Mar), Bank charges ---
  const salaryEntries = [
    { date: '2026-01-28', desc: 'Salary - January 2026', amount: 150000 },
    { date: '2026-02-25', desc: 'Salary - February 2026', amount: 150000 },
    { date: '2026-03-22', desc: 'Salary - March 2026', amount: 150000 },
  ];
  for (const sal of salaryEntries) {
    entryNum++;
    const [je] = await db.insert(journalEntries).values({
      tenantId,
      entryNumber: `JE-${entryNum}`,
      date: sal.date,
      description: sal.desc,
      status: 'posted',
      sourceType: 'manual',
      totalDebit: String(sal.amount),
      totalCredit: String(sal.amount),
      createdBy: userId,
    }).returning({ id: journalEntries.id });

    await db.insert(journalLines).values([
      { tenantId, journalEntryId: je.id, accountId: a('5003'), debit: String(sal.amount), credit: '0', description: sal.desc },
      { tenantId, journalEntryId: je.id, accountId: a('1101'), debit: '0', credit: String(sal.amount), description: sal.desc },
    ]);
  }

  // Bank charges
  const bankCharges = [
    { date: '2026-01-30', amount: 750 },
    { date: '2026-02-27', amount: 850 },
    { date: '2026-03-24', amount: 900 },
  ];
  for (const bc of bankCharges) {
    entryNum++;
    const [je] = await db.insert(journalEntries).values({
      tenantId,
      entryNumber: `JE-${entryNum}`,
      date: bc.date,
      description: `Bank charges - ${bc.date}`,
      status: 'posted',
      sourceType: 'manual',
      totalDebit: String(bc.amount),
      totalCredit: String(bc.amount),
      createdBy: userId,
    }).returning({ id: journalEntries.id });

    await db.insert(journalLines).values([
      { tenantId, journalEntryId: je.id, accountId: a('5007'), debit: String(bc.amount), credit: '0' },
      { tenantId, journalEntryId: je.id, accountId: a('1101'), debit: '0', credit: String(bc.amount) },
    ]);
  }

  // Payment receipts: Dr Bank, Cr AR
  const receiptJEs = [
    { date: '2026-01-05', amount: 126000, ref: 'Fresh Dairy Mart' },
    { date: '2026-01-10', amount: 96600, ref: 'Bangalore Dairy Hub' },
    { date: '2026-01-15', amount: 78750, ref: 'Chennai Milk Depot' },
    { date: '2026-01-20', amount: 110250, ref: 'Delhi Dairy Distributors' },
    { date: '2026-01-25', amount: 65100, ref: 'Fresh Dairy Mart' },
    { date: '2026-02-03', amount: 131250, ref: 'Fresh Dairy Mart' },
    { date: '2026-02-08', amount: 89250, ref: 'Bangalore Dairy Hub' },
    { date: '2026-02-12', amount: 44100, ref: 'Chennai Milk Depot' },
    { date: '2026-02-18', amount: 105000, ref: 'Delhi Dairy Distributors' },
    { date: '2026-02-22', amount: 54600, ref: 'Fresh Dairy Mart' },
    { date: '2026-03-02', amount: 141750, ref: 'Fresh Dairy Mart' },
    { date: '2026-03-07', amount: 56700, ref: 'Bangalore Dairy Hub' },
    { date: '2026-03-10', amount: 51660, ref: 'Chennai Milk Depot' },
    { date: '2026-03-12', amount: 45000, ref: 'Fresh Dairy Mart' },
    { date: '2026-03-18', amount: 42840, ref: 'Fresh Dairy Mart' },
  ];
  for (const r of receiptJEs) {
    entryNum++;
    const [je] = await db.insert(journalEntries).values({
      tenantId,
      entryNumber: `JE-${entryNum}`,
      date: r.date,
      description: `Receipt from ${r.ref}`,
      status: 'posted',
      sourceType: 'receipt',
      totalDebit: String(r.amount),
      totalCredit: String(r.amount),
      createdBy: userId,
    }).returning({ id: journalEntries.id });

    await db.insert(journalLines).values([
      { tenantId, journalEntryId: je.id, accountId: a('1101'), debit: String(r.amount), credit: '0' },
      { tenantId, journalEntryId: je.id, accountId: a('1103'), debit: '0', credit: String(r.amount) },
    ]);
  }

  // Vendor payments: Dr AP, Cr Bank
  const paymentJEs = [
    { date: '2026-01-07', amount: 65000, ref: 'Fresh Farms' },
    { date: '2026-01-12', amount: 29500, ref: 'Packwell Industries' },
    { date: '2026-01-14', amount: 12600, ref: 'Swift Logistics' },
    { date: '2026-01-18', amount: 37450, ref: 'Realty Trust' },
    { date: '2026-02-05', amount: 78000, ref: 'Fresh Farms' },
    { date: '2026-02-10', amount: 16520, ref: 'Packwell Industries' },
    { date: '2026-02-13', amount: 4988, ref: 'Swift Logistics' },
    { date: '2026-02-17', amount: 37450, ref: 'Realty Trust' },
    { date: '2026-02-20', amount: 79650, ref: 'Sharma & Associates' },
    { date: '2026-03-03', amount: 98000, ref: 'Fresh Farms' },
  ];
  for (const p of paymentJEs) {
    entryNum++;
    const [je] = await db.insert(journalEntries).values({
      tenantId,
      entryNumber: `JE-${entryNum}`,
      date: p.date,
      description: `Payment to ${p.ref}`,
      status: 'posted',
      sourceType: 'payment',
      totalDebit: String(p.amount),
      totalCredit: String(p.amount),
      createdBy: userId,
    }).returning({ id: journalEntries.id });

    await db.insert(journalLines).values([
      { tenantId, journalEntryId: je.id, accountId: a('2101'), debit: String(p.amount), credit: '0' },
      { tenantId, journalEntryId: je.id, accountId: a('1101'), debit: '0', credit: String(p.amount) },
    ]);
  }

  return entryNum - 100;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function seedPhase4Data(db: Db, tenantId: string) {
  console.log('Seeding Phase 4 test data...');

  // Fetch existing user and vendor/invoice IDs from Phase 1-3
  const [adminUser] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(1);

  if (!adminUser) {
    console.error('No user found — run base seed first.');
    return;
  }
  const userId = adminUser.id;

  const vendorRows = await db.select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.tenantId, tenantId));
  const vendorIds = vendorRows.map((v) => v.id);

  const piRows = await db.select({ id: purchaseInvoices.id })
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.tenantId, tenantId));
  const piIds = piRows.map((p) => p.id);

  if (vendorIds.length < 5 || piIds.length < 15) {
    console.error(`Need Phase 1-3 data first (vendors: ${vendorIds.length}, PIs: ${piIds.length}). Run with --vrindavan first.`);
    return;
  }

  // GL Journal Entries for reports
  const jeCount = await seedJournalEntries(db, tenantId, userId);
  console.log(`  Journal entries: ${jeCount}`);

  // Seed in dependency order
  const fps = await seedFiscalPeriods(db, tenantId, userId);
  console.log(`  Fiscal periods: ${fps.length}`);

  const widgets = await seedDashboardWidgets(db, tenantId, userId);
  console.log(`  Dashboard widgets: ${widgets.length}`);

  const reports = await seedScheduledReports(db, tenantId, userId);
  console.log(`  Scheduled reports: ${reports.length}`);

  await seedWorkflows(db, tenantId, userId, piIds);
  console.log('  Workflows, comments, tasks, activity log: done');

  const schedules = await seedPaymentSchedules(db, tenantId, userId, vendorIds, piIds);
  console.log(`  Payment schedules: ${schedules.length}`);

  const prs = await seedPurchaseRequisitions(db, tenantId, userId, vendorIds);
  console.log(`  Purchase requisitions: ${prs.length}`);

  const ratings = await seedVendorRatings(db, tenantId, userId, vendorIds);
  console.log(`  Vendor ratings: ${ratings.length}`);

  const contracts = await seedVendorContracts(db, tenantId, vendorIds);
  console.log(`  Vendor contracts: ${contracts.length}`);

  await seedIntegrations(db, tenantId);
  console.log('  Integrations + logs: done');

  console.log('Phase 4 seed complete.');
}

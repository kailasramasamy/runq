/**
 * Static recipe + JTBD content for /help.
 *
 * Recipes are step-by-step walkthroughs. Per-user progress is fetched from
 * the API (see use-help.ts). Screenshot specs render via
 * components/help/recipe-screenshot.tsx — a templated mock that uses the
 * real NAV_GROUPS sidebar, with `active` matching a real nav item label.
 */

export type Tone = 'emerald' | 'blue' | 'violet' | 'amber' | 'rose' | 'indigo';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type ViewKind =
  | 'list'
  | 'form'
  | 'totals'
  | 'send'
  | 'import'
  | 'checklist'
  | 'wizard';

export interface ScreenshotSpec {
  /** Optional informal grouping (e.g., "Money in") — only used in preview footer. */
  section?: string;
  /** Sidebar item label that's active — must match a NAV_GROUPS item.label. */
  active: string;
  /** Page title shown at top of the content area */
  title: string;
  view: ViewKind;
  /** Element label that the step is pointing at (highlighted) */
  hint: string;
  subtitle?: string;
  /** Column / field labels — used by list and form views */
  fields?: string[];
  rows?: Array<Record<string, string>>;
  /** For totals/checklist/wizard views */
  bullets?: string[];
}

export interface RecipeStep {
  title: string;
  body: string;
  screenshot?: ScreenshotSpec | null;
}

/** Which app module a piece of help content belongs to. */
export type ModuleKey = 'finance' | 'hr';

export interface Recipe {
  id: string;
  module: ModuleKey;
  jobId: string;
  title: string;
  summary: string;
  minutes: number;
  difficulty: Difficulty;
  steps: RecipeStep[];
}

export interface Job {
  id: string;
  module: ModuleKey;
  title: string;
  description: string;
  icon:
    | 'trending-up' | 'send' | 'check-circle-2'
    | 'settings-2' | 'file-output' | 'sparkles'
    | 'users' | 'calendar-check' | 'landmark';
  accent: Tone;
  recipes: string[];
}

export interface QuickLink {
  module: ModuleKey;
  label: string;
  icon: string;
}

export interface ChangelogItem {
  module: ModuleKey;
  date: string;
  title: string;
  body: string;
}

const FINANCE_JOBS: Omit<Job, 'module'>[] = [
  {
    id: 'get_paid',
    title: 'Get paid faster',
    description: 'Send invoices, chase overdue customers, and reconcile receipts.',
    icon: 'trending-up',
    accent: 'emerald',
    recipes: ['rec_create_invoice', 'rec_record_payment', 'rec_view_aging', 'rec_dunning'],
  },
  {
    id: 'pay_vendors',
    title: 'Pay vendors',
    description: 'Enter bills, run approvals, schedule payments and TDS.',
    icon: 'send',
    accent: 'blue',
    recipes: ['rec_enter_bill', 'rec_pay_vendor', 'rec_pay_run'],
  },
  {
    id: 'close_month',
    title: 'Close the month',
    description: 'Bank reconciliation, GST returns, and your monthly checklist.',
    icon: 'check-circle-2',
    accent: 'violet',
    recipes: ['rec_reconcile_bank', 'rec_gst_filing', 'rec_month_close'],
  },
  {
    id: 'setup',
    title: 'Set up runQ',
    description: 'Company info, customers, vendors, and item masters.',
    icon: 'settings-2',
    accent: 'amber',
    recipes: ['rec_setup_company', 'rec_add_customer', 'rec_add_vendor'],
  },
  {
    id: 'ca_handoff',
    title: 'Hand off to your CA',
    description: 'Tally export, audit trail, and shareable reports.',
    icon: 'file-output',
    accent: 'rose',
    recipes: ['rec_tally_export'],
  },
  {
    id: 'automate',
    title: 'Automate everything',
    description: 'Recurring invoices, auto-reminders, and AI document inbox.',
    icon: 'sparkles',
    accent: 'indigo',
    recipes: ['rec_recurring', 'rec_inbox_ai'],
  },
];

// Real column headers, copied from the live admin pages.
const COLS = {
  invoices: ['Invoice #', 'Customer', 'Issued', 'Due', 'Total', 'Status'],
  bills: ['Bill #', 'Vendor', 'Issued', 'Due', 'Total', 'Status'],
  receipts: ['Date', 'Customer', 'Method', 'Reference', 'Amount'],
  customers: ['Name', 'Type', 'Contact', 'Terms', 'Outstanding', 'Status'],
  vendors: ['Name', 'Category', 'Contact', 'Location', 'Terms', 'Status'],
  payRunQueue: ['Vendor', 'Bill #', 'Due', 'Total', 'Balance'],
  payRuns: ['Run ID', 'Source', 'Count', 'Total', 'Status'],
  bankRecon: ['Date', 'Narration', 'Reference', 'Amount', 'Match'],
  gstReturns: ['Period', 'Type', 'Status', 'ARN', 'Filed at'],
};

const FINANCE_RECIPES: Omit<Recipe, 'module'>[] = [
  // ── Get paid faster ────────────────────────────────────────────────────
  {
    id: 'rec_create_invoice',
    jobId: 'get_paid',
    title: 'Create your first invoice',
    summary: 'Issue a tax invoice from a sales order or scratch.',
    minutes: 4,
    difficulty: 'Easy',
    steps: [
      { title: 'Open the Invoices module', body: 'From the sidebar, go to **Money in → Invoices**. Click **New invoice** in the top right.',
        screenshot: { active: 'Invoices', title: 'Invoices', subtitle: '128 invoices · ₹42.6L outstanding', view: 'list', hint: '+ New invoice', fields: COLS.invoices } },
      { title: 'Pick a customer', body: 'Search by name or GSTIN. If they\'re new, click **+ Add new customer** inline.',
        screenshot: { active: 'Invoices', title: 'New invoice', view: 'form', hint: 'Customer', fields: ['Customer', 'Invoice number', 'Invoice date', 'Due date', 'Place of supply'] } },
      { title: 'Add line items', body: 'Pick items from your catalog or add a custom line. GST is auto-calculated based on the place of supply.',
        screenshot: { active: 'Invoices', title: 'New invoice — line items', view: 'totals', hint: 'Add line', fields: ['Item', 'Qty', 'Rate', 'GST', 'Amount'] } },
      { title: 'Review tax & totals', body: 'Check CGST/SGST/IGST splits at the bottom. runQ flags missing HSN codes.',
        screenshot: { active: 'Invoices', title: 'New invoice — tax & totals', view: 'totals', hint: 'Total ₹1,47,640', bullets: ['Subtotal · ₹1,26,400', 'CGST (9%) · ₹10,620', 'SGST (9%) · ₹10,620'] } },
      { title: 'Send & track', body: 'Click **Save & send**. The invoice is emailed; payment status updates as receipts come in.',
        screenshot: { active: 'Invoices', title: 'New invoice — send', view: 'send', hint: 'Save & send', fields: ['Email to', 'Subject'] } },
    ],
  },
  {
    id: 'rec_record_payment',
    jobId: 'get_paid',
    title: 'Record a customer payment',
    summary: 'Match a UPI/NEFT receipt to one or more invoices.',
    minutes: 3,
    difficulty: 'Easy',
    steps: [
      { title: 'Go to Receipts', body: '**Money in → Receipts → New receipt**.',
        screenshot: { active: 'Receipts', title: 'Receipts', subtitle: '48 receipts this month', view: 'list', hint: '+ New receipt', fields: COLS.receipts } },
      { title: 'Select the customer', body: 'runQ shows their open invoices, oldest first.',
        screenshot: { active: 'Receipts', title: 'New receipt', view: 'form', hint: 'Customer', fields: ['Customer', 'Date', 'Method', 'Reference', 'Amount'] } },
      { title: 'Allocate the amount', body: 'Spread across multiple invoices. Partial allocations are fine.',
        screenshot: { active: 'Receipts', title: 'Allocate to invoices', view: 'totals', hint: 'Allocate ₹84,200', bullets: ['INV-2026-0041 · ₹84,200 due', 'INV-2026-0040 · ₹2,46,000 due', 'INV-2026-0039 · ₹56,800 due'] } },
      { title: 'Save', body: 'Receipt is posted and invoices update automatically.',
        screenshot: { active: 'Receipts', title: 'New receipt — confirm', view: 'send', hint: 'Save', fields: ['Allocations', 'Notes'] } },
    ],
  },
  {
    id: 'rec_view_aging',
    jobId: 'get_paid',
    title: 'Read the AR aging report',
    summary: 'Understand who owes you what, by how late.',
    minutes: 5,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Customers', body: 'Aging is built into **Money in → Customers** — the Outstanding column is bucketed by age.',
        screenshot: { active: 'Customers', title: 'Customers', subtitle: '142 customers', view: 'list', hint: 'Outstanding', fields: COLS.customers } },
      { title: 'Read the buckets', body: 'Current / 1–30 / 31–60 / 61–90 / 90+ days overdue. Click any bucket to drill in.',
        screenshot: { active: 'Customers', title: 'Aging buckets', view: 'totals', hint: '90+ days · ₹4.8L', bullets: ['Current · ₹18.4L', '1–30 days · ₹9.6L', '31–60 days · ₹6.2L', '61–90 days · ₹3.6L'] } },
      { title: 'Take action', body: 'Send a reminder, escalate to dunning, or assign for collection — all from the row.',
        screenshot: { active: 'Customers', title: 'Customer detail · 90+ days', view: 'list', hint: 'Send reminder', fields: ['Invoice #', 'Issued', 'Due', 'Total', 'Action'] } },
    ],
  },
  {
    id: 'rec_dunning',
    jobId: 'get_paid',
    title: 'Set up dunning rules',
    summary: 'Auto-chase overdue customers without lifting a finger.',
    minutes: 6,
    difficulty: 'Medium',
    steps: [
      { title: 'Open Collections', body: '**Money in → Collections** opens cases. The **Dunning** sub-tab is where rules live.',
        screenshot: { active: 'Collections', title: 'Collections', subtitle: 'Track follow-ups on overdue invoices.', view: 'list', hint: 'Dunning rules', fields: ['Invoice', 'Customer', 'Assigned to', 'Status', 'Action'] } },
      { title: 'Pick a template', body: 'Soft / Standard / Firm. Each is a 4-touch sequence over 30 days.',
        screenshot: { active: 'Collections', title: 'New dunning rule — template', view: 'wizard', hint: 'Standard', bullets: ['Soft — 3 nudges over 21 days', 'Standard — 4 touches over 30 days', 'Firm — 4 touches + escalation'] } },
      { title: 'Customize timing', body: 'Adjust day offsets and channel (email + SMS).',
        screenshot: { active: 'Collections', title: 'Sequence timing', view: 'form', hint: 'Touch 2', fields: ['Touch 1', 'Touch 2', 'Touch 3', 'Touch 4'] } },
      { title: 'Set guardrails', body: 'Skip VIP customers, pause on dispute, escalate to owner after N days.',
        screenshot: { active: 'Collections', title: 'Guardrails', view: 'checklist', hint: 'Pause on dispute', bullets: ['Skip VIP customers', 'Pause on dispute', 'Escalate after 30 days', 'Stop on partial payment'] } },
      { title: 'Activate', body: 'Toggle **Live**. Watch the Log tab to see what runQ sends.',
        screenshot: { active: 'Collections', title: 'Activate rule', view: 'send', hint: 'Activate', fields: ['Channels', 'Live from'] } },
    ],
  },

  // ── Pay vendors ─────────────────────────────────────────────────────────
  {
    id: 'rec_enter_bill',
    jobId: 'pay_vendors',
    title: 'Enter a vendor bill',
    summary: 'Capture a bill manually or with the AI document inbox.',
    minutes: 3,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Bills', body: '**Money out → Bills → New bill**. Or drop a PDF on the inbox.',
        screenshot: { active: 'Bills', title: 'Bills', subtitle: '34 bills · ₹18.2L outstanding', view: 'list', hint: '+ New bill', fields: COLS.bills } },
      { title: 'Verify AI extraction', body: 'runQ pre-fills vendor, date, GSTIN, line items, GST. Spot-check and correct.',
        screenshot: { active: 'Bills', title: 'New bill — AI extracted', subtitle: '✨ Extracted from invoice.pdf · 92% confidence', view: 'form', hint: 'Vendor GSTIN', fields: ['Vendor', 'Bill number', 'Bill date', 'Vendor GSTIN', 'Total'] } },
      { title: 'Match to PO/GRN', body: 'If linked to a PO, runQ shows a 3-way match panel. Resolve any variance.',
        screenshot: { active: 'Bills', title: 'New bill — 3-way match', view: 'totals', hint: 'Variance ₹420', bullets: ['PO total · ₹1,18,000', 'GRN received · ₹1,18,000', 'Bill amount · ₹1,18,420'] } },
      { title: 'Send for approval', body: 'Pick an approval chain. Bill moves to **Pending approval**.',
        screenshot: { active: 'Bills', title: 'Send for approval', view: 'send', hint: 'Send for approval', fields: ['Approval chain', 'Notes'] } },
    ],
  },
  {
    id: 'rec_pay_vendor',
    jobId: 'pay_vendors',
    title: 'Pay a vendor bill',
    summary: 'Schedule a payment, deduct TDS, and post the entry.',
    minutes: 4,
    difficulty: 'Medium',
    steps: [
      { title: 'Open the bill', body: 'From **Bills**, pick an approved bill that\'s due.',
        screenshot: { active: 'Bills', title: 'Bills · Approved', view: 'list', hint: 'BILL-2026-0117', fields: COLS.bills } },
      { title: 'Click Pay now', body: 'Choose payment account (bank). runQ pre-selects the account with sufficient balance.',
        screenshot: { active: 'Bills', title: 'Bill detail · Pay now', view: 'form', hint: 'Bank account', fields: ['Bank account', 'Pay date', 'Method', 'Reference'] } },
      { title: 'Confirm TDS', body: 'If applicable, runQ auto-deducts the right TDS section. You can override.',
        screenshot: { active: 'Bills', title: 'TDS deduction', view: 'totals', hint: 'TDS 2% · 194C', bullets: ['Bill amount · ₹1,18,000', 'TDS deduction · ₹2,360', 'Net payable · ₹1,15,640'] } },
      { title: 'Schedule or pay', body: 'Pay today, or schedule for the due date. Confirm and post.',
        screenshot: { active: 'Bills', title: 'Confirm payment', view: 'send', hint: 'Pay now', fields: ['Pay date', 'Amount', 'Remitter'] } },
    ],
  },
  {
    id: 'rec_pay_run',
    jobId: 'pay_vendors',
    title: 'Run a weekly pay run',
    summary: 'Pay 50 vendors at once with one bank file.',
    minutes: 7,
    difficulty: 'Medium',
    steps: [
      { title: 'New pay run', body: '**Money out → Pay runs → New run**. Pick a window (e.g., next 7 days).',
        screenshot: { active: 'Pay runs', title: 'Pay runs', view: 'list', hint: '+ New run', fields: COLS.payRuns } },
      { title: 'Review the queue', body: 'runQ proposes bills to pay. Toggle any off if needed.',
        screenshot: { active: 'Pay runs', title: 'New pay run — queue', subtitle: '52 bills · ₹38.4L', view: 'list', hint: 'STELLAR-2026-0042', fields: COLS.payRunQueue } },
      { title: 'Approve', body: 'Send to approver(s). Once approved, generate the bank file.',
        screenshot: { active: 'Pay runs', title: 'Send for approval', view: 'send', hint: 'Send for approval', fields: ['Approver', 'Notes'] } },
      { title: 'Upload to bank', body: 'Download the NEFT/RTGS batch file and upload to your bank portal.',
        screenshot: { active: 'Pay runs', title: 'Pay run · Approved', view: 'send', hint: 'Download .csv', fields: ['Format', 'Bank'] } },
      { title: 'Reconcile', body: 'Once the bank acks, runQ marks each bill as Paid.',
        screenshot: { active: 'Pay runs', title: 'Pay run · Posted', view: 'checklist', hint: 'All bills Paid', bullets: ['52 bills · ₹38.4L paid', 'Bank ref BNK-7842 attached', 'Audit trail locked'] } },
    ],
  },

  // ── Close the month ─────────────────────────────────────────────────────
  {
    id: 'rec_reconcile_bank',
    jobId: 'close_month',
    title: 'Reconcile your bank statement',
    summary: 'Match statement lines to invoices, bills, and journals.',
    minutes: 8,
    difficulty: 'Medium',
    steps: [
      { title: 'Open Banking', body: '**Books → Banking**. Pick an account and click **Reconcile**.',
        screenshot: { active: 'Banking', title: 'Banking', subtitle: 'Match bank transactions to payments and receipts.', view: 'list', hint: 'Reconcile', fields: ['Bank', 'Account', 'Last reconciled', 'Balance', 'Status'] } },
      { title: 'Import statement', body: 'Upload CSV/MT940, or connect via account aggregator.',
        screenshot: { active: 'Banking', title: 'Import statement', view: 'import', hint: 'Drop CSV / MT940', fields: ['Bank account', 'Statement period'] } },
      { title: 'Auto-match', body: 'runQ matches what it can. Confidence is shown per row.',
        screenshot: { active: 'Banking', title: 'Reconciliation · Bank lines', subtitle: '184 lines · 162 auto-matched', view: 'list', hint: '92% confidence', fields: COLS.bankRecon } },
      { title: 'Resolve unmatched', body: 'Match manually, split, or create a new entry. Use bulk actions for repetitive items.',
        screenshot: { active: 'Banking', title: 'Reconciliation · Unmatched', subtitle: '22 to resolve', view: 'list', hint: 'Match to bill', fields: COLS.bankRecon } },
      { title: 'Close', body: 'All matched → click **Close period**. Audit trail is locked.',
        screenshot: { active: 'Banking', title: 'Close reconciliation', view: 'send', hint: 'Close period', fields: ['Period', 'Closing balance'] } },
    ],
  },
  {
    id: 'rec_gst_filing',
    jobId: 'close_month',
    title: 'File GSTR-1 & GSTR-3B',
    summary: 'Run readiness checks, generate, and file.',
    minutes: 10,
    difficulty: 'Medium',
    steps: [
      { title: 'Open GST readiness', body: '**Compliance → GST readiness**. Pick the period.',
        screenshot: { active: 'GST readiness', title: 'GST readiness', subtitle: 'April 2026 · 6 flags to resolve', view: 'wizard', hint: 'April 2026', bullets: ['Period · April 2026', 'GSTIN · 27ABCDE1234F1Z5', 'Status · 6 flags to resolve'] } },
      { title: 'Resolve flags', body: 'Missing HSN, invalid GSTINs, place-of-supply mismatches. Click each to fix.',
        screenshot: { active: 'GST readiness', title: 'Readiness flags', view: 'checklist', hint: 'Missing HSN — 4 invoices', bullets: ['Missing HSN — 4 invoices', 'Invalid GSTIN — 1 customer', 'PoS mismatch — 2 invoices'] } },
      { title: 'Generate GSTR-1', body: 'runQ builds the JSON. Preview and download.',
        screenshot: { active: 'GST readiness', title: 'GSTR-1 preview', view: 'totals', hint: 'Download JSON', bullets: ['B2B · 184 invoices · ₹62.4L', 'B2C · 41 invoices · ₹2.8L', 'Credit notes · 3 · ₹46K'] } },
      { title: 'File via portal', body: 'Generate from **GST returns** or upload JSON to GSTN portal and sign with EVC/DSC.',
        screenshot: { active: 'GST returns', title: 'GST returns', view: 'list', hint: 'File GSTR-1', fields: COLS.gstReturns } },
      { title: 'Generate & file 3B', body: 'Same flow, with ITC reconciliation step.',
        screenshot: { active: 'GST readiness', title: 'GSTR-3B summary', view: 'totals', hint: 'Net payable ₹62,420', bullets: ['Output tax · ₹3,42,420', 'ITC available · ₹2,80,000', 'Net payable · ₹62,420'] } },
    ],
  },
  {
    id: 'rec_month_close',
    jobId: 'close_month',
    title: 'Run the month-close checklist',
    summary: '9 checks before locking the books.',
    minutes: 12,
    difficulty: 'Hard',
    steps: [
      { title: 'Open Reports → Fiscal Periods', body: '**Books → Reports → Fiscal Periods**. Pick the month to close.',
        screenshot: { active: 'Reports', title: 'Fiscal Periods', subtitle: 'Manage accounting periods. Close or lock periods to prevent changes.', view: 'list', hint: 'April 2026', fields: ['Period', 'Status', 'Last activity', 'Locked at'] } },
      { title: 'Run the checklist', body: '9 items: bank reconciled, AR aged, AP cleared, GST filed, etc.',
        screenshot: { active: 'Reports', title: 'Close checklist', view: 'checklist', hint: 'Bank reconciled', bullets: ['Bank reconciled', 'AR aging exported', 'AP cleared', 'GST filed', 'Depreciation posted', 'Forex revalued'] } },
      { title: 'Resolve flags', body: 'Each unchecked item links to where to fix it.',
        screenshot: { active: 'Reports', title: 'Flagged items', view: 'checklist', hint: 'GST filing pending — go to Compliance', bullets: ['GST filing pending — go to Compliance', '2 unmatched bank lines — go to Banking'] } },
      { title: 'Lock', body: 'All green → **Lock period**. Posting is disabled below this date.',
        screenshot: { active: 'Reports', title: 'Lock period', view: 'send', hint: 'Lock April 2026', fields: ['Period', 'Locked by', 'Locked at'] } },
    ],
  },

  // ── Set up runQ ─────────────────────────────────────────────────────────
  {
    id: 'rec_setup_company',
    jobId: 'setup',
    title: 'Set up your company',
    summary: 'Add your GSTIN, FY, branding, and bank accounts.',
    minutes: 5,
    difficulty: 'Easy',
    steps: [
      { title: 'Company info', body: '**Setup → Settings → Company**. Add legal name, PAN, GSTIN.',
        screenshot: { active: 'Settings', title: 'Settings · Company', subtitle: 'Configure your company, users, integrations, imports, and notifications.', view: 'form', hint: 'GSTIN', fields: ['Legal name', 'PAN', 'GSTIN', 'Address'] } },
      { title: 'Financial year', body: 'April–March is the default for India.',
        screenshot: { active: 'Settings', title: 'Settings · Financial year', view: 'form', hint: 'Current FY', fields: ['Start month', 'Current FY'] } },
      { title: 'Bank accounts', body: 'Add at least one bank for receipts/payments via **Books → Banking**.',
        screenshot: { active: 'Banking', title: 'Banking', view: 'list', hint: '+ Add account', fields: ['Bank', 'Account', 'Currency', 'Last reconciled', 'Balance'] } },
      { title: 'Invoice numbering', body: 'Set the format INV-{fy}-{seq} from Settings.',
        screenshot: { active: 'Settings', title: 'Settings · Invoice numbering', view: 'form', hint: 'Pattern', fields: ['Prefix', 'Pattern', 'Next number'] } },
    ],
  },
  {
    id: 'rec_add_customer',
    jobId: 'setup',
    title: 'Add a customer',
    summary: 'Capture billing details, GSTIN, and payment terms.',
    minutes: 2,
    difficulty: 'Easy',
    steps: [
      { title: 'New customer', body: '**Money in → Customers → New customer**.',
        screenshot: { active: 'Customers', title: 'Customers', subtitle: '142 customers', view: 'list', hint: '+ New customer', fields: COLS.customers } },
      { title: 'GSTIN lookup', body: 'Type the GSTIN — runQ auto-fills name and address from the GSTN portal.',
        screenshot: { active: 'Customers', title: 'New customer', view: 'form', hint: 'GSTIN auto-fill', fields: ['GSTIN', 'Legal name', 'Address', 'Place of supply'] } },
      { title: 'Save', body: 'Customer is ready to invoice.',
        screenshot: { active: 'Customers', title: 'New customer — confirm', view: 'send', hint: 'Save', fields: ['Payment terms', 'Default GST'] } },
    ],
  },
  {
    id: 'rec_add_vendor',
    jobId: 'setup',
    title: 'Add a vendor',
    summary: 'Capture vendor PAN, GSTIN, TDS section.',
    minutes: 2,
    difficulty: 'Easy',
    steps: [
      { title: 'New vendor', body: '**Money out → Vendors → New vendor**.',
        screenshot: { active: 'Vendors', title: 'Vendors', subtitle: '68 vendors', view: 'list', hint: '+ New vendor', fields: COLS.vendors } },
      { title: 'Fill TDS info', body: 'PAN + applicable TDS section (94C, 94J, 194Q…). runQ uses this on every bill.',
        screenshot: { active: 'Vendors', title: 'New vendor — TDS', view: 'form', hint: 'TDS section', fields: ['PAN', 'GSTIN', 'TDS section', 'TDS rate'] } },
      { title: 'Save', body: 'Vendor is ready.',
        screenshot: { active: 'Vendors', title: 'New vendor — confirm', view: 'send', hint: 'Save', fields: ['Bank account', 'Default GL account'] } },
    ],
  },

  // ── CA handoff ──────────────────────────────────────────────────────────
  {
    id: 'rec_tally_export',
    jobId: 'ca_handoff',
    title: 'Export to Tally',
    summary: 'Send your CA a clean .xml every month.',
    minutes: 4,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Tally Export', body: '**Setup → Settings → Tally Export**.',
        screenshot: { active: 'Settings', title: 'Tally Export', subtitle: 'Export runQ finance data for import into Tally Prime or Tally ERP 9.', view: 'wizard', hint: 'Tally Export', bullets: ['Tally Export', 'Tally Import', 'Bulk import'] } },
      { title: 'Pick the period', body: 'Month, quarter, or custom range.',
        screenshot: { active: 'Settings', title: 'Tally Export — period', view: 'form', hint: 'Period', fields: ['Period', 'Start date', 'End date'] } },
      { title: 'Pick what to export', body: 'All vouchers, masters, or both. Toggle by type.',
        screenshot: { active: 'Settings', title: 'Tally Export — vouchers', view: 'checklist', hint: 'All vouchers', bullets: ['Sales vouchers', 'Purchase vouchers', 'Receipt vouchers', 'Payment vouchers', 'Journal vouchers', 'Contra vouchers'] } },
      { title: 'Download', body: 'XML compatible with Tally Prime. Email or share.',
        screenshot: { active: 'Settings', title: 'Tally Export — generate', view: 'send', hint: 'Download .xml', fields: ['Filename', 'Format', 'Email to'] } },
    ],
  },

  // ── Automate ────────────────────────────────────────────────────────────
  {
    id: 'rec_recurring',
    jobId: 'automate',
    title: 'Set up recurring invoices',
    summary: 'Bill subscription customers automatically every month.',
    minutes: 4,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Invoices', body: '**Money in → Invoices → Recurring tab → New schedule**.',
        screenshot: { active: 'Invoices', title: 'Invoices · Recurring', subtitle: '4 active schedules', view: 'list', hint: '+ New schedule', fields: ['Customer', 'Template', 'Frequency', 'Next run', 'Status'] } },
      { title: 'Pick template', body: 'Use an existing invoice as the template.',
        screenshot: { active: 'Invoices', title: 'New schedule', view: 'form', hint: 'Template', fields: ['Customer', 'Template', 'Amount'] } },
      { title: 'Set frequency', body: 'Monthly / quarterly / custom cron. Pick the next-run date.',
        screenshot: { active: 'Invoices', title: 'New schedule — frequency', view: 'wizard', hint: 'Monthly', bullets: ['Monthly', 'Quarterly', 'Custom (cron)'] } },
      { title: 'Activate', body: 'Toggle **Active**. runQ generates and sends on schedule.',
        screenshot: { active: 'Invoices', title: 'Activate schedule', view: 'send', hint: 'Activate', fields: ['Status', 'Next run'] } },
    ],
  },
  {
    id: 'rec_inbox_ai',
    jobId: 'automate',
    title: 'Use the AI document inbox',
    summary: 'Forward a vendor PDF — runQ extracts everything.',
    minutes: 3,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Bills · Inbox', body: '**Money out → Bills → Inbox tab**. Each tenant has a unique forwarding address.',
        screenshot: { active: 'Bills', title: 'Bills · Document inbox', subtitle: '12 pending review', view: 'list', hint: 'Review', fields: ['Source', 'Vendor', 'Total', 'Confidence', 'Status'] } },
      { title: 'Drop a PDF or forward email', body: 'Drag the PDF in, or forward to your inbox address.',
        screenshot: { active: 'Bills', title: 'Add a document', view: 'import', hint: 'Drop PDF or forward', fields: ['Forward to', 'Or upload'] } },
      { title: 'Review extraction', body: 'Vendor, date, GSTIN, line items, GST — all pre-filled. Spot-check.',
        screenshot: { active: 'Bills', title: 'Inbox · review', subtitle: '✨ 92% confidence', view: 'form', hint: 'Vendor', fields: ['Vendor', 'Bill date', 'GSTIN', 'Total'] } },
      { title: 'Convert to bill', body: 'One click to post as a draft bill.',
        screenshot: { active: 'Bills', title: 'Post as draft bill', view: 'send', hint: 'Convert to bill', fields: ['GL account', 'Approval chain'] } },
    ],
  },
];

const FINANCE_QUICK_LINKS: Omit<QuickLink, 'module'>[] = [
  { label: 'How do I issue a credit note?', icon: 'file-minus' },
  { label: 'Why is my GSTR-1 mismatched?', icon: 'alert-triangle' },
  { label: 'How does TDS auto-deduction work?', icon: 'scissors' },
  { label: 'Set up recurring invoices', icon: 'repeat' },
  { label: 'Bulk import from Tally', icon: 'upload' },
  { label: 'Connect my bank via account aggregator', icon: 'landmark' },
];

const FINANCE_WHATS_NEW: Omit<ChangelogItem, 'module'>[] = [
  { date: 'May 4, 2026', title: 'Pay runs are 3x faster', body: 'Bulk approval and parallel posting cut a 50-bill run from 4 minutes to under 90 seconds.' },
  { date: 'Apr 28, 2026', title: 'AI document inbox', body: 'Drop a PDF — runQ extracts vendor, date, GST, line items, and links to a PO.' },
  { date: 'Apr 22, 2026', title: 'GSTR-2B reconciliation', body: 'ITC mismatches surface inline on each bill, with one-click resolution.' },
];

// ── HR & Payroll content ─────────────────────────────────────────────────

const HR_JOBS: Omit<Job, 'module'>[] = [
  {
    id: 'hr_onboard',
    title: 'Onboard your team',
    description: 'Add employees, departments, and their salary structures.',
    icon: 'users',
    accent: 'emerald',
    recipes: ['rec_hr_add_employee', 'rec_hr_salary_structure', 'rec_hr_assign_salary'],
  },
  {
    id: 'hr_payroll',
    title: 'Run payroll',
    description: 'Track attendance and leave, then process the monthly pay run.',
    icon: 'calendar-check',
    accent: 'blue',
    recipes: ['rec_hr_attendance', 'rec_hr_leave', 'rec_hr_payroll_run'],
  },
  {
    id: 'hr_compliance',
    title: 'Stay compliant',
    description: 'PF, ESI, PT challans, quarterly Form 24Q, and annual Form 16.',
    icon: 'landmark',
    accent: 'violet',
    recipes: ['rec_hr_pf_esi', 'rec_hr_pt', 'rec_hr_tds_challan', 'rec_hr_form_24q', 'rec_hr_form_16'],
  },
  {
    id: 'hr_setup',
    title: 'Set up HR',
    description: 'Statutory registration IDs and salary component masters.',
    icon: 'settings-2',
    accent: 'amber',
    recipes: ['rec_hr_statutory_setup'],
  },
];

const HR_RECIPES: Omit<Recipe, 'module'>[] = [
  // ── Onboard your team ──────────────────────────────────────────────────
  {
    id: 'rec_hr_add_employee',
    jobId: 'hr_onboard',
    title: 'Add an employee',
    summary: 'Create an employee record with personal, statutory, and bank details.',
    minutes: 5,
    difficulty: 'Easy',
    steps: [
      { title: 'Open the Employees module', body: 'From the HR sidebar, go to **Employees** and click **New employee**.' },
      { title: 'Enter personal details', body: 'Name, date of birth, **gender** (drives Professional Tax slabs in some states), contact, and address.' },
      { title: 'Set employment details', body: 'Joining date, department, designation, and employment type — permanent, contract, intern, or wage.' },
      { title: 'Add statutory & bank details', body: 'PAN, Aadhaar, UAN, PF and ESI numbers, plus bank account and IFSC for salary payouts.' },
      { title: 'Save', body: 'Save the record. The employee now appears in payroll runs once you assign them a salary.' },
    ],
  },
  {
    id: 'rec_hr_salary_structure',
    jobId: 'hr_onboard',
    title: 'Build a salary structure',
    summary: 'Define reusable earning and deduction components.',
    minutes: 6,
    difficulty: 'Medium',
    steps: [
      { title: 'Open Salary structures', body: 'In the HR sidebar under Payroll, open **Salary structures** and click **New structure**.' },
      { title: 'Add earning components', body: 'Add Basic, HRA, and allowances. Each component is fixed, a percent of basic, or a percent of CTC.' },
      { title: 'Mark statutory applicability', body: 'Flag which components are **PF-applicable** and **ESI-applicable** — this drives the statutory calculations.' },
      { title: 'Save the structure', body: 'Save it. You can now assign this structure to employees when you set their salary.' },
    ],
  },
  {
    id: 'rec_hr_assign_salary',
    jobId: 'hr_onboard',
    title: 'Assign a salary to an employee',
    summary: 'Attach a CTC and structure to an employee, effective from a date.',
    minutes: 3,
    difficulty: 'Easy',
    steps: [
      { title: 'Open the employee', body: 'Go to **Employees**, open the employee, and find the **Salary** section.' },
      { title: 'Enter CTC and structure', body: 'Set the annual CTC and pick a salary structure. runQ snapshots the components so later structure edits don\'t rewrite history.' },
      { title: 'Set the effective date', body: 'The assignment applies from this date forward. A mid-year revision is just a new assignment with a later effective date.' },
    ],
  },
  // ── Run payroll ────────────────────────────────────────────────────────
  {
    id: 'rec_hr_attendance',
    jobId: 'hr_payroll',
    title: 'Track attendance',
    summary: 'Mark the daily muster so payroll can pro-rate pay.',
    minutes: 4,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Attendance', body: 'From the HR sidebar, open **Attendance**. Pick the date you want to mark.' },
      { title: 'Mark the muster', body: 'Set each employee Present, Half-day, Absent, or on Leave. Add overtime hours where worked.' },
      { title: 'Understand the payroll link', body: 'If a month has no attendance recorded at all, payroll treats everyone as fully present — so mark days only when you actually track them.' },
    ],
  },
  {
    id: 'rec_hr_leave',
    jobId: 'hr_payroll',
    title: 'Approve a leave request',
    summary: 'Review and action employee leave so balances and payroll stay correct.',
    minutes: 3,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Leave requests', body: 'In the HR sidebar under Leave, open **Leave requests** — pending ones are flagged.' },
      { title: 'Review the request', body: 'Check the leave type, dates, and the employee\'s remaining balance.' },
      { title: 'Approve or reject', body: 'Approving deducts the balance and marks those days as leave in attendance, so payroll pro-rates correctly.' },
    ],
  },
  {
    id: 'rec_hr_payroll_run',
    jobId: 'hr_payroll',
    title: 'Process a monthly payroll run',
    summary: 'Generate payslips for every active employee, then approve and post.',
    minutes: 7,
    difficulty: 'Medium',
    steps: [
      { title: 'Create the run', body: 'Open **Payroll runs**, click **New run**, and pick the month and year.' },
      { title: 'Process', body: 'Click **Process**. runQ computes each payslip — earnings pro-rated by attendance, then PF, ESI, PT, and TDS.' },
      { title: 'Review payslips', body: 'Open individual payslips to check earnings, deductions, and net pay. Re-process if you fix attendance or salary.' },
      { title: 'Approve', body: 'Click **Approve**. This locks the run, posts the payroll journal entry, and makes the TDS challan available.' },
      { title: 'Export for payment', body: 'Download the NEFT CSV to pay salaries, and the PF/ESI/PT challans for statutory deposits.' },
    ],
  },
  // ── Stay compliant ─────────────────────────────────────────────────────
  {
    id: 'rec_hr_pf_esi',
    jobId: 'hr_compliance',
    title: 'File PF & ESI challans',
    summary: 'Generate the EPFO ECR and ESIC return from an approved run.',
    minutes: 5,
    difficulty: 'Medium',
    steps: [
      { title: 'Open the approved run', body: 'Go to **Payroll runs** and open a run that\'s been approved.' },
      { title: 'Review the PF challan', body: 'Click **PF Challan** — runQ rolls up the EPFO account heads (A/c 1, 2, 10, 21). Reconcile against the portal\'s TRRN.' },
      { title: 'Download the ECR', body: 'Use **PF ECR** to download the pipe-delimited file to upload on the EPFO portal.' },
      { title: 'Review and export ESI', body: 'Click **ESI Challan** for the IP-wise totals, then **ESI** to download the ESIC monthly contribution return.' },
      { title: 'Deposit by the 15th', body: 'PF and ESI for a month are both due by the 15th of the next month.' },
    ],
  },
  {
    id: 'rec_hr_pt',
    jobId: 'hr_compliance',
    title: 'Pay Professional Tax',
    summary: 'Generate the state-wise PT challan from a payroll run.',
    minutes: 3,
    difficulty: 'Easy',
    steps: [
      { title: 'Open the run\'s PT challan', body: 'On an approved payroll run, click **PT Challan**. PT is a state levy, so totals are grouped by state.' },
      { title: 'Check the state and amount', body: 'Confirm the establishment\'s state and the total. February usually carries a higher amount in states like Maharashtra.' },
      { title: 'Pay on the state portal', body: 'Download the PT return and pay on your state\'s PT portal by its due date — runQ\'s statutory calendar tracks it.' },
    ],
  },
  {
    id: 'rec_hr_tds_challan',
    jobId: 'hr_compliance',
    title: 'Deposit a TDS challan',
    summary: 'Record the ITNS-281 CIN after depositing salary TDS.',
    minutes: 4,
    difficulty: 'Easy',
    steps: [
      { title: 'Open TDS challans', body: 'From the HR sidebar, open **TDS challans**. Approving a payroll run creates a pending challan automatically.' },
      { title: 'Deposit on the portal', body: 'Pay the TDS via Challan ITNS-281 — due by the 7th of the next month (March by 30 April).' },
      { title: 'Record the CIN', body: 'Click **Record deposit** and enter the BSR code, challan serial number, and deposit date from the counterfoil.' },
      { title: 'Why it matters', body: 'The CIN links each deduction to its challan in Form 24Q — you can\'t file the quarterly return without it.' },
    ],
  },
  {
    id: 'rec_hr_form_24q',
    jobId: 'hr_compliance',
    title: 'Generate Form 24Q',
    summary: 'Build, validate, and download the quarterly TDS return.',
    minutes: 6,
    difficulty: 'Medium',
    steps: [
      { title: 'Generate the quarter', body: 'Open **Form 24Q**, click **Generate return**, and pick the financial year and quarter.' },
      { title: 'Review the annexures', body: 'Annexure I is the deductee-wise detail (every quarter); Annexure II — the annual salary computation — is added in Q4.' },
      { title: 'Validate', body: 'Click **Validate**. runQ flags missing PANs and any TDS without a deposited challan — fix those and re-validate.' },
      { title: 'Download the worksheet', body: 'Download the worksheet and feed it into NSDL\'s RPU + FVU to produce the .fvu file for upload to TRACES.' },
      { title: 'Record the token', body: 'After filing, paste the provisional receipt number back into runQ to mark the quarter filed.' },
    ],
  },
  {
    id: 'rec_hr_form_16',
    jobId: 'hr_compliance',
    title: 'Issue Form 16 to employees',
    summary: 'Generate Part B — the annual salary and tax computation.',
    minutes: 4,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Form 16', body: 'From the HR sidebar, open **Form 16** and pick the financial year.' },
      { title: 'Review per-employee figures', body: 'Each row shows gross salary, standard deduction, tax, TDS deducted, and the balance payable or refundable.' },
      { title: 'Print Part B', body: 'Click **Form 16** on a row to print Part B. Issue it to employees by 15 June.' },
      { title: 'Attach Part A', body: 'Part A — the TRACES-signed challan summary — is downloaded separately from TRACES and attached alongside.' },
    ],
  },
  // ── Set up HR ──────────────────────────────────────────────────────────
  {
    id: 'rec_hr_statutory_setup',
    jobId: 'hr_setup',
    title: 'Configure statutory registration IDs',
    summary: 'Enter the PF, ESI, PT, and TAN numbers that print on challans.',
    minutes: 3,
    difficulty: 'Easy',
    steps: [
      { title: 'Open Company settings', body: 'Go to **Settings → Company** and find the **Payroll Statutory** section.' },
      { title: 'Enter the registration numbers', body: 'Add your ESI registration number, EPFO establishment code, state PT registration number, and TAN.' },
      { title: 'Set the company state', body: 'The company\'s state drives which Professional Tax slab applies — make sure it\'s correct.' },
      { title: 'Save', body: 'Save. These IDs now appear on every payroll challan and statutory return.' },
    ],
  },
];

const HR_QUICK_LINKS: Omit<QuickLink, 'module'>[] = [
  { label: 'How is monthly TDS on salary calculated?', icon: 'scissors' },
  { label: 'When are PF, ESI, and PT due?', icon: 'landmark' },
  { label: 'How does attendance affect pay?', icon: 'calendar-check' },
  { label: 'Add a mid-year salary revision', icon: 'repeat' },
  { label: 'What goes in Form 24Q Annexure II?', icon: 'file-minus' },
];

const HR_WHATS_NEW: Omit<ChangelogItem, 'module'>[] = [
  { date: 'May 14, 2026', title: 'TDS filing — challans, Form 24Q, Form 16', body: 'Track ITNS-281 challans, build the quarterly 24Q return, and issue Form 16 Part B.' },
  { date: 'May 9, 2026', title: 'Professional Tax', body: 'State-driven PT slabs with per-state challans and a filing-cadence calendar.' },
  { date: 'May 1, 2026', title: 'Payroll runs', body: 'Process payslips for every employee with PF, ESI, and attendance pro-rating built in.' },
];

// ── Combined, module-tagged exports ──────────────────────────────────────

export const JOBS: Job[] = [
  ...FINANCE_JOBS.map((j) => ({ ...j, module: 'finance' as const })),
  ...HR_JOBS.map((j) => ({ ...j, module: 'hr' as const })),
];

export const RECIPES: Recipe[] = [
  ...FINANCE_RECIPES.map((r) => ({ ...r, module: 'finance' as const })),
  ...HR_RECIPES.map((r) => ({ ...r, module: 'hr' as const })),
];

export const QUICK_LINKS: QuickLink[] = [
  ...FINANCE_QUICK_LINKS.map((q) => ({ ...q, module: 'finance' as const })),
  ...HR_QUICK_LINKS.map((q) => ({ ...q, module: 'hr' as const })),
];

export const WHATS_NEW: ChangelogItem[] = [
  ...FINANCE_WHATS_NEW.map((n) => ({ ...n, module: 'finance' as const })),
  ...HR_WHATS_NEW.map((n) => ({ ...n, module: 'hr' as const })),
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function getJobForRecipe(recipeId: string): Job | undefined {
  return JOBS.find((j) => j.recipes.includes(recipeId));
}

export function getNextRecipeInJob(recipeId: string): Recipe | undefined {
  const job = getJobForRecipe(recipeId);
  if (!job) return undefined;
  const idx = job.recipes.indexOf(recipeId);
  if (idx < 0 || idx >= job.recipes.length - 1) return undefined;
  return getRecipe(job.recipes[idx + 1]);
}

// ── Per-module selectors ─────────────────────────────────────────────────

/** Help routes are namespaced per module: /finance/help, /hr/help. */
export const helpBasePath = (m: ModuleKey): string => `/${m}/help`;

export const jobsForModule = (m: ModuleKey): Job[] => JOBS.filter((j) => j.module === m);
export const recipesForModule = (m: ModuleKey): Recipe[] => RECIPES.filter((r) => r.module === m);
export const quickLinksForModule = (m: ModuleKey): QuickLink[] =>
  QUICK_LINKS.filter((q) => q.module === m);
export const whatsNewForModule = (m: ModuleKey): ChangelogItem[] =>
  WHATS_NEW.filter((n) => n.module === m);

export const TONE_CLASSES: Record<Tone, {
  ring: string;
  bg: string;
  bgGlow: string;
  icon: string;
  chip: string;
}> = {
  emerald: { ring: 'stroke-emerald-500', bg: 'bg-emerald-500/10', bgGlow: 'bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  blue:    { ring: 'stroke-blue-500',    bg: 'bg-blue-500/10',    bgGlow: 'bg-blue-500/10',    icon: 'text-blue-600 dark:text-blue-400',       chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  violet:  { ring: 'stroke-violet-500',  bg: 'bg-violet-500/10',  bgGlow: 'bg-violet-500/10',  icon: 'text-violet-600 dark:text-violet-400',   chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  amber:   { ring: 'stroke-amber-500',   bg: 'bg-amber-500/10',   bgGlow: 'bg-amber-500/10',   icon: 'text-amber-600 dark:text-amber-400',     chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  rose:    { ring: 'stroke-rose-500',    bg: 'bg-rose-500/10',    bgGlow: 'bg-rose-500/10',    icon: 'text-rose-600 dark:text-rose-400',       chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  indigo:  { ring: 'stroke-indigo-500',  bg: 'bg-indigo-500/10',  bgGlow: 'bg-indigo-500/10',  icon: 'text-indigo-600 dark:text-indigo-400',   chip: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
};

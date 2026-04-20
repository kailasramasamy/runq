import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'get_dashboard_summary',
    description:
      'Get a high-level financial overview: total cash position, outstanding receivables and payables, overdue amounts, and upcoming payments due in 7 days.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_receivables_aging',
    description:
      'Get receivables (money owed TO the business by customers) broken down by aging buckets: current, 1-30 days, 31-60 days, 61-90 days, 90+ days overdue.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_payables_aging',
    description:
      'Get payables (money the business owes TO vendors/suppliers) broken down by aging buckets: current, 1-30 days, 31-60 days, 61-90 days, 90+ days overdue.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_bank_balances',
    description: 'Get current balance of each bank account and the total across all accounts.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_invoices',
    description:
      'Search sales invoices (AR). Filter by customer name, status, date range, or free-text search on invoice number/customer name. Returns invoice details with amounts and payment status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Free-text search on invoice number or customer name' },
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'],
          description: 'Filter by invoice status',
        },
        dateFrom: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        dateTo: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        overdue: { type: 'boolean', description: 'If true, only show overdue invoices' },
        limit: { type: 'number', description: 'Max results (default 10, max 20)' },
      },
      required: [],
    },
  },
  {
    name: 'search_bills',
    description:
      'Search purchase bills/invoices (AP). Filter by vendor name, status, date range, or free-text search on bill number/vendor name. Returns bill details with amounts and payment status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Free-text search on bill number or vendor name' },
        status: {
          type: 'string',
          enum: ['draft', 'pending_match', 'matched', 'approved', 'partially_paid', 'paid', 'cancelled'],
          description: 'Filter by bill status',
        },
        dateFrom: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        dateTo: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        overdue: { type: 'boolean', description: 'If true, only show overdue bills' },
        limit: { type: 'number', description: 'Max results (default 10, max 20)' },
      },
      required: [],
    },
  },
  {
    name: 'search_customers',
    description:
      'Search customers by name. Returns customer details including outstanding and overdue amounts. Use hasOutstanding to find only customers who owe money.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search by customer name' },
        hasOutstanding: { type: 'boolean', description: 'If true, only show customers with outstanding balances' },
        limit: { type: 'number', description: 'Max results (default 10, max 20)' },
      },
      required: [],
    },
  },
  {
    name: 'search_vendors',
    description:
      'Search vendors/suppliers by name. Returns vendor details including outstanding and overdue amounts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search by vendor name' },
        category: { type: 'string', description: 'Filter by vendor category' },
        limit: { type: 'number', description: 'Max results (default 10, max 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_bank_transactions',
    description:
      'Get recent bank transactions. Can filter by type (credit/debit), date range, and search by narration. If no bankAccountId is provided, returns transactions across all bank accounts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        bankAccountId: { type: 'string', description: 'Specific bank account UUID. Omit to search all accounts.' },
        type: { type: 'string', enum: ['credit', 'debit'], description: 'Filter by transaction type' },
        dateFrom: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        dateTo: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        search: { type: 'string', description: 'Search by narration or reference' },
        limit: { type: 'number', description: 'Max results (default 10, max 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_journal_entries',
    description:
      'Search journal entries by date range, source type, or free-text search on entry number/description.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dateFrom: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        dateTo: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        sourceType: {
          type: 'string',
          enum: ['manual', 'invoice', 'bill', 'payment', 'receipt', 'credit_note', 'debit_note', 'bank_categorize'],
          description: 'Filter by source type',
        },
        search: { type: 'string', description: 'Search by entry number or description' },
        limit: { type: 'number', description: 'Max results (default 10, max 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_account_balance',
    description:
      'Get the current balance of a specific GL account by its account code (e.g., "1101" for cash, "2101" for accounts payable). Optionally get balance as of a specific date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        accountCode: { type: 'string', description: 'The GL account code (e.g., "1101", "4001", "5002")' },
        asOfDate: { type: 'string', description: 'Get balance as of this date (YYYY-MM-DD). Omit for current balance.' },
      },
      required: ['accountCode'],
    },
  },
  {
    name: 'get_trial_balance',
    description:
      'Get the trial balance — all GL accounts with their debit, credit, and net balance. Useful for verifying books are balanced and getting a complete financial picture.',
    input_schema: {
      type: 'object' as const,
      properties: {
        asOfDate: { type: 'string', description: 'Get trial balance as of this date (YYYY-MM-DD). Omit for current.' },
      },
      required: [],
    },
  },
];

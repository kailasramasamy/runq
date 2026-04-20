import type { Db } from '@runq/db';
import { and, eq, desc, gte, lte, sql } from 'drizzle-orm';
import { bankTransactions, bankAccounts } from '@runq/db';
import { DashboardService } from '../dashboard/dashboard.service';
import { InvoiceService } from '../ar/invoice.service';
import { PurchaseInvoiceService } from '../ap/purchase-invoice.service';
import { CustomerService } from '../ar/customer.service';
import { VendorService } from '../ap/vendor.service';
import { GLService } from '../gl/gl.service';

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function formatAmount(val: string | number | null | undefined): number {
  if (val == null) return 0;
  return typeof val === 'number' ? val : parseFloat(val) || 0;
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  db: Db,
  tenantId: string,
): Promise<string> {
  switch (toolName) {
    case 'get_dashboard_summary':
      return handleDashboardSummary(db, tenantId);
    case 'get_receivables_aging':
      return handleReceivablesAging(db, tenantId);
    case 'get_payables_aging':
      return handlePayablesAging(db, tenantId);
    case 'get_bank_balances':
      return handleBankBalances(db, tenantId);
    case 'search_invoices':
      return handleSearchInvoices(db, tenantId, input);
    case 'search_bills':
      return handleSearchBills(db, tenantId, input);
    case 'search_customers':
      return handleSearchCustomers(db, tenantId, input);
    case 'search_vendors':
      return handleSearchVendors(db, tenantId, input);
    case 'get_recent_bank_transactions':
      return handleBankTransactions(db, tenantId, input);
    case 'get_journal_entries':
      return handleJournalEntries(db, tenantId, input);
    case 'get_account_balance':
      return handleAccountBalance(db, tenantId, input);
    case 'get_trial_balance':
      return handleTrialBalance(db, tenantId, input);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

async function handleDashboardSummary(db: Db, tenantId: string): Promise<string> {
  const svc = new DashboardService(db, tenantId);
  const s = await svc.getSummary();
  return JSON.stringify({
    cashPosition: formatAmount(s.cashPosition),
    totalReceivables: formatAmount(s.totalOutstandingReceivables),
    totalPayables: formatAmount(s.totalOutstandingPayables),
    overdueReceivables: { count: s.overdue.receivables.count, amount: formatAmount(s.overdue.receivables.amount) },
    overduePayables: { count: s.overdue.payables.count, amount: formatAmount(s.overdue.payables.amount) },
    upcomingPayments7Days: { count: s.upcomingPayments7Days.count, amount: formatAmount(s.upcomingPayments7Days.amount) },
  });
}

async function handleReceivablesAging(db: Db, tenantId: string): Promise<string> {
  const svc = new DashboardService(db, tenantId);
  const aging = await svc.getReceivablesAging();
  return JSON.stringify(aging);
}

async function handlePayablesAging(db: Db, tenantId: string): Promise<string> {
  const svc = new DashboardService(db, tenantId);
  const aging = await svc.getPayablesAging();
  return JSON.stringify(aging);
}

async function handleBankBalances(db: Db, tenantId: string): Promise<string> {
  const svc = new DashboardService(db, tenantId);
  const balances = await svc.getBankBalances();
  return JSON.stringify({
    total: formatAmount(balances.total),
    accounts: balances.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      bankName: a.bankName,
      type: a.accountType,
      balance: formatAmount(a.currentBalance),
    })),
  });
}

async function handleSearchInvoices(db: Db, tenantId: string, input: Record<string, unknown>): Promise<string> {
  const svc = new InvoiceService(db, tenantId);
  const limit = clampLimit(input.limit as number | undefined);
  const result = await svc.list({
    page: 1,
    limit,
    filters: {
      search: input.search as string | undefined,
      status: input.status as 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | undefined,
      dateFrom: input.dateFrom as string | undefined,
      dateTo: input.dateTo as string | undefined,
      overdue: input.overdue as boolean | undefined,
    },
  });
  return JSON.stringify({
    total: result.meta.total,
    showing: result.data.length,
    invoices: result.data.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customerName,
      customerId: inv.customerId,
      date: inv.invoiceDate,
      dueDate: inv.dueDate,
      total: formatAmount(inv.totalAmount),
      balanceDue: formatAmount(inv.balanceDue),
      status: inv.status,
    })),
  });
}

async function handleSearchBills(db: Db, tenantId: string, input: Record<string, unknown>): Promise<string> {
  const svc = new PurchaseInvoiceService(db, tenantId);
  const limit = clampLimit(input.limit as number | undefined);
  const result = await svc.list({
    page: 1,
    limit,
    filters: {
      search: input.search as string | undefined,
      status: input.status as 'draft' | 'pending_match' | 'matched' | 'approved' | 'partially_paid' | 'paid' | 'cancelled' | undefined,
      dateFrom: input.dateFrom as string | undefined,
      dateTo: input.dateTo as string | undefined,
      overdue: input.overdue as boolean | undefined,
    },
  });
  return JSON.stringify({
    total: result.meta.total,
    showing: result.data.length,
    bills: result.data.map((bill) => ({
      id: bill.id,
      billNumber: bill.invoiceNumber,
      vendor: bill.vendorName,
      vendorId: bill.vendorId,
      date: bill.invoiceDate,
      dueDate: bill.dueDate,
      total: formatAmount(bill.totalAmount),
      balanceDue: formatAmount(bill.balanceDue),
      status: bill.status,
    })),
  });
}

async function handleSearchCustomers(db: Db, tenantId: string, input: Record<string, unknown>): Promise<string> {
  const svc = new CustomerService(db, tenantId);
  const limit = clampLimit(input.limit as number | undefined);
  const result = await svc.list({
    page: 1,
    limit,
    search: input.search as string | undefined,
    hasOutstanding: input.hasOutstanding as boolean | undefined,
  });
  return JSON.stringify({
    total: result.meta.total,
    showing: result.data.length,
    customers: result.data.map((c) => ({
      id: c.id,
      name: c.name,
      gstin: c.gstin,
      phone: c.phone,
      outstanding: formatAmount(c.outstandingAmount),
      overdue: formatAmount(c.overdueAmount),
      creditLimit: c.creditLimit,
      paymentTermsDays: c.paymentTermsDays,
    })),
  });
}

async function handleSearchVendors(db: Db, tenantId: string, input: Record<string, unknown>): Promise<string> {
  const svc = new VendorService(db, tenantId);
  const limit = clampLimit(input.limit as number | undefined);
  const result = await svc.list({
    page: 1,
    limit,
    search: input.search as string | undefined,
    category: input.category as string | undefined,
  });
  return JSON.stringify({
    total: result.meta.total,
    showing: result.data.length,
    vendors: result.data.map((v) => ({
      id: v.id,
      name: v.name,
      gstin: v.gstin,
      category: v.category,
      outstanding: formatAmount(v.outstandingAmount),
      overdue: formatAmount(v.overdueAmount),
    })),
  });
}

async function handleBankTransactions(db: Db, tenantId: string, input: Record<string, unknown>): Promise<string> {
  const limit = clampLimit(input.limit as number | undefined);
  const bankAccountId = input.bankAccountId as string | undefined;

  // If specific bank account, use TransactionService; otherwise query directly
  const conditions = [
    eq(bankTransactions.tenantId, tenantId),
    bankAccountId ? eq(bankTransactions.bankAccountId, bankAccountId) : undefined,
    input.type ? eq(bankTransactions.type, input.type as 'credit' | 'debit') : undefined,
    input.dateFrom ? gte(bankTransactions.transactionDate, input.dateFrom as string) : undefined,
    input.dateTo ? lte(bankTransactions.transactionDate, input.dateTo as string) : undefined,
    input.search
      ? sql`(${bankTransactions.narration} ILIKE ${'%' + (input.search as string) + '%'} OR ${bankTransactions.reference} ILIKE ${'%' + (input.search as string) + '%'})`
      : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      date: bankTransactions.transactionDate,
      type: bankTransactions.type,
      amount: bankTransactions.amount,
      narration: bankTransactions.narration,
      reference: bankTransactions.reference,
      reconStatus: bankTransactions.reconStatus,
      bankName: bankAccounts.name,
    })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(and(...conditions))
    .orderBy(desc(bankTransactions.transactionDate))
    .limit(limit);

  return JSON.stringify({
    showing: rows.length,
    transactions: rows.map((r) => ({
      date: r.date,
      type: r.type,
      amount: formatAmount(r.amount),
      narration: r.narration,
      reference: r.reference,
      status: r.reconStatus,
      bankAccount: r.bankName,
    })),
  });
}

async function handleJournalEntries(db: Db, tenantId: string, input: Record<string, unknown>): Promise<string> {
  const svc = new GLService(db, tenantId);
  const limit = clampLimit(input.limit as number | undefined);
  const result = await svc.listJournalEntries(
    {
      dateFrom: input.dateFrom as string | undefined,
      dateTo: input.dateTo as string | undefined,
      sourceType: input.sourceType as string | undefined,
      search: input.search as string | undefined,
    },
    { page: 1, limit },
  );
  return JSON.stringify({
    total: result.meta.total,
    showing: result.data.length,
    entries: result.data.map((e) => ({
      entryNumber: e.entryNumber,
      date: e.date,
      description: e.description,
      sourceType: e.sourceType,
      totalDebit: formatAmount(e.totalDebit),
    })),
  });
}

async function handleAccountBalance(db: Db, tenantId: string, input: Record<string, unknown>): Promise<string> {
  const svc = new GLService(db, tenantId);
  const code = input.accountCode as string;
  const asOfDate = input.asOfDate as string | undefined;

  // Resolve account code to ID
  const accounts = await svc.listAccounts();
  const account = accounts.find((a) => a.code === code);
  if (!account) {
    return JSON.stringify({ error: `Account code "${code}" not found` });
  }

  const balance = await svc.getAccountBalance(account.id, asOfDate);
  return JSON.stringify({
    accountCode: account.code,
    accountName: account.name,
    accountType: account.type,
    balance,
    asOfDate: asOfDate ?? 'current',
  });
}

async function handleTrialBalance(db: Db, tenantId: string, input: Record<string, unknown>): Promise<string> {
  const svc = new GLService(db, tenantId);
  const asOfDate = input.asOfDate as string | undefined;
  const rows = await svc.getTrialBalance(asOfDate);

  // Filter out zero-balance accounts to keep response concise
  const nonZero = rows.filter((r) => r.balance !== 0 || r.debit !== 0 || r.credit !== 0);
  return JSON.stringify({
    asOfDate: asOfDate ?? 'current',
    accountCount: nonZero.length,
    accounts: nonZero.map((r) => ({
      code: r.accountCode,
      name: r.accountName,
      type: r.accountType,
      debit: r.debit,
      credit: r.credit,
      balance: r.balance,
    })),
  });
}

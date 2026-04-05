import type {
  ProfitAndLoss,
  BalanceSheet,
  CashFlowStatement,
  ExpenseAnalytics,
  RevenueAnalytics,
} from '@runq/types';

function escapeCSV(val: string | number | null | undefined): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCSV).join(',');
}

export function profitAndLossToCSV(data: ProfitAndLoss): string {
  const lines: string[] = [];
  lines.push(row('Profit & Loss', `${data.period.from} to ${data.period.to}`));
  lines.push('');
  lines.push(row('Section', 'Account Code', 'Account Name', 'Amount'));

  for (const r of data.revenue) lines.push(row('Revenue', r.accountCode, r.accountName, r.amount));
  lines.push(row('', '', 'Total Revenue', data.totalRevenue));
  lines.push('');

  for (const r of data.cogs) lines.push(row('Cost of Goods Sold', r.accountCode, r.accountName, r.amount));
  lines.push(row('', '', 'Total COGS', data.totalCogs));
  lines.push(row('', '', 'Gross Profit', data.grossProfit));
  lines.push('');

  for (const r of data.operatingExpenses) lines.push(row('Operating Expenses', r.accountCode, r.accountName, r.amount));
  lines.push(row('', '', 'Total Operating Expenses', data.totalOperatingExpenses));
  lines.push(row('', '', 'Operating Profit', data.operatingProfit));
  lines.push('');

  for (const r of data.depreciation) lines.push(row('Depreciation', r.accountCode, r.accountName, r.amount));
  for (const r of data.financialCosts) lines.push(row('Financial Costs', r.accountCode, r.accountName, r.amount));
  lines.push(row('', '', 'Profit Before Tax', data.profitBeforeTax));

  for (const r of data.taxes) lines.push(row('Taxes', r.accountCode, r.accountName, r.amount));
  lines.push(row('', '', 'Net Profit', data.netProfit));

  return lines.join('\n');
}

export function balanceSheetToCSV(data: BalanceSheet): string {
  const lines: string[] = [];
  lines.push(row('Balance Sheet', `as of ${data.asOfDate}`));
  lines.push('');
  lines.push(row('Section', 'Account Code', 'Account Name', 'Amount'));

  for (const r of data.assets) lines.push(row('Assets', r.accountCode, r.accountName, r.amount));
  lines.push(row('', '', 'Total Assets', data.totalAssets));
  lines.push('');

  for (const r of data.liabilities) lines.push(row('Liabilities', r.accountCode, r.accountName, r.amount));
  lines.push(row('', '', 'Total Liabilities', data.totalLiabilities));
  lines.push('');

  for (const r of data.equity) lines.push(row('Equity', r.accountCode, r.accountName, r.amount));
  lines.push(row('', '', 'Total Equity', data.totalEquity));

  return lines.join('\n');
}

export function cashFlowToCSV(data: CashFlowStatement): string {
  const lines: string[] = [];
  lines.push(row('Cash Flow Statement', `${data.period.from} to ${data.period.to}`));
  lines.push('');
  lines.push(row('Section', 'Description', 'Amount'));
  lines.push(row('', 'Opening Cash Balance', data.openingBalance));
  lines.push('');

  for (const r of data.operating) lines.push(row('Operating', r.description, r.amount));
  lines.push(row('', 'Net Operating', data.totalOperating));
  lines.push('');

  for (const r of data.investing) lines.push(row('Investing', r.description, r.amount));
  lines.push(row('', 'Net Investing', data.totalInvesting));
  lines.push('');

  for (const r of data.financing) lines.push(row('Financing', r.description, r.amount));
  lines.push(row('', 'Net Financing', data.totalFinancing));
  lines.push('');

  lines.push(row('', 'Net Change in Cash', data.netChange));
  lines.push(row('', 'Closing Cash Balance', data.closingBalance));

  return lines.join('\n');
}

export function expenseAnalyticsToCSV(data: ExpenseAnalytics): string {
  const lines: string[] = [];
  lines.push(row('Expense Analytics', `${data.period.from} to ${data.period.to}`));
  lines.push('');

  lines.push(row('By Category'));
  lines.push(row('Category', 'Amount', 'Percentage'));
  for (const r of data.byCategory) lines.push(row(r.category, r.amount, `${r.percentage}%`));
  lines.push(row('Total', data.total));
  lines.push('');

  lines.push(row('By Vendor'));
  lines.push(row('Vendor', 'Amount', 'Percentage'));
  for (const r of data.byVendor) lines.push(row(r.vendorName, r.amount, `${r.percentage}%`));
  lines.push('');

  lines.push(row('By Month'));
  lines.push(row('Month', 'Amount'));
  for (const r of data.byMonth) lines.push(row(r.month, r.amount));

  return lines.join('\n');
}

export function revenueAnalyticsToCSV(data: RevenueAnalytics): string {
  const lines: string[] = [];
  lines.push(row('Revenue Analytics', `${data.period.from} to ${data.period.to}`));
  lines.push('');

  lines.push(row('By Customer'));
  lines.push(row('Customer', 'Amount', 'Percentage'));
  for (const r of data.byCustomer) lines.push(row(r.customerName, r.amount, `${r.percentage}%`));
  lines.push(row('Total', data.total));
  lines.push('');

  lines.push(row('By Month'));
  lines.push(row('Month', 'Amount'));
  for (const r of data.byMonth) lines.push(row(r.month, r.amount));

  return lines.join('\n');
}

export function trialBalanceToCSV(accounts: { code: string; name: string; type: string; debit: number; credit: number }[], asOfDate: string, totalDebit: number, totalCredit: number): string {
  const lines: string[] = [];
  lines.push(row('Trial Balance', `as of ${asOfDate}`));
  lines.push('');
  lines.push(row('Account Code', 'Account Name', 'Type', 'Debit', 'Credit'));
  for (const a of accounts) lines.push(row(a.code, a.name, a.type, a.debit || '', a.credit || ''));
  lines.push(row('', 'Total', '', totalDebit, totalCredit));
  return lines.join('\n');
}

export function journalEntriesToCSV(entries: { entryNumber: string; entryDate: string; narration: string | null; lines: { accountCode: string; accountName: string; debit: number; credit: number }[] }[]): string {
  const lines: string[] = [];
  lines.push(row('Entry Number', 'Date', 'Narration', 'Account Code', 'Account Name', 'Debit', 'Credit'));
  for (const e of entries) {
    for (const l of e.lines) {
      lines.push(row(e.entryNumber, e.entryDate, e.narration, l.accountCode, l.accountName, l.debit || '', l.credit || ''));
    }
  }
  return lines.join('\n');
}

export function invoiceRegisterToCSV(invoices: { invoiceNumber: string; invoiceDate: string; partyName: string; totalAmount: number; taxAmount: number; balanceDue: number; status: string }[], type: 'Sales' | 'Purchase'): string {
  const lines: string[] = [];
  const partyLabel = type === 'Sales' ? 'Customer' : 'Vendor';
  lines.push(row(`${type} Register`));
  lines.push('');
  lines.push(row('Invoice #', 'Date', partyLabel, 'Total Amount', 'Tax Amount', 'Balance Due', 'Status'));
  for (const inv of invoices) {
    lines.push(row(inv.invoiceNumber, inv.invoiceDate, inv.partyName, inv.totalAmount, inv.taxAmount, inv.balanceDue, inv.status));
  }
  return lines.join('\n');
}

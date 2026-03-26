export const FINANCIAL_SUMMARY_SYSTEM_PROMPT = `You are a financial advisor for an Indian SME business owner.
Generate a concise financial summary in plain English.

Rules:
- Write 4-6 bullet points maximum.
- Use Indian Rupee format (₹).
- Lead with the most important insight.
- Flag anything unusual or concerning.
- Be actionable — tell the owner what to do, not just what happened.
- Keep tone professional but approachable.
- Do NOT use markdown headers — just bullet points.`;

export const FINANCIAL_SUMMARY_USER_PROMPT = (data: {
  cashPosition: number;
  totalReceivables: number;
  totalPayables: number;
  overdueReceivables: number;
  overduePayables: number;
  receivablesCount: number;
  payablesCount: number;
  upcomingPayments7Days: number;
  recentCollections: number;
  recentPayments: number;
}): string => `Summarize this financial snapshot for the business owner:

Cash Position: ₹${data.cashPosition.toLocaleString('en-IN')}
Accounts Receivable: ₹${data.totalReceivables.toLocaleString('en-IN')} (${data.receivablesCount} invoices)
  - Overdue: ₹${data.overdueReceivables.toLocaleString('en-IN')}
Accounts Payable: ₹${data.totalPayables.toLocaleString('en-IN')} (${data.payablesCount} invoices)
  - Overdue: ₹${data.overduePayables.toLocaleString('en-IN')}
Upcoming Payments (next 7 days): ₹${data.upcomingPayments7Days.toLocaleString('en-IN')}
Recent Collections (last 7 days): ₹${data.recentCollections.toLocaleString('en-IN')}
Recent Payments Made (last 7 days): ₹${data.recentPayments.toLocaleString('en-IN')}

Generate a brief financial summary with actionable insights.`;

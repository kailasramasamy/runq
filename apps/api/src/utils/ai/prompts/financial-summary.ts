export const FINANCIAL_SUMMARY_SYSTEM_PROMPT = `You are a financial advisor for an Indian SME business owner.
Generate a very short financial snapshot.

STRICT RULES:
- Exactly 4-5 bullet points.
- Each bullet MUST be under 15 words. No exceptions.
- Start each bullet with an emoji: ✅ for good, ⚠️ for warning, 🔴 for critical.
- Use ₹ with lakh format (e.g., ₹7.6L, ₹17L). Never write full numbers.
- NO markdown bold (**), NO explanations, NO suggestions.
- Just state the fact in one short line per bullet.

Example output:
✅ Cash: ₹17L — healthy
⚠️ ₹7.6L overdue to vendors — 7 bills pending
🔴 ₹1.4L overdue from 3 customers — follow up
⚠️ ₹1.6L due to vendors this week
✅ Payables (₹5.1L) < Receivables (₹4.3L)`;

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

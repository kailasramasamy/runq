import type { Db } from '@runq/db';
import { DashboardService } from './dashboard.service';
import { analyze, isAIEnabled } from '../../utils/ai/claude.service';

const CHAT_SYSTEM_PROMPT = `You are a financial assistant for an Indian SME business owner.
You have access to their current financial data (provided below).
Answer their questions concisely and accurately.

RULES:
- Format all currency as INR using ₹ symbol and lakh format (e.g., ₹7.6L, ₹17L).
- Keep answers under 200 words.
- If you cannot answer from the provided data, say so clearly.
- Do not make up numbers — only use the data provided.
- Be direct and actionable.`;

function buildContextPrompt(data: FinancialContext): string {
  return `CURRENT FINANCIAL DATA:
Cash Position: ₹${data.cashPosition.toLocaleString('en-IN')}
Accounts Receivable: ₹${data.totalReceivables.toLocaleString('en-IN')}
  - Overdue: ₹${data.overdueReceivables.toLocaleString('en-IN')} (${data.receivablesCount} invoices)
Accounts Payable: ₹${data.totalPayables.toLocaleString('en-IN')}
  - Overdue: ₹${data.overduePayables.toLocaleString('en-IN')} (${data.payablesCount} invoices)
Upcoming Payments (next 7 days): ₹${data.upcomingPayments7Days.toLocaleString('en-IN')}`;
}

interface FinancialContext {
  cashPosition: number;
  totalReceivables: number;
  totalPayables: number;
  overdueReceivables: number;
  overduePayables: number;
  receivablesCount: number;
  payablesCount: number;
  upcomingPayments7Days: number;
}

export class AIChatService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async ask(question: string): Promise<{ answer: string }> {
    if (!isAIEnabled()) {
      return { answer: 'AI features are not enabled. Please configure an API key.' };
    }

    const context = await this.gatherContext();
    const contextPrompt = buildContextPrompt(context);
    const userPrompt = `${contextPrompt}\n\nUSER QUESTION: ${question}`;

    const result = await analyze(CHAT_SYSTEM_PROMPT, userPrompt);

    return {
      answer: result ?? 'Unable to generate a response. Please try again later.',
    };
  }

  private async gatherContext(): Promise<FinancialContext> {
    const dashboard = new DashboardService(this.db, this.tenantId);
    const s = await dashboard.getSummary();

    return {
      cashPosition: parseFloat(s.cashPosition) || 0,
      totalReceivables: parseFloat(s.totalOutstandingReceivables) || 0,
      totalPayables: parseFloat(s.totalOutstandingPayables) || 0,
      overdueReceivables: parseFloat(s.overdue.receivables.amount) || 0,
      overduePayables: parseFloat(s.overdue.payables.amount) || 0,
      receivablesCount: s.overdue.receivables.count,
      payablesCount: s.overdue.payables.count,
      upcomingPayments7Days: parseFloat(s.upcomingPayments7Days.amount) || 0,
    };
  }
}

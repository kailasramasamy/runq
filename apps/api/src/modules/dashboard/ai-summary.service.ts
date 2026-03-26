import type { Db } from '@runq/db';
import type Redis from 'ioredis';
import { DashboardService } from './dashboard.service';
import { analyze, isAIEnabled } from '../../utils/ai/claude.service';
import { FINANCIAL_SUMMARY_SYSTEM_PROMPT, FINANCIAL_SUMMARY_USER_PROMPT } from '../../utils/ai/prompts/financial-summary';

export interface AISummaryResult {
  summary: string;
  generatedAt: string;
}

const CACHE_TTL = 3600; // 1 hour in seconds

export class AISummaryService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly redis: Redis,
  ) {}

  async getSummary(refresh = false): Promise<AISummaryResult> {
    const cacheKey = `ai-summary:${this.tenantId}`;

    if (!refresh) {
      const cached = await this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    const data = await this.aggregateFinancials();
    const userPrompt = FINANCIAL_SUMMARY_USER_PROMPT(data);
    const result = await analyze(FINANCIAL_SUMMARY_SYSTEM_PROMPT, userPrompt);

    const summary: AISummaryResult = {
      summary: result ?? 'Unable to generate summary. Please try again later.',
      generatedAt: new Date().toISOString(),
    };

    await this.setCache(cacheKey, summary);
    return summary;
  }

  private async aggregateFinancials() {
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
      recentCollections: 0,
      recentPayments: 0,
    };
  }

  private async getFromCache(key: string): Promise<AISummaryResult | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as AISummaryResult;
  }

  private async setCache(key: string, value: AISummaryResult): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL);
  }
}

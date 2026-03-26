import { eq, and, isNull } from 'drizzle-orm';
import { bankTransactions, accounts, vendors, customers } from '@runq/db';
import type { Db } from '@runq/db';
import type { CategorizationResult } from '@runq/types';
import { analyze } from '../../utils/ai/claude.service';
import {
  BANK_CATEGORIZATION_BATCH_SYSTEM_PROMPT,
  BANK_CATEGORIZATION_BATCH_USER_PROMPT,
} from '../../utils/ai/prompts/bank-categorization';

interface RuleMatch {
  accountCode: string;
  confidence: number;
}

interface GlAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

const RULES: Array<{
  patterns: RegExp[];
  code: string;
  confidence: number;
  txnType?: 'credit' | 'debit';
}> = [
  { patterns: [/BANK\s*CHARGES?/i, /\bCHARGES?\b/i, /\bCHG\b/i], code: '5007', confidence: 0.95 },
  { patterns: [/SALARY/i, /\bSAL[-\/]/i], code: '5003', confidence: 0.95 },
  { patterns: [/\bRENT\b/i], code: '5004', confidence: 0.90 },
  { patterns: [/INTEREST/i], code: '4002', confidence: 0.85, txnType: 'credit' },
];

export class CategorizeService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async categorizeTransactions(bankAccountId: string): Promise<CategorizationResult> {
    const [uncategorized, glAccounts, vendorNames, customerNames] = await Promise.all([
      this.fetchUncategorized(bankAccountId),
      this.fetchGlAccounts(),
      this.fetchVendorNames(),
      this.fetchCustomerNames(),
    ]);

    if (uncategorized.length === 0) {
      return { categorized: 0, rulesMatched: 0, aiMatched: 0, skipped: 0 };
    }

    const accountByCode = new Map(glAccounts.map((a) => [a.code, a]));
    let rulesMatched = 0;
    let aiMatched = 0;
    const needsAI: typeof uncategorized = [];

    for (const txn of uncategorized) {
      const match = this.applyRules(txn.narration, txn.type, vendorNames, customerNames);
      if (match && accountByCode.has(match.accountCode)) {
        await this.updateGlCategory(txn.id, accountByCode.get(match.accountCode)!.id, match.confidence);
        rulesMatched++;
      } else {
        needsAI.push(txn);
      }
    }

    aiMatched = await this.categorizeWithAI(needsAI, glAccounts, accountByCode);
    const skipped = needsAI.length - aiMatched;

    return { categorized: rulesMatched + aiMatched, rulesMatched, aiMatched, skipped };
  }

  async setCategory(transactionId: string, glAccountId: string): Promise<void> {
    await this.db
      .update(bankTransactions)
      .set({ glAccountId, glConfidence: '1.00', glSuggestedAt: null, updatedAt: new Date() })
      .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, this.tenantId)));
  }

  private applyRules(
    narration: string | null,
    type: 'credit' | 'debit',
    vendorNames: string[],
    customerNames: string[],
  ): RuleMatch | null {
    if (!narration) return null;
    const upper = narration.toUpperCase();

    for (const rule of RULES) {
      if (rule.txnType && rule.txnType !== type) continue;
      if (rule.patterns.some((p) => p.test(upper))) {
        return { accountCode: rule.code, confidence: rule.confidence };
      }
    }

    return this.matchPartyNames(upper, type, vendorNames, customerNames);
  }

  private matchPartyNames(
    upper: string,
    type: 'credit' | 'debit',
    vendorNames: string[],
    customerNames: string[],
  ): RuleMatch | null {
    if (type === 'debit') {
      const match = vendorNames.find((v) => upper.includes(v.toUpperCase()));
      if (match) return { accountCode: '2101', confidence: 0.80 };
    }
    if (type === 'credit') {
      const match = customerNames.find((c) => upper.includes(c.toUpperCase()));
      if (match) return { accountCode: '1103', confidence: 0.80 };
    }
    return null;
  }

  private async categorizeWithAI(
    txns: Array<{ id: string; narration: string | null; amount: string; type: 'credit' | 'debit' }>,
    glAccounts: GlAccount[],
    accountByCode: Map<string, GlAccount>,
  ): Promise<number> {
    const withNarration = txns.filter((t) => t.narration);
    if (withNarration.length === 0) return 0;

    const glForPrompt = glAccounts.map((a) => ({ code: a.code, name: a.name, type: a.type }));
    let matched = 0;
    const batches = this.chunk(withNarration, 10);

    for (const batch of batches) {
      matched += await this.processAIBatch(batch, glForPrompt, accountByCode);
    }
    return matched;
  }

  private async processAIBatch(
    batch: Array<{ id: string; narration: string | null; amount: string; type: 'credit' | 'debit' }>,
    glForPrompt: Array<{ code: string; name: string; type: string }>,
    accountByCode: Map<string, GlAccount>,
  ): Promise<number> {
    const input = batch.map((t, i) => ({
      index: i,
      narration: t.narration ?? '',
      amount: parseFloat(t.amount),
      type: t.type,
    }));

    const userPrompt = BANK_CATEGORIZATION_BATCH_USER_PROMPT(input, glForPrompt);
    const response = await analyze(BANK_CATEGORIZATION_BATCH_SYSTEM_PROMPT, userPrompt);
    if (!response) return 0;

    return this.parseAndApplyAIResponse(response, batch, accountByCode);
  }

  private async parseAndApplyAIResponse(
    response: string,
    batch: Array<{ id: string; narration: string | null; amount: string; type: 'credit' | 'debit' }>,
    accountByCode: Map<string, GlAccount>,
  ): Promise<number> {
    let matched = 0;
    try {
      const jsonStr = response.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      const results = JSON.parse(jsonStr) as Array<{ index: number; accountCode: string; confidence: number }>;

      for (const r of results) {
        const txn = batch[r.index];
        const account = accountByCode.get(r.accountCode);
        if (!txn || !account || r.confidence < 0.5) continue;

        await this.updateGlCategory(txn.id, account.id, r.confidence);
        matched++;
      }
    } catch {
      // AI returned unparseable response — skip this batch
    }
    return matched;
  }

  private async updateGlCategory(txnId: string, glAccountId: string, confidence: number): Promise<void> {
    await this.db
      .update(bankTransactions)
      .set({
        glAccountId,
        glConfidence: confidence.toFixed(2),
        glSuggestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(bankTransactions.id, txnId), eq(bankTransactions.tenantId, this.tenantId)));
  }

  private async fetchUncategorized(bankAccountId: string) {
    return this.db
      .select({
        id: bankTransactions.id,
        narration: bankTransactions.narration,
        amount: bankTransactions.amount,
        type: bankTransactions.type,
      })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.bankAccountId, bankAccountId),
        isNull(bankTransactions.glAccountId),
      ));
  }

  private async fetchGlAccounts(): Promise<GlAccount[]> {
    const rows = await this.db
      .select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type })
      .from(accounts)
      .where(eq(accounts.tenantId, this.tenantId));
    return rows;
  }

  private async fetchVendorNames(): Promise<string[]> {
    const rows = await this.db
      .select({ name: vendors.name })
      .from(vendors)
      .where(eq(vendors.tenantId, this.tenantId));
    return rows.map((r) => r.name);
  }

  private async fetchCustomerNames(): Promise<string[]> {
    const rows = await this.db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.tenantId, this.tenantId));
    return rows.map((r) => r.name);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}

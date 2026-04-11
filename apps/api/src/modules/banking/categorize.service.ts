import { eq, and, isNull } from 'drizzle-orm';
import { bankTransactions, bankAccounts, accounts, vendors, customers, bankNarrationRules } from '@runq/db';
import type { Db } from '@runq/db';
import type { CategorizationResult } from '@runq/types';
import { analyze } from '../../utils/ai/claude.service';
import {
  BANK_CATEGORIZATION_BATCH_SYSTEM_PROMPT,
  BANK_CATEGORIZATION_BATCH_USER_PROMPT,
} from '../../utils/ai/prompts/bank-categorization';
import { CategorizePostingService } from './categorize-posting.service';

interface RuleMatch {
  accountCode?: string;
  accountId?: string;
  confidence: number;
  autoReconcile?: boolean;
}

interface GlAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

// Hardcoded rules — act as baseline before learned rules
const HARDCODED_RULES: Array<{
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

/**
 * Extract a reusable pattern from a bank narration.
 * NEFT/IMPS narrations contain payee identifiers that repeat across
 * transactions — we extract those as learnable patterns.
 *
 * Examples:
 *   "INF/NEFT/IN42609256714963/UCBA0002538/INDUSPPBENCHKAL" → "INDUSPPBENCHKAL"
 *   "NEFT-AXISCN1298896167-RAZORPAY PAYMENTS PVT LTD..." → "RAZORPAY PAYMENTS"
 *   "MMT/IMPS/609415665178/DairyChetanDriv/SBIN0040877" → "DairyChetanDriv"
 *   "UPI/123456/Payment" → "Payment"
 */
function extractNarrationPattern(narration: string): string | null {
  if (!narration || narration.length < 5) return null;

  // NEFT format: "INF/NEFT/.../IFSC/PAYEE_NAME"
  const neftMatch = narration.match(/(?:INF\/)?NEFT\/[^\/]+\/[A-Z]{4}\d{7}\/(.+)/i);
  if (neftMatch) return neftMatch[1]!.trim();

  // NEFT format: "NEFT-REFNO-PAYEE NAME..."
  const neftDash = narration.match(/NEFT-[A-Z0-9]+-(.+?)(?:\s*-|$)/i);
  if (neftDash) {
    // Take the payee name, trim common suffixes
    const payee = neftDash[1]!.trim();
    // Keep first 2-3 significant words (drop "PVT LTD PAYMENT AGGREGATOR...")
    const words = payee.split(/\s+/);
    return words.slice(0, Math.min(words.length, 3)).join(' ');
  }

  // IMPS format: "MMT/IMPS/REFNO/PAYEE/IFSC"
  const impsMatch = narration.match(/MMT\/IMPS\/\d+\/(.+?)\/[A-Z]{4}\d{7}/i);
  if (impsMatch) return impsMatch[1]!.trim();

  // UPI format: various
  const upiMatch = narration.match(/UPI\/\d+\/(.+?)(?:\/|$)/i);
  if (upiMatch) return upiMatch[1]!.trim();

  // Fallback: if narration is short enough, use it as-is (likely a direct description)
  if (narration.length <= 60) return narration.trim();

  return null;
}

export class CategorizeService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Categorize all uncategorized transactions for a bank account.
   * Priority: learned narration rules → hardcoded rules → vendor/customer names → AI.
   * High-confidence matches are auto-reconciled.
   */
  async categorizeTransactions(bankAccountId: string): Promise<CategorizationResult> {
    const [uncategorized, glAccounts, vendorNames, customerNames, narrationRules, bankGlCode] = await Promise.all([
      this.fetchUncategorized(bankAccountId),
      this.fetchGlAccounts(),
      this.fetchVendorNames(),
      this.fetchCustomerNames(),
      this.fetchNarrationRules(),
      this.fetchBankGlCode(bankAccountId),
    ]);

    if (uncategorized.length === 0) {
      return { categorized: 0, rulesMatched: 0, aiMatched: 0, skipped: 0 };
    }

    const accountByCode = new Map(glAccounts.map((a) => [a.code, a]));
    const posting = new CategorizePostingService(this.db, this.tenantId);
    let rulesMatched = 0;
    let aiMatched = 0;
    const needsAI: typeof uncategorized = [];

    for (const txn of uncategorized) {
      const match = this.applyAllRules(txn.narration, txn.type, narrationRules, vendorNames, customerNames);
      if (match) {
        const glAccount = match.accountId
          ? glAccounts.find((a) => a.id === match.accountId)
          : accountByCode.get(match.accountCode ?? '');
        if (glAccount) {
          const shouldPost = (match.autoReconcile ?? match.confidence >= 0.85) && txn.type === 'debit' && bankGlCode;
          await this.updateGlCategory(txn.id, glAccount.id, match.confidence);
          if (shouldPost) {
            await posting.postBankDebit({
              transactionId: txn.id,
              transactionDate: txn.transactionDate,
              amount: parseFloat(txn.amount),
              narration: txn.narration,
              expenseAccountCode: glAccount.code,
              bankGlAccountCode: bankGlCode,
            });
          }
          rulesMatched++;
          continue;
        }
      }
      needsAI.push(txn);
    }

    aiMatched = await this.categorizeWithAI(needsAI, glAccounts, accountByCode, bankGlCode, posting);
    const skipped = needsAI.length - aiMatched;

    return { categorized: rulesMatched + aiMatched, rulesMatched, aiMatched, skipped };
  }

  /**
   * Manually set GL category on a transaction.
   * Also marks as reconciled and learns the narration pattern for future auto-categorization.
   */
  async setCategory(
    transactionId: string,
    glAccountId: string,
    options: { reconcile?: boolean; learn?: boolean } = {},
  ): Promise<void> {
    const { reconcile = true, learn = true } = options;

    // Get the transaction to learn from and post JE
    const [txn] = await this.db
      .select({
        id: bankTransactions.id,
        narration: bankTransactions.narration,
        type: bankTransactions.type,
        bankAccountId: bankTransactions.bankAccountId,
        transactionDate: bankTransactions.transactionDate,
        amount: bankTransactions.amount,
      })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, this.tenantId)))
      .limit(1);

    await this.db
      .update(bankTransactions)
      .set({
        glAccountId,
        glConfidence: '1.00',
        glSuggestedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, this.tenantId)));

    // Learn the narration pattern
    if (learn && txn?.narration) {
      await this.learnNarrationRule(txn.narration, glAccountId, txn.type);
    }

    // Auto-post JE for debit transactions
    if (reconcile && txn?.type === 'debit') {
      await this.postDebitJE(txn, glAccountId);
    }
  }

  /**
   * Look up the GL account code and bank GL code, then post a JE for a debit transaction.
   */
  private async postDebitJE(
    txn: { id: string; narration: string | null; bankAccountId: string; transactionDate: string; amount: string },
    glAccountId: string,
  ): Promise<void> {
    const [[glAccount], bankGlCode] = await Promise.all([
      this.db.select({ code: accounts.code }).from(accounts)
        .where(and(eq(accounts.id, glAccountId), eq(accounts.tenantId, this.tenantId)))
        .limit(1),
      this.fetchBankGlCode(txn.bankAccountId),
    ]);

    if (!glAccount || !bankGlCode) return;

    const posting = new CategorizePostingService(this.db, this.tenantId);
    await posting.postBankDebit({
      transactionId: txn.id,
      transactionDate: txn.transactionDate,
      amount: parseFloat(txn.amount),
      narration: txn.narration,
      expenseAccountCode: glAccount.code,
      bankGlAccountCode: bankGlCode,
    });
  }

  /**
   * Extract a pattern from the narration and save it as a rule.
   * Skips if pattern already exists for this tenant + GL account.
   */
  private async learnNarrationRule(
    narration: string,
    glAccountId: string,
    txnType: 'credit' | 'debit',
  ): Promise<void> {
    const pattern = extractNarrationPattern(narration);
    if (!pattern || pattern.length < 3) return;

    // Check if this pattern already exists
    const existing = await this.db
      .select({ id: bankNarrationRules.id })
      .from(bankNarrationRules)
      .where(and(
        eq(bankNarrationRules.tenantId, this.tenantId),
        eq(bankNarrationRules.pattern, pattern),
      ))
      .limit(1);

    if (existing.length > 0) return;

    await this.db.insert(bankNarrationRules).values({
      tenantId: this.tenantId,
      pattern,
      glAccountId,
      autoReconcile: true,
      txnType,
    });
  }

  /**
   * Apply all rule sources in priority order:
   * 1. Learned narration rules (highest priority — user taught these)
   * 2. Hardcoded pattern rules (bank charges, salary, etc.)
   * 3. Vendor/customer name matching
   */
  private applyAllRules(
    narration: string | null,
    type: 'credit' | 'debit',
    narrationRules: { pattern: string; glAccountId: string; autoReconcile: boolean; txnType: string | null }[],
    vendorNames: string[],
    customerNames: string[],
  ): RuleMatch | null {
    if (!narration) return null;
    const upper = narration.toUpperCase();

    // 1. Learned narration rules (case-insensitive substring match)
    for (const rule of narrationRules) {
      if (rule.txnType && rule.txnType !== type) continue;
      if (upper.includes(rule.pattern.toUpperCase())) {
        return { accountId: rule.glAccountId, confidence: 0.95, autoReconcile: rule.autoReconcile };
      }
    }

    // 2. Hardcoded pattern rules
    for (const rule of HARDCODED_RULES) {
      if (rule.txnType && rule.txnType !== type) continue;
      if (rule.patterns.some((p) => p.test(upper))) {
        return { accountCode: rule.code, confidence: rule.confidence };
      }
    }

    // 3. Vendor/customer name matching
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
    txns: Array<{ id: string; narration: string | null; amount: string; type: 'credit' | 'debit'; transactionDate: string }>,
    glAccounts: GlAccount[],
    accountByCode: Map<string, GlAccount>,
    bankGlCode: string | null,
    posting: CategorizePostingService,
  ): Promise<number> {
    const withNarration = txns.filter((t) => t.narration);
    if (withNarration.length === 0) return 0;

    const glForPrompt = glAccounts.map((a) => ({ code: a.code, name: a.name, type: a.type }));
    let matched = 0;
    const batches = this.chunk(withNarration, 10);

    for (const batch of batches) {
      matched += await this.processAIBatch(batch, glForPrompt, accountByCode, bankGlCode, posting);
    }
    return matched;
  }

  private async processAIBatch(
    batch: Array<{ id: string; narration: string | null; amount: string; type: 'credit' | 'debit'; transactionDate: string }>,
    glForPrompt: Array<{ code: string; name: string; type: string }>,
    accountByCode: Map<string, GlAccount>,
    bankGlCode: string | null,
    posting: CategorizePostingService,
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

    return this.parseAndApplyAIResponse(response, batch, accountByCode, bankGlCode, posting);
  }

  private async parseAndApplyAIResponse(
    response: string,
    batch: Array<{ id: string; narration: string | null; amount: string; type: 'credit' | 'debit'; transactionDate: string }>,
    accountByCode: Map<string, GlAccount>,
    bankGlCode: string | null,
    posting: CategorizePostingService,
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

        // Post JE for high-confidence debit matches
        if (r.confidence >= 0.85 && txn.type === 'debit' && bankGlCode) {
          await posting.postBankDebit({
            transactionId: txn.id,
            transactionDate: txn.transactionDate,
            amount: parseFloat(txn.amount),
            narration: txn.narration,
            expenseAccountCode: account.code,
            bankGlAccountCode: bankGlCode,
          });
        }

        // Learn from AI categorization too
        if (r.confidence >= 0.85 && txn.narration) {
          await this.learnNarrationRule(txn.narration, account.id, txn.type);
        }

        matched++;
      }
    } catch {
      // AI returned unparseable response — skip this batch
    }
    return matched;
  }

  private async updateGlCategory(
    txnId: string,
    glAccountId: string,
    confidence: number,
  ): Promise<void> {
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
        transactionDate: bankTransactions.transactionDate,
      })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        eq(bankTransactions.bankAccountId, bankAccountId),
        isNull(bankTransactions.glAccountId),
      ))
      .limit(500);
  }

  private async fetchBankGlCode(bankAccountId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.tenantId, this.tenantId)))
      .limit(1);
    return row?.code ?? null;
  }

  private async fetchGlAccounts(): Promise<GlAccount[]> {
    return this.db
      .select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type })
      .from(accounts)
      .where(eq(accounts.tenantId, this.tenantId));
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

  private async fetchNarrationRules() {
    return this.db
      .select({
        pattern: bankNarrationRules.pattern,
        glAccountId: bankNarrationRules.glAccountId,
        autoReconcile: bankNarrationRules.autoReconcile,
        txnType: bankNarrationRules.txnType,
      })
      .from(bankNarrationRules)
      .where(eq(bankNarrationRules.tenantId, this.tenantId));
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}

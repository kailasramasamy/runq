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
import { AutoBillPayService } from './auto-bill-pay.service';
import { AutoReceiptService } from './auto-receipt.service';

interface RuleMatch {
  accountCode?: string;
  accountId?: string;
  confidence: number;
  autoReconcile?: boolean;
  vendorId?: string;
  vendorExpenseCode?: string;
  customerId?: string;
}

interface VendorInfo {
  id: string;
  name: string;
  expenseAccountCode: string | null;
}

interface CustomerInfo {
  id: string;
  name: string;
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
  // Payment-aggregator settlements are wallet recharges, not customer-AR
  // receipts. Route to "Advance from Customers" (2102) so AR isn't polluted
  // and the wallet liability is tracked correctly.
  { patterns: [/RAZORPAY/i, /PAYMENT\s+AGGREGATOR/i, /\bPG\s+SETTLEMENT/i], code: '2102', confidence: 0.95, txnType: 'credit' },
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
export function extractNarrationPattern(narration: string): string | null {
  if (!narration || narration.length < 5) return null;

  // NEFT format: "INF/NEFT/.../IFSC/PAYEE_NAME" (ICICI style)
  const neftIfsc = narration.match(/INF\/NEFT\/[^\/]+\/[A-Z]{4}\d{7}\/(.+)/i);
  if (neftIfsc) return neftIfsc[1]!.trim();

  // NEFT format: "INB/NEFT/REF/PAYEE/BANK..." (Axis outgoing)
  const neftInb = narration.match(/INB\/NEFT\/[^\/]+\/(.+?)\/(?:.*BANK|.*INDIA|.*LTD)/i);
  if (neftInb) return neftInb[1]!.trim();

  // NEFT format: "NEFT/REF/PAYEE_NAME/BANK_NAME/" (incoming NEFT)
  const neftSlash = narration.match(/^NEFT\/[^\/]+\/(.+?)\/(?:.*BANK|.*INDIA|.*LTD)/i);
  if (neftSlash) return neftSlash[1]!.trim();

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
    const [uncategorized, glAccounts, vendorList, customerList, narrationRules, bankGlCode] = await Promise.all([
      this.fetchUncategorized(bankAccountId),
      this.fetchGlAccounts(),
      this.fetchVendors(),
      this.fetchCustomers(),
      this.fetchNarrationRules(),
      this.fetchBankGlCode(bankAccountId),
    ]);

    if (uncategorized.length === 0) {
      return { categorized: 0, rulesMatched: 0, aiMatched: 0, suspensed: 0, skipped: 0 };
    }

    const accountByCode = new Map(glAccounts.map((a) => [a.code, a]));
    const posting = new CategorizePostingService(this.db, this.tenantId);
    const autoBillPay = new AutoBillPayService(this.db, this.tenantId);
    const autoReceipt = new AutoReceiptService(this.db, this.tenantId);
    let rulesMatched = 0;
    let aiMatched = 0;
    const needsAI: typeof uncategorized = [];

    for (const txn of uncategorized) {
      const match = this.applyAllRules(txn.narration, txn.type, narrationRules, vendorList, customerList);
      if (match) {
        // Vendor match on debit → auto-bill-and-pay (creates bill + payment + 2 JEs)
        if (match.vendorId && match.vendorExpenseCode && txn.type === 'debit' && bankGlCode) {
          const vendor = vendorList.find((v) => v.id === match.vendorId)!;
          const expenseGl = accountByCode.get(match.vendorExpenseCode);
          await autoBillPay.createFromBankTxn({
            bankTransactionId: txn.id,
            vendorId: match.vendorId,
            vendorName: vendor.name,
            expenseAccountCode: match.vendorExpenseCode,
            bankAccountId: bankAccountId,
            bankGlAccountCode: bankGlCode,
            amount: parseFloat(txn.amount),
            transactionDate: txn.transactionDate,
            narration: txn.narration,
            reference: txn.reference,
          });
          // Learn vendor pattern for future auto-detection
          if (txn.narration && expenseGl) {
            await this.learnNarrationRule(txn.narration, expenseGl.id, 'debit', match.vendorId);
          }
          rulesMatched++;
          continue;
        }

        // Customer match on credit → auto-receipt (creates receipt + allocates to invoice)
        if (match.customerId && txn.type === 'credit' && bankGlCode) {
          const customer = customerList.find((c) => c.id === match.customerId)!;
          await autoReceipt.createFromBankTxn({
            bankTransactionId: txn.id,
            customerId: match.customerId,
            customerName: customer.name,
            bankAccountId: bankAccountId,
            bankGlAccountCode: bankGlCode,
            amount: parseFloat(txn.amount),
            transactionDate: txn.transactionDate,
            narration: txn.narration,
            reference: txn.reference,
          });
          if (txn.narration) {
            const arGl = accountByCode.get('1103');
            if (arGl) {
              await this.learnNarrationRule(txn.narration, arGl.id, 'credit', undefined, match.customerId);
            }
          }
          rulesMatched++;
          continue;
        }

        const glAccount = match.accountId
          ? glAccounts.find((a) => a.id === match.accountId)
          : accountByCode.get(match.accountCode ?? '');
        if (glAccount) {
          const shouldPost = (match.autoReconcile ?? match.confidence >= 0.85) && bankGlCode;
          await this.updateGlCategory(txn.id, glAccount.id, match.confidence, {
            customerId: match.customerId,
          });
          if (shouldPost) {
            await this.postForTxnType(posting, txn, glAccount.code, bankGlCode);
          }
          rulesMatched++;
          continue;
        }
      }
      needsAI.push(txn);
    }

    aiMatched = await this.categorizeWithAI(needsAI, glAccounts, accountByCode, bankGlCode, posting);

    // Suspense sweep: any debit still uncategorized after rules + AI gets
    // parked in 1116 so the bank GL stays reconciled. User can re-categorize
    // later, which reverses the suspense JE and posts the correct one.
    const suspensed = await this.sweepDebitsToSuspense(needsAI, accountByCode, bankGlCode, posting);
    const skipped = needsAI.length - aiMatched - suspensed;

    return { categorized: rulesMatched + aiMatched + suspensed, rulesMatched, aiMatched, suspensed, skipped };
  }

  private async sweepDebitsToSuspense(
    needsAI: Array<{ id: string; narration: string | null; amount: string; type: 'credit' | 'debit'; transactionDate: string }>,
    accountByCode: Map<string, GlAccount>,
    bankGlCode: string | null,
    posting: CategorizePostingService,
  ): Promise<number> {
    const suspenseGl = accountByCode.get('1116');
    if (!suspenseGl || !bankGlCode) return 0;

    const debits = needsAI.filter((t) => t.type === 'debit');
    if (debits.length === 0) return 0;

    // Re-check from DB which are still uncategorized — AI may have matched some
    const stillUncategorized = await this.db
      .select({ id: bankTransactions.id })
      .from(bankTransactions)
      .where(and(
        eq(bankTransactions.tenantId, this.tenantId),
        isNull(bankTransactions.glAccountId),
      ));
    const uncategorizedIds = new Set(stillUncategorized.map((r) => r.id));

    let count = 0;
    for (const txn of debits) {
      if (!uncategorizedIds.has(txn.id)) continue;
      await posting.postBankDebitToSuspense({
        transactionId: txn.id,
        transactionDate: txn.transactionDate,
        amount: parseFloat(txn.amount),
        narration: txn.narration,
        bankGlAccountCode: bankGlCode,
      });
      await this.updateGlCategory(txn.id, suspenseGl.id, 0.0);
      count++;
    }
    return count;
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
        memo: bankTransactions.memo,
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

    // Auto-post JE for categorized transactions
    if (reconcile && txn) {
      await this.postJE(txn, glAccountId);
    }
  }

  /**
   * Public method for learning a vendor narration rule from external callers
   * (e.g., the assign-vendor endpoint).
   */
  async learnVendorRule(
    narration: string,
    glAccountId: string,
    vendorId: string,
    txnType: 'credit' | 'debit',
  ): Promise<void> {
    await this.learnNarrationRule(narration, glAccountId, txnType, vendorId);
  }

  /**
   * Look up the GL account code and bank GL code, then post a JE.
   */
  private async postJE(
    txn: { id: string; type: 'credit' | 'debit'; narration: string | null; memo?: string | null; bankAccountId: string; transactionDate: string; amount: string },
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
    // Re-categorization: reverse any prior categorize posting so the JE is
    // re-created against the new account and the txn re-linked + matched.
    // Without this, isAlreadyPosted silently skips the repost, stranding the
    // expense on the old account and leaving the txn unreconciled.
    await posting.resetCategorizePosting(txn.type, txn.id);
    await this.postForTxnType(posting, txn, glAccount.code, bankGlCode);
  }

  private async postForTxnType(
    posting: CategorizePostingService,
    txn: { id: string; type: 'credit' | 'debit'; transactionDate: string; amount: string; narration: string | null; memo?: string | null },
    glAccountCode: string,
    bankGlAccountCode: string,
  ): Promise<void> {
    const params = {
      transactionId: txn.id,
      transactionDate: txn.transactionDate,
      amount: parseFloat(txn.amount),
      narration: txn.narration,
      memo: txn.memo,
      glAccountCode,
      bankGlAccountCode,
    };
    if (txn.type === 'debit') {
      await posting.postBankDebit(params);
    } else {
      await posting.postBankCredit(params);
    }
  }

  /**
   * Extract a pattern from the narration and save it as a rule.
   * Skips if pattern already exists for this tenant.
   */
  async learnNarrationRule(
    narration: string,
    glAccountId: string,
    txnType: 'credit' | 'debit',
    vendorId?: string,
    customerId?: string,
  ): Promise<void> {
    const pattern = extractNarrationPattern(narration);
    if (!pattern || pattern.length < 3) return;

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
      vendorId: vendorId ?? null,
      customerId: customerId ?? null,
      autoReconcile: true,
      txnType,
    });
  }

  /**
   * Apply all rule sources in priority order:
   * 1. Learned vendor narration rules (pattern → vendor) → auto-bill-pay
   * 2. Vendor/customer name matching → auto-bill-pay
   * 3. Learned GL narration rules (pattern → GL account) → categorize + JE
   * 4. Hardcoded pattern rules (bank charges, salary, etc.)
   */
  private applyAllRules(
    narration: string | null,
    type: 'credit' | 'debit',
    narrationRules: { pattern: string; glAccountId: string; vendorId: string | null; customerId: string | null; autoReconcile: boolean; txnType: string | null }[],
    vendorList: VendorInfo[],
    customerList: CustomerInfo[],
  ): RuleMatch | null {
    if (!narration) return null;
    const upper = narration.toUpperCase();

    // 1. Learned vendor/customer narration rules (highest priority)
    for (const rule of narrationRules) {
      if (!rule.vendorId && !rule.customerId) continue;
      if (rule.txnType && rule.txnType !== type) continue;
      if (upper.includes(rule.pattern.toUpperCase())) {
        const vendor = rule.vendorId ? vendorList.find((v) => v.id === rule.vendorId) : undefined;
        return {
          accountId: rule.glAccountId,
          confidence: 0.95,
          autoReconcile: rule.autoReconcile,
          vendorId: rule.vendorId ?? undefined,
          vendorExpenseCode: vendor?.expenseAccountCode ?? undefined,
          customerId: rule.customerId ?? undefined,
        };
      }
    }

    // 2. Hardcoded pattern rules — checked BEFORE party-name matching so
    //    specific keywords (Razorpay, salary, bank charges) aren't
    //    accidentally pulled into a customer/vendor bucket by fuzzy substring.
    for (const rule of HARDCODED_RULES) {
      if (rule.txnType && rule.txnType !== type) continue;
      if (rule.patterns.some((p) => p.test(upper))) {
        return { accountCode: rule.code, confidence: rule.confidence };
      }
    }

    // 3. Vendor/customer name matching
    const partyMatch = this.matchPartyNames(upper, type, vendorList, customerList);
    if (partyMatch) return partyMatch;

    // 4. Learned GL narration rules (no vendor/customer)
    for (const rule of narrationRules) {
      if (rule.vendorId || rule.customerId) continue; // already handled above
      if (rule.txnType && rule.txnType !== type) continue;
      if (upper.includes(rule.pattern.toUpperCase())) {
        return { accountId: rule.glAccountId, confidence: 0.95, autoReconcile: rule.autoReconcile };
      }
    }

    return null;
  }

  private matchPartyNames(
    upper: string,
    type: 'credit' | 'debit',
    vendorList: VendorInfo[],
    customerList: CustomerInfo[],
  ): RuleMatch | null {
    if (type === 'debit') {
      const vendor = vendorList.find((v) => upper.includes(v.name.toUpperCase()));
      if (vendor) {
        return {
          accountCode: '2101',
          confidence: 0.80,
          vendorId: vendor.id,
          vendorExpenseCode: vendor.expenseAccountCode ?? undefined,
        };
      }
    }
    if (type === 'credit') {
      const customer = customerList.find((c) => upper.includes(c.name.toUpperCase()));
      if (customer) {
        return { accountCode: '1103', confidence: 0.80, customerId: customer.id };
      }
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

        // Post JE for high-confidence matches
        if (r.confidence >= 0.85 && bankGlCode) {
          await this.postForTxnType(posting, txn, account.code, bankGlCode);
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
    extra?: { vendorId?: string; customerId?: string },
  ): Promise<void> {
    await this.db
      .update(bankTransactions)
      .set({
        glAccountId,
        glConfidence: confidence.toFixed(2),
        glSuggestedAt: new Date(),
        ...(extra?.vendorId ? { vendorId: extra.vendorId } : {}),
        ...(extra?.customerId ? { customerId: extra.customerId } : {}),
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
        reference: bankTransactions.reference,
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

  private async fetchVendors(): Promise<VendorInfo[]> {
    return this.db
      .select({ id: vendors.id, name: vendors.name, expenseAccountCode: vendors.expenseAccountCode })
      .from(vendors)
      .where(eq(vendors.tenantId, this.tenantId));
  }

  private async fetchCustomers(): Promise<CustomerInfo[]> {
    return this.db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.tenantId, this.tenantId));
  }

  private async fetchNarrationRules() {
    return this.db
      .select({
        pattern: bankNarrationRules.pattern,
        glAccountId: bankNarrationRules.glAccountId,
        vendorId: bankNarrationRules.vendorId,
        customerId: bankNarrationRules.customerId,
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

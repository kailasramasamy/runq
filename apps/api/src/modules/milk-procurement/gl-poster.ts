import { and, eq, inArray } from 'drizzle-orm';
import { mpGlSettings, accounts } from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../gl/gl.service';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Default dairy GL accounts (expense-basis). Seeded by STANDARD_COA + migration
 * 0151. A tenant can override any of the four via mp_gl_settings; bank is fixed
 * to Cash at Bank. Mirrors InventoryGlPoster's hardcoded-code approach, but
 * resolves overrides first so the config UI is meaningful.
 */
const DEFAULT_CODES = {
  milkPurchases: '5050',
  commissionExpense: '5060',
  farmerPayable: '2150',
  farmerAdvances: '1150',
  feedLoans: '1151',
  bank: '1101',
} as const;

type Codes = Record<keyof typeof DEFAULT_CODES, string>;
type Line = { accountCode: string; debit?: number; credit?: number; description?: string };

/**
 * Posts the milk-procurement payout flow to the GL (P1.1, expense-basis):
 *   • grant   — advance/feed-loan given:  Dr Advances|Feed-Loans / Cr Bank
 *   • accrual — cycle lock:               Dr Milk Purchases / Cr Payable + Advances + Feed-Loans
 *   • payment — cycle pay:                Dr Farmer Payable / Cr Bank
 *   • bill milk — VMCC bill pay:          Dr Farmer Payable / Cr Bank
 *   • bill commission — VMCC bill pay:    Dr Commission Expense / Cr Bank
 * All entries are balanced and keyed by (sourceType, sourceId) for trail + idempotency.
 */
export class MpGlPoster {
  constructor(
    private readonly tenantId: string,
    private readonly userId?: string,
  ) {}

  /** advance_given / feed_loan_given → cash out, creating the farmer receivable. */
  async postGrant(
    tx: Tx, p: { ledgerId: string; date: string; kind: 'advance' | 'feed_loan'; amount: number },
  ): Promise<string> {
    const c = await this.resolveCodes(tx);
    const asset = p.kind === 'feed_loan' ? c.feedLoans : c.farmerAdvances;
    const label = p.kind === 'feed_loan' ? 'Cattle-feed loan' : 'Farmer advance';
    return this.post(tx, {
      date: p.date, description: `${label} disbursed`,
      sourceType: 'mp_farmer_ledger', sourceId: p.ledgerId,
      lines: [
        { accountCode: asset, debit: round2(p.amount), description: label },
        { accountCode: c.bank, credit: round2(p.amount), description: 'Cash / bank' },
      ],
    });
  }

  /** Cycle lock accrual. gross is derived from the credits so it always balances. */
  async postAccrual(
    tx: Tx,
    p: { cycleId: string; cycleNo: string; date: string; net: number; advance: number; feedLoan: number },
  ): Promise<string> {
    const c = await this.resolveCodes(tx);
    const net = round2(p.net), advance = round2(p.advance), feedLoan = round2(p.feedLoan);
    const gross = round2(net + advance + feedLoan);
    const lines: Line[] = [
      { accountCode: c.milkPurchases, debit: gross, description: `Milk purchases — ${p.cycleNo}` },
    ];
    if (net > 0) lines.push({ accountCode: c.farmerPayable, credit: net, description: 'Net payable to farmers' });
    if (advance > 0) lines.push({ accountCode: c.farmerAdvances, credit: advance, description: 'Advance recovered' });
    if (feedLoan > 0) lines.push({ accountCode: c.feedLoans, credit: feedLoan, description: 'Feed loan recovered' });
    return this.post(tx, {
      date: p.date, description: `Milk procurement payout — ${p.cycleNo}`,
      sourceType: 'mp_payout_cycle', sourceId: p.cycleId, lines,
    });
  }

  /**
   * Signed adjustment to a locked cycle's accrual after unpaid lines are rebuilt
   * (milk corrected). Each leg posts on its natural side for a positive delta and
   * the opposite side for a negative one. Balances because gross = net + advance
   * + feed. Keyed separately from the original accrual. Null if no change.
   */
  async postAccrualDelta(
    tx: Tx,
    p: { cycleId: string; cycleNo: string; date: string; gross: number; net: number; advance: number; feedLoan: number },
  ): Promise<string | null> {
    const c = await this.resolveCodes(tx);
    const lines: Line[] = [];
    const put = (accountCode: string, amt: number, naturalDebit: boolean, description: string) => {
      const a = round2(amt);
      if (a === 0) return;
      const onDebit = naturalDebit ? a > 0 : a < 0;
      lines.push(onDebit ? { accountCode, debit: Math.abs(a), description } : { accountCode, credit: Math.abs(a), description });
    };
    put(c.milkPurchases, p.gross, true, 'Milk purchases adjustment');
    put(c.farmerPayable, p.net, false, 'Net payable adjustment');
    put(c.farmerAdvances, p.advance, false, 'Advance recovered adjustment');
    put(c.feedLoans, p.feedLoan, false, 'Feed loan recovered adjustment');
    if (!lines.length) return null;
    return this.post(tx, {
      date: p.date, description: `Milk payout adjustment — ${p.cycleNo}`,
      sourceType: 'mp_payout_cycle_adjust', sourceId: p.cycleId, lines,
    });
  }

  /** Cycle pay → cash disbursed, settling the payable. Returns null if nothing paid. */
  async postPayment(
    tx: Tx, p: { cycleId: string; cycleNo: string; date: string; amount: number },
  ): Promise<string | null> {
    const amount = round2(p.amount);
    if (amount <= 0) return null;
    const c = await this.resolveCodes(tx);
    return this.post(tx, {
      date: p.date, description: `Milk payout disbursed — ${p.cycleNo}`,
      sourceType: 'mp_payout_payment', sourceId: p.cycleId,
      lines: [
        { accountCode: c.farmerPayable, debit: amount, description: 'Farmer payable settled' },
        { accountCode: c.bank, credit: amount, description: 'Cash / bank' },
      ],
    });
  }

  /**
   * VMCC bill — milk-cost leg. Settles the payable already accrued at cycle lock
   * (no re-expense): Dr Farmer Payable / Cr Bank. Distinct sourceType keeps it
   * apart from the cycle-level payment JE. Returns null if nothing to settle.
   */
  async postBillMilkPayment(
    tx: Tx, p: { billId: string; billNo: string; date: string; amount: number },
  ): Promise<string | null> {
    const amount = round2(p.amount);
    if (amount <= 0) return null;
    const c = await this.resolveCodes(tx);
    return this.post(tx, {
      date: p.date, description: `VMCC bill milk settled — ${p.billNo}`,
      sourceType: 'mp_vmcc_bill_payment', sourceId: p.billId,
      lines: [
        { accountCode: c.farmerPayable, debit: amount, description: 'Farmer payable settled' },
        { accountCode: c.bank, credit: amount, description: 'Cash / bank' },
      ],
    });
  }

  /**
   * VMCC bill — commission leg (commission + salary + rent). Never accrued at
   * lock, so this JE both accrues and settles it: Dr Commission Expense / Cr Bank.
   */
  async postBillCommission(
    tx: Tx, p: { billId: string; billNo: string; date: string; amount: number },
  ): Promise<string | null> {
    const amount = round2(p.amount);
    if (amount <= 0) return null;
    const c = await this.resolveCodes(tx);
    return this.post(tx, {
      date: p.date, description: `VMCC commission — ${p.billNo}`,
      sourceType: 'mp_vmcc_bill_commission', sourceId: p.billId,
      lines: [
        { accountCode: c.commissionExpense, debit: amount, description: 'VMCC commission & handling' },
        { accountCode: c.bank, credit: amount, description: 'Cash / bank' },
      ],
    });
  }

  /**
   * Reverse a VMCC bill: post the inverse of the milk + commission legs. Keyed
   * on (mp_vmcc_bill_reversal, billId) — the distinct sourceType keeps it apart
   * from the original legs while staying auditable to the same bill.
   */
  async postBillReversal(
    tx: Tx, p: { billId: string; billNo: string; date: string; milkCost: number; commission: number },
  ): Promise<string | null> {
    const milk = round2(p.milkCost), commission = round2(p.commission);
    if (milk <= 0 && commission <= 0) return null;
    const c = await this.resolveCodes(tx);
    const lines: Line[] = [];
    if (milk > 0) {
      lines.push({ accountCode: c.farmerPayable, credit: milk, description: 'Farmer payable re-opened' });
      lines.push({ accountCode: c.bank, debit: milk, description: 'Cash / bank' });
    }
    if (commission > 0) {
      lines.push({ accountCode: c.commissionExpense, credit: commission, description: 'VMCC commission reversed' });
      lines.push({ accountCode: c.bank, debit: commission, description: 'Cash / bank' });
    }
    return this.post(tx, {
      date: p.date, description: `VMCC bill reversed — ${p.billNo}`,
      sourceType: 'mp_vmcc_bill_reversal', sourceId: p.billId, lines,
    });
  }

  /**
   * Direct-mode per-farmer settlement: Dr Farmer Payable / Cr Bank (settles the
   * lock accrual for that farmer). `reverse` flips the legs. Keyed by the line.
   */
  async postFarmerPayment(
    tx: Tx, p: { lineId: string; date: string; amount: number; reverse?: boolean },
  ): Promise<string | null> {
    const amount = round2(p.amount);
    if (amount <= 0) return null;
    const c = await this.resolveCodes(tx);
    const payable = { accountCode: c.farmerPayable, description: 'Farmer payable' };
    const bank = { accountCode: c.bank, description: 'Cash / bank' };
    return this.post(tx, {
      date: p.date, description: `Farmer payout ${p.reverse ? 'reversed' : 'settled'}`,
      sourceType: p.reverse ? 'mp_payout_line_reversal' : 'mp_payout_line_payment', sourceId: p.lineId,
      lines: p.reverse
        ? [{ ...payable, credit: amount }, { ...bank, debit: amount }]
        : [{ ...payable, debit: amount }, { ...bank, credit: amount }],
    });
  }

  /**
   * Direct-mode operator settlement: Dr Commission Expense / Cr Bank for the
   * operator's comp (commission + salary + rent). `reverse` flips the legs.
   */
  async postOperatorPayment(
    tx: Tx, p: { payoutId: string; date: string; amount: number; reverse?: boolean },
  ): Promise<string | null> {
    const amount = round2(p.amount);
    if (amount <= 0) return null;
    const c = await this.resolveCodes(tx);
    const expense = { accountCode: c.commissionExpense, description: 'VMCC operator commission & salary' };
    const bank = { accountCode: c.bank, description: 'Cash / bank' };
    return this.post(tx, {
      date: p.date, description: `Operator payout ${p.reverse ? 'reversed' : 'settled'}`,
      sourceType: p.reverse ? 'mp_operator_payout_reversal' : 'mp_operator_payout', sourceId: p.payoutId,
      lines: p.reverse
        ? [{ ...expense, credit: amount }, { ...bank, debit: amount }]
        : [{ ...expense, debit: amount }, { ...bank, credit: amount }],
    });
  }

  /** Resolve effective account codes: mp_gl_settings override → default code. */
  private async resolveCodes(tx: Tx): Promise<Codes> {
    const [s] = await tx.select({
      milk: mpGlSettings.milkPurchaseAccountId,
      commission: mpGlSettings.commissionExpenseAccountId,
      payable: mpGlSettings.farmerPayableAccountId,
      advance: mpGlSettings.advanceAccountId,
      feed: mpGlSettings.feedLoanAccountId,
    }).from(mpGlSettings).where(eq(mpGlSettings.tenantId, this.tenantId));
    const ids = [s?.milk, s?.commission, s?.payable, s?.advance, s?.feed].filter(Boolean) as string[];
    const codeById = new Map<string, string>();
    if (ids.length) {
      const rows = await tx.select({ id: accounts.id, code: accounts.code }).from(accounts)
        .where(and(eq(accounts.tenantId, this.tenantId), inArray(accounts.id, ids)));
      for (const r of rows) codeById.set(r.id, r.code);
    }
    const pick = (id: string | null | undefined, def: string) => (id && codeById.get(id)) || def;
    return {
      milkPurchases: pick(s?.milk, DEFAULT_CODES.milkPurchases),
      commissionExpense: pick(s?.commission, DEFAULT_CODES.commissionExpense),
      farmerPayable: pick(s?.payable, DEFAULT_CODES.farmerPayable),
      farmerAdvances: pick(s?.advance, DEFAULT_CODES.farmerAdvances),
      feedLoans: pick(s?.feed, DEFAULT_CODES.feedLoans),
      bank: DEFAULT_CODES.bank,
    };
  }

  private async post(
    tx: Tx, params: { date: string; description: string; sourceType: string; sourceId: string; lines: Line[] },
  ): Promise<string> {
    // GLService accepts a tx at runtime (same surface); its ctor is typed to Db.
    const gl = new GLService(tx as unknown as Db, this.tenantId);
    const je = await gl.createJournalEntry({ ...params, createdBy: this.userId });
    return je.id;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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

  /** Resolve effective account codes: mp_gl_settings override → default code. */
  private async resolveCodes(tx: Tx): Promise<Codes> {
    const [s] = await tx.select({
      milk: mpGlSettings.milkPurchaseAccountId,
      payable: mpGlSettings.farmerPayableAccountId,
      advance: mpGlSettings.advanceAccountId,
      feed: mpGlSettings.feedLoanAccountId,
    }).from(mpGlSettings).where(eq(mpGlSettings.tenantId, this.tenantId));
    const ids = [s?.milk, s?.payable, s?.advance, s?.feed].filter(Boolean) as string[];
    const codeById = new Map<string, string>();
    if (ids.length) {
      const rows = await tx.select({ id: accounts.id, code: accounts.code }).from(accounts)
        .where(and(eq(accounts.tenantId, this.tenantId), inArray(accounts.id, ids)));
      for (const r of rows) codeById.set(r.id, r.code);
    }
    const pick = (id: string | null | undefined, def: string) => (id && codeById.get(id)) || def;
    return {
      milkPurchases: pick(s?.milk, DEFAULT_CODES.milkPurchases),
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

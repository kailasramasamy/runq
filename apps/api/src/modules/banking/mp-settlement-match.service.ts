import { sql, eq, and } from 'drizzle-orm';
import { bankTransactions, reconciliationMatches, accounts } from '@runq/db';
import type { Db } from '@runq/db';

const MATCH_DATE_WINDOW_DAYS = 5;
/** NEFTs go out in whole rupees while bills carry paise (₹58,119.35 → ₹58,119). */
const AMOUNT_TOLERANCE = 1;
const FARMER_PAYABLE_CODE = '2150';

export interface MpSettlement {
  kind: 'bill' | 'line';
  id: string;
  amount: number;
  date: string;
  journalEntryId: string;
  paymentId: string | null;
  vendorId: string | null;
}

export interface BankDebit {
  id: string;
  amount: string;
  transactionDate: string;
  vendorId?: string | null;
}

/**
 * Milk payouts (VMCC bills, direct farmer lines) post their own cash JE
 * (Dr Farmer Payable / Cr Bank) when marked paid. The NEFT that lands in the
 * bank statement later is the same money — categorizing it as an expense
 * books the milk a second time and drains the bank GL twice. This links such
 * a debit to the settlement JE instead of posting anything new.
 */
export class MpSettlementMatchService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** Bank-paid settlements no bank line points at yet. */
  async loadUnlinked(): Promise<MpSettlement[]> {
    const res = await this.db.execute(sql`
      SELECT * FROM (
      SELECT 'bill' AS kind, b.id, b.total_amount AS amount, b.payment_date::text AS date,
             COALESCE(b.milk_journal_entry_id, b.commission_journal_entry_id) AS journal_entry_id,
             b.payment_id, b.payee_vendor_id AS vendor_id
      FROM mp_vmcc_bills b
      WHERE b.tenant_id = ${this.tenantId} AND b.status = 'paid' AND b.payment_date IS NOT NULL
        AND COALESCE(b.payment_mode, 'bank_transfer') <> 'cash'
        AND COALESCE(b.milk_journal_entry_id, b.commission_journal_entry_id) IS NOT NULL
      UNION ALL
      SELECT 'line', l.id, l.net_amount, l.payment_date::text, l.journal_entry_id, l.payment_id, NULL
      FROM mp_payout_lines l
      WHERE l.tenant_id = ${this.tenantId} AND l.paid_at IS NOT NULL AND l.bill_id IS NULL
        AND l.payment_date IS NOT NULL AND l.journal_entry_id IS NOT NULL
        AND COALESCE(l.payment_mode, 'bank_transfer') <> 'cash'
      ) s
      WHERE NOT EXISTS (SELECT 1 FROM bank_transactions bt
                        WHERE bt.tenant_id = ${this.tenantId} AND bt.journal_entry_id = s.journal_entry_id)
        AND NOT EXISTS (SELECT 1 FROM reconciliation_matches rm WHERE rm.payment_id = s.payment_id)
    `);
    const rows = (res as { rows?: Record<string, string | null>[] }).rows ?? [];
    return rows.map((r) => ({
      kind: r.kind as MpSettlement['kind'],
      id: r.id!,
      amount: parseFloat(r.amount!),
      date: r.date!,
      journalEntryId: r.journal_entry_id!,
      paymentId: r.payment_id,
      vendorId: r.vendor_id,
    }));
  }

  /**
   * The closest settlement within ±₹1 / ±5 days. A same-vendor candidate wins;
   * otherwise only an unambiguous single candidate is taken — bank import has
   * tagged one VMCC's NEFT to another's vendor, so vendor can't be required.
   */
  pick(txn: BankDebit, pool: MpSettlement[], used: Set<string>): MpSettlement | null {
    const amount = parseFloat(txn.amount);
    const txnDay = Date.parse(txn.transactionDate);
    const gap = (s: MpSettlement) => Math.abs(Date.parse(s.date) - txnDay) / 86_400_000;
    const candidates = pool
      .filter((s) => !used.has(s.id) && Math.abs(s.amount - amount) < AMOUNT_TOLERANCE && gap(s) <= MATCH_DATE_WINDOW_DAYS)
      .sort((a, b) => gap(a) - gap(b));
    const sameVendor = txn.vendorId ? candidates.find((s) => s.vendorId === txn.vendorId) : undefined;
    if (sameVendor) return sameVendor;
    return candidates.length === 1 ? candidates[0]! : null;
  }

  /** Point the bank line at the settlement JE and mark it reconciled. */
  async link(txnId: string, s: MpSettlement): Promise<void> {
    const [payable] = await this.db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), eq(accounts.code, FARMER_PAYABLE_CODE))).limit(1);
    await this.db.transaction(async (tx) => {
      await tx.insert(reconciliationMatches).values({
        tenantId: this.tenantId,
        bankTransactionId: txnId,
        paymentId: s.paymentId,
        journalEntryId: s.journalEntryId,
        matchType: 'auto_amount_date',
      });
      await tx.update(bankTransactions)
        .set({
          journalEntryId: s.journalEntryId,
          glAccountId: payable?.id ?? null,
          ...(s.vendorId ? { vendorId: s.vendorId } : {}),
          reconStatus: 'matched',
          updatedAt: new Date(),
        })
        .where(and(eq(bankTransactions.id, txnId), eq(bankTransactions.tenantId, this.tenantId)));
    });
  }

  /** Link every debit with a settlement match; returns the ids it consumed. */
  async matchDebits(debits: BankDebit[]): Promise<Set<string>> {
    const matched = new Set<string>();
    if (debits.length === 0) return matched;
    const pool = await this.loadUnlinked();
    const used = new Set<string>();
    for (const txn of debits) {
      const s = this.pick(txn, pool, used);
      if (!s) continue;
      used.add(s.id);
      await this.link(txn.id, s);
      matched.add(txn.id);
    }
    return matched;
  }
}

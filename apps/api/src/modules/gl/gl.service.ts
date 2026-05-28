import { eq, and, sql, lte, sum, inArray, desc } from 'drizzle-orm';
import {
  accounts,
  journalEntries,
  journalLines,
  journalSequences,
  inventoryGrns,
  inventoryGrnLines,
  items,
  purchaseInvoices,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { Account, JournalEntry, JournalEntryWithLines, TrialBalanceRow } from '@runq/types';
import type { CreateAccountInput, UpdateAccountInput, CreateJournalEntryInput, JournalEntryFilter } from '@runq/validators';
import { applyPagination, calcTotalPages } from '@runq/db';
import type { PaginationMeta } from '@runq/types';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { toNumber } from '../../utils/decimal';
import { enforceLockDate } from '../../utils/lock-date';
import {
  inventoryAccountFor,
  DEFAULT_EXPENSE_ACCOUNT_CODE,
} from './inventory-accounts';

/**
 * GR/IR (Goods Received / Invoice Received) clearing account. Same as
 * `INV_ACCOUNTS.GR_IR_CLEARING` in `inventory/gl-poster.ts`. The
 * inventory poster credits this on GRN post (Dr Inventory / Cr GR/IR);
 * PP Phase 3 debits this on matched-bill post (Dr GR/IR / Cr AP).
 *
 * Hard-coded to `2115` for v1 — matches the inventory poster's choice.
 * Per-tenant override (and a CoA seed if missing) is a Phase 5 polish.
 */
const GRNI_CLEARING_ACCOUNT_CODE = '2115';

export interface JournalEntryListResult {
  data: JournalEntry[];
  meta: PaginationMeta;
}

export class GLService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async listAccounts(): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.tenantId, this.tenantId))
      .orderBy(accounts.code);
    return rows.map(this.toAccount);
  }

  async createAccount(data: CreateAccountInput): Promise<Account> {
    const parentId = await this.resolveParentId(data.parentId);

    const [row] = await this.db
      .insert(accounts)
      .values({
        tenantId: this.tenantId,
        code: data.code,
        name: data.name,
        type: data.type,
        parentId: parentId ?? null,
        description: data.description ?? null,
      })
      .returning();

    return this.toAccount(row!);
  }

  async updateAccount(id: string, data: UpdateAccountInput): Promise<Account> {
    const [existing] = await this.db
      .select({ isSystemAccount: accounts.isSystemAccount })
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.tenantId, this.tenantId)))
      .limit(1);

    if (!existing) throw new NotFoundError('Account');
    if (existing.isSystemAccount && data.isActive === false) {
      throw new ConflictError('System accounts cannot be deactivated');
    }

    const [row] = await this.db
      .update(accounts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.tenantId, this.tenantId)))
      .returning();

    return this.toAccount(row!);
  }

  async createJournalEntry(params: CreateJournalEntryInput & { createdBy?: string }): Promise<JournalEntry> {
    await enforceLockDate(this.db, this.tenantId, params.date);
    this.validateLines(params.lines);

    return this.db.transaction(async (tx) => {
      const accountMap = await this.resolveAccountCodes(tx, params.lines.map((l) => l.accountCode));
      const entryNumber = await this.nextEntryNumber(tx);
      const totalDebit = params.lines.reduce((s, l) => s + (l.debit ?? 0), 0);

      const [entry] = await tx
        .insert(journalEntries)
        .values({
          tenantId: this.tenantId,
          entryNumber,
          date: params.date,
          description: params.description,
          sourceType: params.sourceType ?? null,
          sourceId: params.sourceId ?? null,
          totalDebit: String(totalDebit),
          totalCredit: String(totalDebit), // balanced by validation
          createdBy: params.createdBy ?? null,
        })
        .returning();

      await tx.insert(journalLines).values(
        params.lines.map((l) => ({
          tenantId: this.tenantId,
          journalEntryId: entry!.id,
          accountId: accountMap.get(l.accountCode)!,
          debit: String(l.debit ?? 0),
          credit: String(l.credit ?? 0),
          description: l.description ?? null,
        })),
      );

      return this.toJournalEntry(entry!);
    });
  }

  async getJournalEntry(id: string): Promise<JournalEntryWithLines> {
    const [entry] = await this.db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, id), eq(journalEntries.tenantId, this.tenantId)))
      .limit(1);

    if (!entry) throw new NotFoundError('JournalEntry');

    const lines = await this.db
      .select({ line: journalLines, account: accounts })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(and(eq(journalLines.journalEntryId, id), eq(journalLines.tenantId, this.tenantId)));

    return {
      ...this.toJournalEntry(entry),
      lines: lines.map((r) => ({
        id: r.line.id,
        accountId: r.line.accountId,
        accountCode: r.account.code,
        accountName: r.account.name,
        debit: toNumber(r.line.debit),
        credit: toNumber(r.line.credit),
        description: r.line.description ?? null,
      })),
    };
  }

  async listJournalEntries(
    filters: JournalEntryFilter,
    pagination: { page: number; limit: number },
  ): Promise<JournalEntryListResult> {
    const { offset } = applyPagination(pagination.page, pagination.limit);
    const where = this.buildJeWhere(filters);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(journalEntries).where(where).orderBy(desc(journalEntries.createdAt)).limit(pagination.limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(journalEntries).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map(this.toJournalEntry),
      meta: { page: pagination.page, limit: pagination.limit, total, totalPages: calcTotalPages(total, pagination.limit) },
    };
  }

  async getAccountBalance(accountId: string, asOfDate?: string): Promise<number> {
    const [acct] = await this.db.select({ type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, this.tenantId)))
      .limit(1);

    if (!acct) throw new NotFoundError('Account');

    const where = asOfDate
      ? and(eq(journalLines.accountId, accountId), eq(journalEntries.tenantId, this.tenantId), lte(journalEntries.date, asOfDate))
      : and(eq(journalLines.accountId, accountId), eq(journalEntries.tenantId, this.tenantId));

    const [result] = await this.db
      .select({ totalDebit: sum(journalLines.debit), totalCredit: sum(journalLines.credit) })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(where);

    const dr = toNumber(result?.totalDebit ?? '0');
    const cr = toNumber(result?.totalCredit ?? '0');
    const isDebitNormal = acct.type === 'asset' || acct.type === 'expense';
    return isDebitNormal ? dr - cr : cr - dr;
  }

  async getTrialBalance(asOfDate?: string): Promise<TrialBalanceRow[]> {
    const where = asOfDate ? lte(journalEntries.date, asOfDate) : undefined;

    const rows = await this.db
      .select({
        accountId: accounts.id,
        accountCode: accounts.code,
        accountName: accounts.name,
        accountType: accounts.type,
        totalDebit: sum(journalLines.debit),
        totalCredit: sum(journalLines.credit),
      })
      .from(accounts)
      .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
      .leftJoin(journalEntries, and(eq(journalLines.journalEntryId, journalEntries.id), ...(where ? [where] : [])))
      .where(eq(accounts.tenantId, this.tenantId))
      .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
      .orderBy(accounts.code);

    return rows.map((r) => {
      const dr = toNumber(r.totalDebit ?? '0');
      const cr = toNumber(r.totalCredit ?? '0');
      const isDebitNormal = r.accountType === 'asset' || r.accountType === 'expense';
      const balance = isDebitNormal ? dr - cr : cr - dr;
      return { accountCode: r.accountCode, accountName: r.accountName, accountType: r.accountType, debit: dr, credit: cr, balance };
    });
  }

  // ─── Auto-posting helpers ────────────────────────────────────────────────

  async postPayment(payment: { amount: number; date: string; id: string; vendorName: string; bankAccountCode?: string }): Promise<void> {
    if (await this.isAlreadyPosted('payment', payment.id)) return;
    await this.createJournalEntry({
      date: payment.date,
      description: `Payment to ${payment.vendorName}`,
      sourceType: 'payment',
      sourceId: payment.id,
      lines: [
        { accountCode: '2101', debit: payment.amount },
        { accountCode: payment.bankAccountCode ?? '1101', credit: payment.amount },
      ],
    });
  }

  /**
   * Vendor advance payment — money out before the bill arrives. Sits in
   * 1104 Advance to Suppliers until applied to a real bill via
   * `postAdvanceApplication`.
   */
  async postVendorAdvance(payment: { amount: number; date: string; id: string; vendorName: string; bankAccountCode?: string }): Promise<void> {
    if (await this.isAlreadyPosted('payment', payment.id)) return;
    await this.createJournalEntry({
      date: payment.date,
      description: `Advance to ${payment.vendorName}`,
      sourceType: 'payment',
      sourceId: payment.id,
      lines: [
        { accountCode: '1104', debit: payment.amount },
        { accountCode: payment.bankAccountCode ?? '1101', credit: payment.amount },
      ],
    });
  }

  /**
   * Apply vendor advances against a newly-created bill. Moves the advance
   * out of 1104 and into AP, where the bill's CR sits — they offset, leaving
   * only the residual bill balance in AP.
   */
  async postAdvanceApplication(application: { amount: number; date: string; billId: string; vendorName: string }): Promise<void> {
    await this.createJournalEntry({
      date: application.date,
      description: `Apply advance to bill — ${application.vendorName}`,
      sourceType: 'advance_application',
      sourceId: application.billId,
      lines: [
        { accountCode: '2101', debit: application.amount },
        { accountCode: '1104', credit: application.amount },
      ],
    });
  }

  async postReceipt(receipt: { amount: number; date: string; id: string; customerName: string }): Promise<void> {
    if (await this.isAlreadyPosted('receipt', receipt.id)) return;
    await this.createJournalEntry({
      date: receipt.date,
      description: `Receipt from ${receipt.customerName}`,
      sourceType: 'receipt',
      sourceId: receipt.id,
      lines: [
        { accountCode: '1101', debit: receipt.amount },
        { accountCode: '1103', credit: receipt.amount },
      ],
    });
  }

  /**
   * Wallet receipt — settles AR against the customer-wallet liability
   * (2102 Advance from Customers) instead of cash. Used for prepaid /
   * stored-value purchases where the bank credit was already booked
   * earlier as a wallet recharge.
   */
  async postWalletReceipt(receipt: { amount: number; date: string; id: string; customerName: string }): Promise<void> {
    if (await this.isAlreadyPosted('receipt', receipt.id)) return;
    await this.createJournalEntry({
      date: receipt.date,
      description: `Wallet receipt from ${receipt.customerName}`,
      sourceType: 'receipt',
      sourceId: receipt.id,
      lines: [
        { accountCode: '2102', debit: receipt.amount },
        { accountCode: '1103', credit: receipt.amount },
      ],
    });
  }

  async postPurchaseInvoice(invoice: {
    totalAmount: number; date: string; id: string; vendorName: string;
    invoiceNumber?: string; expenseAccountCode?: string;
    /**
     * AP Pattern-B: when set, the bill has goods-received items recorded
     * against this inventory GRN. The JE splits debits per item-class
     * inventory account, with the residual going to expense. Caller MUST
     * have already inserted the GRN + its lines in the same transaction.
     */
     linkedInventoryGrnId?: string | null;
    /**
     * PP Phase 3: when set, the bill has been matched to a PO whose
     * GRN(s) already posted Dr Inventory / Cr GRNI. The bill's JE then
     * clears GRNI instead of touching Inventory again — Dr GRNI / Cr AP.
     * Mutually exclusive with the linkedInventoryGrnId split path: a
     * single bill is either inline-GRN (no PO) OR PO-matched.
     */
     matchedPoId?: string | null;
  }): Promise<void> {
    if (await this.isAlreadyPosted('purchase_invoice', invoice.id)) return;

    const descPrefix = invoice.invoiceNumber
      ? `${invoice.vendorName} — ${invoice.invoiceNumber}`
      : invoice.vendorName;

    // PP Phase 3: matched-to-PO path takes precedence. Clears the GRNI
    // that the PO-receive flow accrued (ex-tax) and books input GST on
    // the same JE — GST credit follows the bill, not the GRN, so this is
    // the first time the ITC accounts are touched for the goods value.
    //
    //   Dr GRNI          = subtotal (clears what GRN credited)
    //   Dr Input CGST    = cgst       (intra-state)
    //   Dr Input SGST    = sgst       (intra-state)
    //   Dr Input IGST    = igst       (inter-state)
    //   Cr Vendor AP     = totalAmount
    //
    // Inventory was already debited at GRN post time — don't double-count.
    if (invoice.matchedPoId) {
      const [taxRow] = await this.db
        .select({
          subtotal: purchaseInvoices.subtotal,
          cgstAmount: purchaseInvoices.cgstAmount,
          sgstAmount: purchaseInvoices.sgstAmount,
          igstAmount: purchaseInvoices.igstAmount,
        })
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, invoice.id))
        .limit(1);
      // For invoices created without a tax breakdown (legacy / synced
      // bills with only totalAmount), fall back to the old single-line
      // behaviour so we don't post an unbalanced JE.
      const subtotal = taxRow ? Number(taxRow.subtotal) : invoice.totalAmount;
      const cgst = taxRow ? Number(taxRow.cgstAmount) : 0;
      const sgst = taxRow ? Number(taxRow.sgstAmount) : 0;
      const igst = taxRow ? Number(taxRow.igstAmount) : 0;

      const lines: CreateJournalEntryInput['lines'] = [
        {
          accountCode: GRNI_CLEARING_ACCOUNT_CODE,
          debit: subtotal,
          description: `${descPrefix} — clear GRNI (matched PO)`,
        },
      ];
      if (cgst > 0) lines.push({ accountCode: '1105', debit: cgst, description: `${descPrefix} — Input CGST` });
      if (sgst > 0) lines.push({ accountCode: '1106', debit: sgst, description: `${descPrefix} — Input SGST` });
      if (igst > 0) lines.push({ accountCode: '1107', debit: igst, description: `${descPrefix} — Input IGST` });
      lines.push({
        accountCode: '2101',
        credit: invoice.totalAmount,
        description: `${descPrefix} — payable`,
      });

      await this.createJournalEntry({
        date: invoice.date,
        description: `Purchase invoice from ${invoice.vendorName}`,
        sourceType: 'purchase_invoice',
        sourceId: invoice.id,
        lines,
      });
      return;
    }

    // No GRN linked → legacy flat behaviour. Zero regression for service
    // bills, bills synced from ops modules without item linkage, etc.
    if (!invoice.linkedInventoryGrnId) {
      await this.createJournalEntry({
        date: invoice.date,
        description: `Purchase invoice from ${invoice.vendorName}`,
        sourceType: 'purchase_invoice',
        sourceId: invoice.id,
        lines: [
          {
            accountCode: invoice.expenseAccountCode ?? DEFAULT_EXPENSE_ACCOUNT_CODE,
            debit: invoice.totalAmount,
            description: `${descPrefix} — purchase`,
          },
          {
            accountCode: '2101',
            credit: invoice.totalAmount,
            description: `${descPrefix} — payable`,
          },
        ],
      });
      return;
    }

    // GRN linked → per-line routing. Sum GRN line value per item class.
    const grnRows = await this.db
      .select({
        amount: sql<string>`COALESCE(${inventoryGrnLines.qty}::numeric * (${inventoryGrnLines.unitRate}::numeric + ${inventoryGrnLines.landedCostPerUnit}::numeric), 0)`,
        itemClass: items.itemClass,
      })
      .from(inventoryGrnLines)
      .innerJoin(items, eq(items.id, inventoryGrnLines.itemId))
      .where(and(
        eq(inventoryGrnLines.tenantId, this.tenantId),
        eq(inventoryGrnLines.grnId, invoice.linkedInventoryGrnId),
      ));

    const inventoryDebits = new Map<string, number>();
    let grnTotal = 0;
    for (const row of grnRows) {
      const amt = Number(row.amount);
      const acc = inventoryAccountFor(row.itemClass);
      inventoryDebits.set(acc, (inventoryDebits.get(acc) ?? 0) + amt);
      grnTotal += amt;
    }

    // Expense residual covers tax, freight, rounding, anything on the
    // bill not captured by goods-received lines. Negative residual is
    // impossible by construction (UI caps received qty/value at bill
    // total) so a tiny negative implies floating-point drift — clamp.
    const expenseDebit = Math.max(0, Math.round((invoice.totalAmount - grnTotal) * 100) / 100);

    const lines: CreateJournalEntryInput['lines'] = [];
    for (const [acc, amt] of inventoryDebits) {
      lines.push({
        accountCode: acc,
        debit: Math.round(amt * 100) / 100,
        description: `${descPrefix} — inventory`,
      });
    }
    if (expenseDebit > 0) {
      lines.push({
        accountCode: invoice.expenseAccountCode ?? DEFAULT_EXPENSE_ACCOUNT_CODE,
        debit: expenseDebit,
        description: `${descPrefix} — expense / freight`,
      });
    }
    lines.push({
      accountCode: '2101',
      credit: invoice.totalAmount,
      description: `${descPrefix} — payable`,
    });

    const entry = await this.createJournalEntry({
      date: invoice.date,
      description: `Purchase invoice from ${invoice.vendorName}`,
      sourceType: 'purchase_invoice',
      sourceId: invoice.id,
      lines,
    });

    // AP Pattern-B (Step 7 follow-up): backlink the inline-from-bill GRN
    // to this bill's JE. Lets inventory drill-throughs land on the
    // unified bill JE instead of NULL. Skipped when no GRN is linked.
    await this.db
      .update(inventoryGrns)
      .set({ journalEntryId: entry.id })
      .where(and(
        eq(inventoryGrns.id, invoice.linkedInventoryGrnId),
        eq(inventoryGrns.tenantId, this.tenantId),
      ));

    // Backlink stock_ledger movements to the JE too — same pattern as
    // GrnService.post() does for direct GRNs. Lets trial-balance and
    // ledger-by-JE reports walk back from a JE line to the qty change.
    await this.db.execute(sql`
      UPDATE stock_ledger SET journal_entry_id = ${entry.id}
      WHERE tenant_id = ${this.tenantId}
        AND source_type = 'inventory_grn'
        AND source_id = ${invoice.linkedInventoryGrnId}
    `);
  }

  /**
   * Reverses a previously-posted source's journal entry by physically
   * deleting it. Used by amend-after-send / delete-after-send flows where
   * the right outcome is "as if it never happened" (no payment was ever
   * received, so there are no downstream postings to preserve). Returns
   * the number of entries removed — caller can decide whether to no-op
   * when nothing was posted.
   */
  async deletePostingsFor(sourceType: string, sourceId: string): Promise<number> {
    // Delete the journal_lines first to be explicit even though the FK
    // cascade would catch them. Two queries is cheap and the intent is
    // obvious to anyone tracing this later.
    const lineIds = await this.db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        eq(journalEntries.sourceType, sourceType),
        eq(journalEntries.sourceId, sourceId),
      ));
    if (lineIds.length === 0) return 0;
    const ids = lineIds.map((r) => r.id);
    await this.db
      .delete(journalLines)
      .where(and(eq(journalLines.tenantId, this.tenantId), inArray(journalLines.journalEntryId, ids)));
    const result = await this.db
      .delete(journalEntries)
      .where(and(eq(journalEntries.tenantId, this.tenantId), inArray(journalEntries.id, ids)))
      .returning({ id: journalEntries.id });
    return result.length;
  }

  async postSalesInvoice(invoice: { totalAmount: number; date: string; id: string; customerName: string }): Promise<void> {
    if (await this.isAlreadyPosted('sales_invoice', invoice.id)) return;
    await this.createJournalEntry({
      date: invoice.date,
      description: `Sales invoice to ${invoice.customerName}`,
      sourceType: 'sales_invoice',
      sourceId: invoice.id,
      lines: [
        { accountCode: '1103', debit: invoice.totalAmount },
        { accountCode: '4001', credit: invoice.totalAmount },
      ],
    });
  }

  async postDebitNote(note: { amount: number; date: string; id: string; vendorName: string }): Promise<void> {
    if (await this.isAlreadyPosted('debit_note', note.id)) return;
    await this.createJournalEntry({
      date: note.date,
      description: `Debit note to ${note.vendorName}`,
      sourceType: 'debit_note',
      sourceId: note.id,
      lines: [
        { accountCode: '2101', debit: note.amount },
        { accountCode: '5002', credit: note.amount },
      ],
    });
  }

  async postCreditNote(note: { amount: number; date: string; id: string; customerName: string }): Promise<void> {
    if (await this.isAlreadyPosted('credit_note', note.id)) return;
    await this.createJournalEntry({
      date: note.date,
      description: `Credit note to ${note.customerName}`,
      sourceType: 'credit_note',
      sourceId: note.id,
      lines: [
        { accountCode: '4001', debit: note.amount },
        { accountCode: '1103', credit: note.amount },
      ],
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async isAlreadyPosted(sourceType: string, sourceId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.tenantId, this.tenantId),
        eq(journalEntries.sourceType, sourceType),
        eq(journalEntries.sourceId, sourceId),
      ))
      .limit(1);
    return !!row;
  }

  private validateLines(lines: CreateJournalEntryInput['lines']): void {
    if (lines.length < 2) throw new ConflictError('Journal entry requires at least 2 lines');

    const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new ConflictError(`Journal entry is not balanced: debits ${totalDebit} ≠ credits ${totalCredit}`);
    }
  }

  private async resolveAccountCodes(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    codes: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(codes)];
    const rows = await tx
      .select({ id: accounts.id, code: accounts.code })
      .from(accounts)
      .where(and(eq(accounts.tenantId, this.tenantId), inArray(accounts.code, unique)));

    const missing = unique.filter((c) => !rows.find((r: { code: string }) => r.code === c));
    if (missing.length > 0) throw new ConflictError(`Account codes not found: ${missing.join(', ')}`);

    return new Map(rows.map((r: { code: string; id: string }) => [r.code, r.id]));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async nextEntryNumber(tx: any): Promise<string> {
    const fy = this.getCurrentFY();
    const [seqRow] = await tx
      .insert(journalSequences)
      .values({ tenantId: this.tenantId, financialYear: fy, lastSequence: 1 })
      .onConflictDoUpdate({
        target: [journalSequences.tenantId, journalSequences.financialYear],
        set: { lastSequence: sql`${journalSequences.lastSequence} + 1`, updatedAt: new Date() },
      })
      .returning();

    const seq = String(seqRow!.lastSequence).padStart(4, '0');
    return `JE-${fy}-${seq}`;
  }

  private getCurrentFY(): string {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-based
    const year = now.getFullYear();
    // Indian FY: April to March
    const startYear = month >= 4 ? year : year - 1;
    const endYear = startYear + 1;
    return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
  }

  private async resolveParentId(parentId?: string | null): Promise<string | null> {
    if (!parentId) return null;
    const [row] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, parentId), eq(accounts.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Parent account');
    return row.id;
  }

  private buildJeWhere(filters: JournalEntryFilter) {
    const clauses = [eq(journalEntries.tenantId, this.tenantId)];
    if (filters.dateFrom) clauses.push(sql`${journalEntries.date} >= ${filters.dateFrom}`);
    if (filters.dateTo) clauses.push(sql`${journalEntries.date} <= ${filters.dateTo}`);
    if (filters.sourceType) clauses.push(eq(journalEntries.sourceType, filters.sourceType));
    if (filters.search) clauses.push(sql`(${journalEntries.description} ILIKE ${'%' + filters.search + '%'} OR ${journalEntries.entryNumber} ILIKE ${'%' + filters.search + '%'})`);
    return and(...clauses);
  }

  private toAccount(row: typeof accounts.$inferSelect): Account {
    return {
      id: row.id,
      tenantId: row.tenantId,
      code: row.code,
      name: row.name,
      type: row.type,
      parentId: row.parentId ?? null,
      isActive: row.isActive,
      isSystemAccount: row.isSystemAccount,
      description: row.description ?? null,
    };
  }

  private toJournalEntry(row: typeof journalEntries.$inferSelect): JournalEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      entryNumber: row.entryNumber,
      date: row.date,
      description: row.description,
      status: row.status,
      sourceType: row.sourceType ?? null,
      sourceId: row.sourceId ?? null,
      totalDebit: toNumber(row.totalDebit),
      totalCredit: toNumber(row.totalCredit),
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

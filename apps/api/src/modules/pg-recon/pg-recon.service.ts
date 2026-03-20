import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { pgSettlements, pgSettlementLines, paymentReceipts } from '@runq/db';
import type { Db } from '@runq/db';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError } from '../../utils/errors';

type Gateway = 'razorpay' | 'phonepe' | 'paytm';

interface ParsedLine {
  settlementId: string;
  settlementDate: string;
  transactionId: string;
  orderId: string;
  transactionDate: string;
  grossAmount: number;
  fee: number;
  tax: number;
  netAmount: number;
}

export interface ImportResult {
  settlementId: string;
  imported: number;
  totalAmount: number;
  errors: { row: number; message: string }[];
}

export interface SettlementFilters {
  gateway?: Gateway;
  dateFrom?: string;
  dateTo?: string;
  status?: 'pending' | 'reconciled' | 'partially_reconciled';
}

export interface ReconcileResult {
  matched: number;
  unmatched: number;
  totalSettled: number;
  totalMatched: number;
  difference: number;
}

export class PgReconService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async importSettlement(gateway: Gateway, csvData: string): Promise<ImportResult> {
    const { lines, errors } = this.parseGatewayCsv(gateway, csvData);
    if (lines.length === 0) return { settlementId: '', imported: 0, totalAmount: 0, errors };

    const grouped = this.groupBySettlement(lines);
    const firstGroup = Object.values(grouped)[0]!;
    const settlementId = await this.upsertSettlement(gateway, firstGroup);

    let imported = 0;
    let totalAmount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      try {
        const isDup = await this.isDuplicateLine(gateway, line.settlementId, line.transactionId);
        if (isDup) continue;

        const pgSettlementRow = await this.findSettlement(gateway, line.settlementId);
        if (!pgSettlementRow) continue;

        await this.db.insert(pgSettlementLines).values({
          tenantId: this.tenantId,
          settlementId: pgSettlementRow.id,
          orderId: line.orderId,
          transactionId: line.transactionId,
          transactionDate: new Date(line.transactionDate),
          grossAmount: line.grossAmount.toString(),
          fee: line.fee.toString(),
          tax: line.tax.toString(),
          netAmount: line.netAmount.toString(),
          matchStatus: 'unmatched',
        });

        imported++;
        totalAmount += line.netAmount;
      } catch (err) {
        errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Insert error' });
      }
    }

    return { settlementId, imported, totalAmount, errors };
  }

  async listSettlements(filters: SettlementFilters, page: number, limit: number) {
    const { offset } = applyPagination(page, limit);

    const conditions = [
      eq(pgSettlements.tenantId, this.tenantId),
      filters.gateway ? eq(pgSettlements.gateway, filters.gateway) : undefined,
      filters.dateFrom ? gte(pgSettlements.settlementDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(pgSettlements.settlementDate, filters.dateTo) : undefined,
    ].filter(Boolean) as Parameters<typeof and>;

    const baseWhere = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db.select().from(pgSettlements).where(baseWhere).limit(limit).offset(offset),
      this.db.select({ count: sql<number>`count(*)::int` }).from(pgSettlements).where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows,
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async getSettlement(id: string) {
    const [settlement] = await this.db
      .select()
      .from(pgSettlements)
      .where(and(eq(pgSettlements.id, id), eq(pgSettlements.tenantId, this.tenantId)))
      .limit(1);

    if (!settlement) throw new NotFoundError('Settlement');

    const lines = await this.db
      .select()
      .from(pgSettlementLines)
      .where(and(eq(pgSettlementLines.settlementId, id), eq(pgSettlementLines.tenantId, this.tenantId)));

    return { ...settlement, lines };
  }

  async reconcileSettlement(settlementId: string): Promise<ReconcileResult> {
    const [settlement] = await this.db
      .select()
      .from(pgSettlements)
      .where(and(eq(pgSettlements.id, settlementId), eq(pgSettlements.tenantId, this.tenantId)))
      .limit(1);

    if (!settlement) throw new NotFoundError('Settlement');

    const lines = await this.db
      .select()
      .from(pgSettlementLines)
      .where(and(eq(pgSettlementLines.settlementId, settlementId), eq(pgSettlementLines.tenantId, this.tenantId)));

    const receipts = await this.db
      .select()
      .from(paymentReceipts)
      .where(eq(paymentReceipts.tenantId, this.tenantId));

    let matched = 0;
    let totalMatched = 0;
    const totalSettled = parseFloat(settlement.netAmount);

    for (const line of lines) {
      if (line.matchStatus === 'matched') { matched++; totalMatched += parseFloat(line.netAmount); continue; }

      const receipt = receipts.find(
        (r) => r.referenceNumber === line.orderId || r.referenceNumber === line.transactionId,
      );

      if (receipt) {
        await this.db
          .update(pgSettlementLines)
          .set({ matchStatus: 'matched', receiptId: receipt.id, updatedAt: new Date() })
          .where(eq(pgSettlementLines.id, line.id));
        matched++;
        totalMatched += parseFloat(line.netAmount);
      }
    }

    return {
      matched,
      unmatched: lines.length - matched,
      totalSettled,
      totalMatched,
      difference: totalSettled - totalMatched,
    };
  }

  async getUnmatched(settlementId: string) {
    const [settlement] = await this.db
      .select()
      .from(pgSettlements)
      .where(and(eq(pgSettlements.id, settlementId), eq(pgSettlements.tenantId, this.tenantId)))
      .limit(1);

    if (!settlement) throw new NotFoundError('Settlement');

    return this.db
      .select()
      .from(pgSettlementLines)
      .where(
        and(
          eq(pgSettlementLines.settlementId, settlementId),
          eq(pgSettlementLines.tenantId, this.tenantId),
          eq(pgSettlementLines.matchStatus, 'unmatched'),
        ),
      );
  }

  private parseGatewayCsv(gateway: Gateway, csvData: string): { lines: ParsedLine[]; errors: { row: number; message: string }[] } {
    const rawLines = csvData.split('\n').map((l) => l.trim()).filter(Boolean);
    if (rawLines.length < 2) return { lines: [], errors: [] };

    const headers = splitCsvLine(rawLines[0]!).map((h) => h.toLowerCase().trim());
    const errors: { row: number; message: string }[] = [];
    const lines: ParsedLine[] = [];

    for (let i = 1; i < rawLines.length; i++) {
      const cols = splitCsvLine(rawLines[i]!);
      try {
        const parsed = this.parseRowForGateway(gateway, headers, cols);
        lines.push(parsed);
      } catch (err) {
        errors.push({ row: i + 1, message: err instanceof Error ? err.message : 'Parse error' });
      }
    }

    return { lines, errors };
  }

  private parseRowForGateway(gateway: Gateway, headers: string[], cols: string[]): ParsedLine {
    if (gateway === 'razorpay') return parseRazorpayRow(headers, cols);
    if (gateway === 'phonepe') return parsePhonePeRow(headers, cols);
    return parsePaytmRow(headers, cols);
  }

  private groupBySettlement(lines: ParsedLine[]): Record<string, ParsedLine[]> {
    return lines.reduce<Record<string, ParsedLine[]>>((acc, l) => {
      acc[l.settlementId] = acc[l.settlementId] ?? [];
      acc[l.settlementId]!.push(l);
      return acc;
    }, {});
  }

  private async upsertSettlement(gateway: Gateway, lines: ParsedLine[]): Promise<string> {
    const existing = await this.findSettlement(gateway, lines[0]!.settlementId);
    if (existing) return existing.id;

    const gross = lines.reduce((s, l) => s + l.grossAmount, 0);
    const fees = lines.reduce((s, l) => s + l.fee, 0);
    const tax = lines.reduce((s, l) => s + l.tax, 0);
    const net = lines.reduce((s, l) => s + l.netAmount, 0);

    const [row] = await this.db
      .insert(pgSettlements)
      .values({
        tenantId: this.tenantId,
        gateway,
        settlementId: lines[0]!.settlementId,
        settlementDate: lines[0]!.settlementDate,
        grossAmount: gross.toString(),
        totalFees: fees.toString(),
        totalTax: tax.toString(),
        netAmount: net.toString(),
      })
      .returning({ id: pgSettlements.id });

    return row!.id;
  }

  private async findSettlement(gateway: Gateway, settlementId: string) {
    const [row] = await this.db
      .select()
      .from(pgSettlements)
      .where(
        and(
          eq(pgSettlements.tenantId, this.tenantId),
          eq(pgSettlements.gateway, gateway),
          eq(pgSettlements.settlementId, settlementId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async isDuplicateLine(gateway: Gateway, settlementExtId: string, transactionId: string): Promise<boolean> {
    const settlement = await this.findSettlement(gateway, settlementExtId);
    if (!settlement) return false;

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pgSettlementLines)
      .where(
        and(
          eq(pgSettlementLines.tenantId, this.tenantId),
          eq(pgSettlementLines.settlementId, settlement.id),
          eq(pgSettlementLines.transactionId, transactionId),
        ),
      );
    return (result?.count ?? 0) > 0;
  }
}

// --- Gateway parsers ---

function parseRazorpayRow(headers: string[], cols: string[]): ParsedLine {
  const get = (name: string) => cols[headers.indexOf(name)]?.trim() ?? '';
  const settlementId = get('settlement_id');
  const transactionId = get('payment_id');
  const orderId = get('order_id');
  if (!settlementId || !transactionId) throw new Error('Missing settlement_id or payment_id');

  return {
    settlementId,
    settlementDate: parseDate(get('settled_at')),
    transactionId,
    orderId,
    transactionDate: parseDate(get('settled_at')),
    grossAmount: parseAmount(get('amount')),
    fee: parseAmount(get('fee')),
    tax: parseAmount(get('tax')),
    netAmount: parseAmount(get('amount')) - parseAmount(get('fee')) - parseAmount(get('tax')),
  };
}

function parsePhonePeRow(headers: string[], cols: string[]): ParsedLine {
  const get = (name: string) => cols[headers.indexOf(name)]?.trim() ?? '';
  const settlementId = get('settlement_utr');
  const transactionId = get('transaction_id');
  const orderId = get('merchant_order_id');
  if (!settlementId || !transactionId) throw new Error('Missing settlement_utr or transaction_id');

  return {
    settlementId,
    settlementDate: parseDate(get('settlement_date')),
    transactionId,
    orderId,
    transactionDate: parseDate(get('settlement_date')),
    grossAmount: parseAmount(get('transaction_amount')),
    fee: parseAmount(get('commission')),
    tax: parseAmount(get('gst')),
    netAmount: parseAmount(get('net_amount')),
  };
}

function parsePaytmRow(headers: string[], cols: string[]): ParsedLine {
  const get = (name: string) => cols[headers.indexOf(name)]?.trim() ?? '';
  const settlementId = get('order_id');
  const transactionId = get('txnid');
  const orderId = get('order_id');
  if (!settlementId || !transactionId) throw new Error('Missing ORDER_ID or TXNID');

  return {
    settlementId,
    settlementDate: parseDate(get('settlement_date')),
    transactionId,
    orderId,
    transactionDate: parseDate(get('settlement_date')),
    grossAmount: parseAmount(get('txnamount')),
    fee: parseAmount(get('totalcommission')),
    tax: parseAmount(get('tax')),
    netAmount: parseAmount(get('netamount')),
  };
}

// --- Helpers ---

function parseDate(str: string): string {
  const clean = str.trim().replace(/"/g, '');
  const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y!.length === 2 ? `20${y}` : y;
    return `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  throw new Error(`Invalid date: ${str}`);
}

function parseAmount(str: string): number {
  return parseFloat(str.replace(/[,\s]/g, '')) || 0;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

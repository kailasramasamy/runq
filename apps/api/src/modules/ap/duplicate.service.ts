import { eq, and, sql, gte, lte, ne } from 'drizzle-orm';
import { purchaseInvoices } from '@runq/db';
import type { Db } from '@runq/db';

export interface DuplicateMatch {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  status: string;
  matchType: string;
  confidence: number;
}

export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  matches: DuplicateMatch[];
}

interface CheckParams {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
}

export class DuplicateService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async checkDuplicates(params: CheckParams): Promise<DuplicateCheckResult> {
    const [exact, fuzzy, sameAmount] = await Promise.all([
      this.findExactMatches(params),
      this.findFuzzyAmountDateMatches(params),
      this.findSameAmountMatches(params),
    ]);

    const merged = this.deduplicateMatches([...exact, ...fuzzy, ...sameAmount]);
    merged.sort((a, b) => b.confidence - a.confidence);

    return { hasDuplicates: merged.length > 0, matches: merged };
  }

  private async findExactMatches(params: CheckParams): Promise<DuplicateMatch[]> {
    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        totalAmount: purchaseInvoices.totalAmount,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          eq(purchaseInvoices.vendorId, params.vendorId),
          sql`lower(${purchaseInvoices.invoiceNumber}) = lower(${params.invoiceNumber})`,
          ne(purchaseInvoices.status, 'cancelled'),
        ),
      )
      .limit(10);

    return rows.map((r) => this.toMatch(r, 'exact_invoice_number', 1.0));
  }

  private async findFuzzyAmountDateMatches(params: CheckParams): Promise<DuplicateMatch[]> {
    const lowerAmount = String(params.totalAmount * 0.98);
    const upperAmount = String(params.totalAmount * 1.02);

    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        totalAmount: purchaseInvoices.totalAmount,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          eq(purchaseInvoices.vendorId, params.vendorId),
          gte(purchaseInvoices.totalAmount, lowerAmount),
          lte(purchaseInvoices.totalAmount, upperAmount),
          gte(purchaseInvoices.invoiceDate, this.addDays(params.invoiceDate, -3)),
          lte(purchaseInvoices.invoiceDate, this.addDays(params.invoiceDate, 3)),
          ne(purchaseInvoices.status, 'cancelled'),
        ),
      )
      .limit(10);

    return rows.map((r) => this.toMatch(r, 'similar_amount_and_date', 0.8));
  }

  private async findSameAmountMatches(params: CheckParams): Promise<DuplicateMatch[]> {
    const rows = await this.db
      .select({
        id: purchaseInvoices.id,
        invoiceNumber: purchaseInvoices.invoiceNumber,
        invoiceDate: purchaseInvoices.invoiceDate,
        totalAmount: purchaseInvoices.totalAmount,
        status: purchaseInvoices.status,
      })
      .from(purchaseInvoices)
      .where(
        and(
          eq(purchaseInvoices.tenantId, this.tenantId),
          eq(purchaseInvoices.vendorId, params.vendorId),
          eq(purchaseInvoices.totalAmount, String(params.totalAmount)),
          gte(purchaseInvoices.invoiceDate, this.addDays(params.invoiceDate, -30)),
          lte(purchaseInvoices.invoiceDate, this.addDays(params.invoiceDate, 30)),
          ne(purchaseInvoices.status, 'cancelled'),
        ),
      )
      .limit(10);

    return rows.map((r) => this.toMatch(r, 'same_amount_recent', 0.6));
  }

  private toMatch(
    row: { id: string; invoiceNumber: string; invoiceDate: string; totalAmount: string; status: string },
    matchType: string,
    confidence: number,
  ): DuplicateMatch {
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate,
      totalAmount: Number(row.totalAmount),
      status: row.status,
      matchType,
      confidence,
    };
  }

  private deduplicateMatches(matches: DuplicateMatch[]): DuplicateMatch[] {
    const seen = new Map<string, DuplicateMatch>();
    for (const m of matches) {
      const existing = seen.get(m.id);
      if (!existing || existing.confidence < m.confidence) {
        seen.set(m.id, m);
      }
    }
    return Array.from(seen.values());
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
}

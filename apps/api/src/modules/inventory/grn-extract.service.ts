// GRN invoice extraction — thin wrapper over AP's ExtractService that
// repurposes the AI invoice parser for the inventory "Receive stock"
// flow. The AP service already produces line items with qty/unitPrice,
// which is exactly what a GRN needs; we just map those names back onto
// the inventory catalog so the mobile screen can prefill picked items.
//
// Matching cascade (per item, first hit wins):
//   1. Exact SKU (case-insensitive)
//   2. Exact name (case-insensitive)
//   3. ILIKE partial on name — first row in alpha order
// Unmatched lines are returned with `itemId: null` so the UI can prompt
// the user to bind them via the existing item picker before posting.

import type { Db } from '@runq/db';
import { items } from '@runq/db';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { ExtractService } from '../ap/extract.service';

export interface GrnExtractedLine {
  /// Resolved catalog item id when one of the three matchers fired,
  /// otherwise null — the mobile UI shows a "Map item" affordance.
  itemId: string | null;
  /// Matched catalog name when itemId is set, else the AI's raw line name.
  itemName: string;
  /// AI-extracted name as it appeared on the invoice. Always preserved so
  /// the user sees what the parser read, even after manual remap.
  rawName: string;
  itemSku: string | null;
  itemUnit: string | null;
  qty: number;
  unitRate: number;
  matchType: 'sku' | 'name' | 'fuzzy' | null;
}

export interface GrnExtractionResult {
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: number;
  confidence: number;
  lines: GrnExtractedLine[];
}

export class GrnExtractService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async extract(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<GrnExtractionResult> {
    const apSvc = new ExtractService(this.db, this.tenantId);
    const { extracted, confidence } = await apSvc.extractFromFile(buffer, mimeType, fileName);

    const lines: GrnExtractedLine[] = [];
    for (const raw of extracted.items) {
      // Skip negative-amount lines (discounts / round-offs) — they aren't
      // stock movements and would confuse the GRN posting.
      if (Number(raw.quantity) <= 0 || Number(raw.unitPrice) < 0) continue;
      const match = await this.matchItem(raw.itemName);
      lines.push({
        itemId: match?.id ?? null,
        itemName: match?.name ?? raw.itemName,
        rawName: raw.itemName,
        itemSku: match?.sku ?? null,
        itemUnit: match?.unit ?? null,
        qty: Number(raw.quantity),
        unitRate: Number(raw.unitPrice),
        matchType: match?.matchType ?? null,
      });
    }

    return {
      vendorName: extracted.vendorName || null,
      invoiceNumber: extracted.invoiceNumber || null,
      invoiceDate: extracted.invoiceDate || null,
      totalAmount: Number(extracted.totalAmount) || 0,
      confidence,
      lines,
    };
  }

  /// Three-pass catalog lookup. Returns null on miss; the caller renders
  /// an "unmatched" tile that opens the manual picker.
  private async matchItem(rawName: string): Promise<{
    id: string; name: string; sku: string | null; unit: string | null;
    matchType: 'sku' | 'name' | 'fuzzy';
  } | null> {
    const trimmed = rawName.trim();
    if (!trimmed) return null;
    const tenantScope = eq(items.tenantId, this.tenantId);
    const active = eq(items.isActive, true);

    // Pass 1 — SKU (case-insensitive equality).
    const [bySku] = await this.db
      .select({ id: items.id, name: items.name, sku: items.sku, unit: items.unit })
      .from(items)
      .where(and(tenantScope, active, sql`UPPER(${items.sku}) = UPPER(${trimmed})`))
      .limit(1);
    if (bySku) return { ...bySku, matchType: 'sku' as const };

    // Pass 2 — exact name (case-insensitive).
    const [byName] = await this.db
      .select({ id: items.id, name: items.name, sku: items.sku, unit: items.unit })
      .from(items)
      .where(and(tenantScope, active, sql`LOWER(${items.name}) = LOWER(${trimmed})`))
      .limit(1);
    if (byName) return { ...byName, matchType: 'name' as const };

    // Pass 3 — partial ILIKE. Helps with "Maggi 70g" vs catalog "Maggi 70g
    // Pack". Falls back to alpha-first so results are deterministic.
    const [byFuzzy] = await this.db
      .select({ id: items.id, name: items.name, sku: items.sku, unit: items.unit })
      .from(items)
      .where(and(tenantScope, active, ilike(items.name, `%${trimmed}%`)))
      .orderBy(items.name)
      .limit(1);
    if (byFuzzy) return { ...byFuzzy, matchType: 'fuzzy' as const };

    return null;
  }
}

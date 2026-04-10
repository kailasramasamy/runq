import { eq, and } from 'drizzle-orm';
import {
  customers,
  items,
  invoiceImportItemAliases,
  invoiceImportCustomerAliases,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { MatchResult, MatchSource } from '@runq/types';

/**
 * Auto-pick threshold. Below this, the matcher returns suggestions but
 * leaves resolvedId=null so the staging UI flags the row for review.
 * Tuned for the dairy/wholesale use case where item names share lots of
 * tokens (Brand + Product + Size). Set high enough to avoid false-confident
 * picks, low enough that the obvious matches resolve automatically.
 */
const AUTO_PICK_THRESHOLD = 0.85;

/** How many suggestions to surface in the dropdown for low-confidence rows. */
const SUGGESTION_LIMIT = 5;

/** Minimum score for an entry to even appear in the suggestion list. */
const SUGGESTION_FLOOR = 0.3;

interface MasterItemRow {
  id: string;
  name: string;
  sku: string | null;
}

interface MasterCustomerRow {
  id: string;
  name: string;
  gstin: string | null;
}

interface AliasRow {
  source: string;
  targetId: string;
  targetName: string;
}

/**
 * Normalize a name for tolerant comparison: lowercase, collapse all
 * non-alphanumeric runs into a single space, trim. Same shape used for
 * Jaccard token overlap downstream.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Jaccard token overlap: |A∩B| / |A∪B|. Cheap and works well for short
 * product names where word order varies but the bag-of-words is similar.
 * Returns 0..1.
 */
function jaccard(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter(Boolean));
  const tb = new Set(normalize(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union;
}

/**
 * Combined similarity:
 *   1.0  → normalized exact
 *   0.9  → one normalized name contains the other (substring)
 *   else → Jaccard token overlap
 *
 * The substring boost is what catches cases like
 * "Vrindavan Buffalo Milk 500ml" ⊃ "Buffalo Milk" — token overlap alone
 * would underweight the size suffix.
 */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length > 0 && nb.length > 0 && (na.includes(nb) || nb.includes(na))) {
    return 0.9;
  }
  return jaccard(a, b);
}

interface BestMatch {
  id: string;
  name: string;
  confidence: number;
  source: MatchSource;
}

/** Build the suggestions list for the dropdown — top N by score over the floor. */
function buildSuggestions(
  scored: { id: string; name: string; confidence: number }[],
): { id: string; name: string; confidence: number }[] {
  return scored
    .filter((s) => s.confidence >= SUGGESTION_FLOOR)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, SUGGESTION_LIMIT);
}

function unmatched(): MatchResult {
  return {
    resolvedId: null,
    source: 'unmatched',
    confidence: 0,
    resolvedName: null,
    suggestions: [],
  };
}

function buildMatchResult(scored: { id: string; name: string; confidence: number; source: MatchSource }[]): MatchResult {
  if (scored.length === 0) return unmatched();
  const sorted = [...scored].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0]!;
  const suggestions = buildSuggestions(sorted);

  if (best.confidence >= AUTO_PICK_THRESHOLD) {
    return {
      resolvedId: best.id,
      source: best.source,
      confidence: best.confidence,
      resolvedName: best.name,
      suggestions,
    };
  }
  // Below threshold — leave unresolved but surface candidates.
  return {
    resolvedId: null,
    source: 'unmatched',
    confidence: best.confidence,
    resolvedName: null,
    suggestions,
  };
}

export class InvoiceImportMatcherService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Match a list of source customer (name, gstin?) pairs to existing
   * master rows. Loads customers + customer aliases once and scores each
   * source against the union.
   *
   * Match cascade per source:
   *   1. GSTIN exact (case-insensitive) → confidence 1.0, source='gstin'
   *   2. Normalized exact name in master → 1.0, 'exact-master'
   *   3. Normalized exact key in alias table → 1.0, 'exact-alias'
   *   4. Fuzzy similarity over master + alias source_keys → 'fuzzy-*'
   */
  async matchCustomers(
    sources: { sourceName: string; gstin?: string | null }[],
  ): Promise<MatchResult[]> {
    if (sources.length === 0) return [];

    const masterRows = await this.db
      .select({ id: customers.id, name: customers.name, gstin: customers.gstin })
      .from(customers)
      .where(eq(customers.tenantId, this.tenantId));

    const aliasRows = await this.db
      .select({
        source: invoiceImportCustomerAliases.sourceKey,
        targetId: invoiceImportCustomerAliases.customerId,
        targetName: customers.name,
      })
      .from(invoiceImportCustomerAliases)
      .innerJoin(customers, eq(invoiceImportCustomerAliases.customerId, customers.id))
      .where(eq(invoiceImportCustomerAliases.tenantId, this.tenantId));

    return sources.map((s) => this.matchOneCustomer(s, masterRows, aliasRows));
  }

  private matchOneCustomer(
    source: { sourceName: string; gstin?: string | null },
    masterRows: MasterCustomerRow[],
    aliasRows: AliasRow[],
  ): MatchResult {
    // Tier 1: GSTIN exact match. Strongest signal — overrides everything.
    if (source.gstin && source.gstin.trim()) {
      const gstinNorm = source.gstin.trim().toLowerCase();
      const hit = masterRows.find((m) => m.gstin && m.gstin.toLowerCase() === gstinNorm);
      if (hit) {
        return {
          resolvedId: hit.id,
          source: 'gstin',
          confidence: 1,
          resolvedName: hit.name,
          suggestions: [],
        };
      }
    }

    const sourceName = source.sourceName.trim();
    if (!sourceName) return unmatched();
    const normalizedSource = normalize(sourceName);

    // Tier 2: normalized exact name in master.
    const exactMaster = masterRows.find((m) => normalize(m.name) === normalizedSource);
    if (exactMaster) {
      return {
        resolvedId: exactMaster.id,
        source: 'exact-master',
        confidence: 1,
        resolvedName: exactMaster.name,
        suggestions: [],
      };
    }

    // Tier 3: normalized exact alias hit.
    const exactAlias = aliasRows.find((a) => normalize(a.source) === normalizedSource);
    if (exactAlias) {
      return {
        resolvedId: exactAlias.targetId,
        source: 'exact-alias',
        confidence: 1,
        resolvedName: exactAlias.targetName,
        suggestions: [],
      };
    }

    // Tier 4: fuzzy match over master names + alias source_keys.
    const scored: { id: string; name: string; confidence: number; source: MatchSource }[] = [];
    for (const m of masterRows) {
      const conf = similarity(sourceName, m.name);
      if (conf > 0) scored.push({ id: m.id, name: m.name, confidence: conf, source: 'fuzzy-master' });
    }
    for (const a of aliasRows) {
      const conf = similarity(sourceName, a.source);
      if (conf > 0) {
        scored.push({
          id: a.targetId,
          name: a.targetName,
          confidence: conf,
          source: 'fuzzy-alias',
        });
      }
    }

    return buildMatchResult(scored);
  }

  /**
   * Match a list of source item names to existing master items. Same
   * cascade as customers minus the GSTIN tier.
   */
  async matchItems(sourceNames: string[]): Promise<MatchResult[]> {
    if (sourceNames.length === 0) return [];

    const masterRows = await this.db
      .select({ id: items.id, name: items.name, sku: items.sku })
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), eq(items.isActive, true)));

    const aliasRows = await this.db
      .select({
        source: invoiceImportItemAliases.sourceName,
        targetId: invoiceImportItemAliases.itemId,
        targetName: items.name,
      })
      .from(invoiceImportItemAliases)
      .innerJoin(items, eq(invoiceImportItemAliases.itemId, items.id))
      .where(eq(invoiceImportItemAliases.tenantId, this.tenantId));

    return sourceNames.map((s) => this.matchOneItem(s, masterRows, aliasRows));
  }

  private matchOneItem(
    sourceName: string,
    masterRows: MasterItemRow[],
    aliasRows: AliasRow[],
  ): MatchResult {
    const trimmed = sourceName.trim();
    if (!trimmed) return unmatched();
    const normalizedSource = normalize(trimmed);

    // Tier 1: normalized exact name in master.
    const exactMaster = masterRows.find((m) => normalize(m.name) === normalizedSource);
    if (exactMaster) {
      return {
        resolvedId: exactMaster.id,
        source: 'exact-master',
        confidence: 1,
        resolvedName: exactMaster.name,
        suggestions: [],
      };
    }

    // Tier 2: normalized exact alias.
    const exactAlias = aliasRows.find((a) => normalize(a.source) === normalizedSource);
    if (exactAlias) {
      return {
        resolvedId: exactAlias.targetId,
        source: 'exact-alias',
        confidence: 1,
        resolvedName: exactAlias.targetName,
        suggestions: [],
      };
    }

    // Tier 3: fuzzy over master + alias source names.
    const scored: { id: string; name: string; confidence: number; source: MatchSource }[] = [];
    for (const m of masterRows) {
      const conf = similarity(trimmed, m.name);
      if (conf > 0) scored.push({ id: m.id, name: m.name, confidence: conf, source: 'fuzzy-master' });
    }
    for (const a of aliasRows) {
      const conf = similarity(trimmed, a.source);
      if (conf > 0) {
        scored.push({
          id: a.targetId,
          name: a.targetName,
          confidence: conf,
          source: 'fuzzy-alias',
        });
      }
    }

    return buildMatchResult(scored);
  }
}

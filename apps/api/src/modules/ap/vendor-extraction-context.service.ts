import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { vendors, vendorBillItemAliases, extractionCorrections } from '@runq/db';
import type { Db } from '@runq/db';

export interface VendorExtractionContext {
  vendor: {
    id: string;
    name: string;
    gstin: string | null;
    pan: string | null;
    paymentTermsDays: number;
    expenseAccountCode: string | null;
  };
  topItems: Array<{
    description: string;
    hsn: string | null;
    taxRate: number | null;
    useCount: number;
  }>;
  recentHeaders: Array<{
    tdsSection: string | null;
    invoiceDateOffsetDays: number | null;
    taxRateMode: 'mixed' | number | null;
  }>;
}

/**
 * Find a vendor candidate from raw extracted text. Cheap GSTIN regex scan
 * → vendor lookup. Returns null if nothing matches; the AI extraction
 * call then runs without vendor context.
 */
const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/g;

export async function findVendorInText(
  db: Db,
  tenantId: string,
  text: string,
): Promise<{ id: string; name: string; gstin: string } | null> {
  const matches = text.match(GSTIN_RE);
  if (!matches || matches.length === 0) return null;

  // Try each GSTIN found in the text against vendor table.
  for (const gstin of matches) {
    const [row] = await db
      .select({ id: vendors.id, name: vendors.name, gstin: vendors.gstin })
      .from(vendors)
      .where(
        and(
          eq(vendors.tenantId, tenantId),
          eq(vendors.gstin, gstin),
          isNull(vendors.deletedAt),
        ),
      )
      .limit(1);
    if (row && row.gstin) return { id: row.id, name: row.name, gstin: row.gstin };
  }
  return null;
}

/**
 * Build a context block describing what we know about this vendor based on
 * past saved bills. Used to enrich the AI extraction prompt.
 */
export async function buildVendorContext(
  db: Db,
  tenantId: string,
  vendorId: string,
): Promise<VendorExtractionContext | null> {
  const [vendor] = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      gstin: vendors.gstin,
      pan: vendors.pan,
      paymentTermsDays: vendors.paymentTermsDays,
      expenseAccountCode: vendors.expenseAccountCode,
    })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, vendorId), isNull(vendors.deletedAt)))
    .limit(1);
  if (!vendor) return null;

  const aliases = await db
    .select({
      description: vendorBillItemAliases.rawDescription,
      hsn: vendorBillItemAliases.suggestedHsnSac,
      taxRate: vendorBillItemAliases.suggestedTaxRate,
      useCount: vendorBillItemAliases.useCount,
    })
    .from(vendorBillItemAliases)
    .where(and(eq(vendorBillItemAliases.tenantId, tenantId), eq(vendorBillItemAliases.vendorId, vendorId)))
    .orderBy(desc(vendorBillItemAliases.useCount), desc(vendorBillItemAliases.lastUsedAt))
    .limit(10);

  const corrections = await db
    .select({ userOutput: extractionCorrections.userOutput })
    .from(extractionCorrections)
    .where(
      and(
        eq(extractionCorrections.tenantId, tenantId),
        eq(extractionCorrections.vendorId, vendorId),
        eq(extractionCorrections.documentType, 'ap_bill'),
      ),
    )
    .orderBy(desc(extractionCorrections.createdAt))
    .limit(3);

  const recentHeaders = corrections.map((c) => {
    const u = (c.userOutput ?? {}) as Record<string, unknown>;
    const tds = (u.tdsSection as string | null) ?? null;
    const items = Array.isArray(u.items) ? (u.items as Array<{ taxRate?: number | null }>) : [];
    const rates = new Set(items.map((i) => i.taxRate).filter((r): r is number => typeof r === 'number'));
    let taxRateMode: 'mixed' | number | null = null;
    if (rates.size === 1) taxRateMode = Array.from(rates)[0]!;
    else if (rates.size > 1) taxRateMode = 'mixed';

    let offsetDays: number | null = null;
    if (typeof u.invoiceDate === 'string' && typeof u.dueDate === 'string') {
      const a = new Date(u.invoiceDate).getTime();
      const b = new Date(u.dueDate).getTime();
      if (!isNaN(a) && !isNaN(b)) offsetDays = Math.round((b - a) / 86_400_000);
    }
    return { tdsSection: tds, invoiceDateOffsetDays: offsetDays, taxRateMode };
  });

  return {
    vendor: {
      id: vendor.id,
      name: vendor.name,
      gstin: vendor.gstin,
      pan: vendor.pan,
      paymentTermsDays: vendor.paymentTermsDays,
      expenseAccountCode: vendor.expenseAccountCode,
    },
    topItems: aliases.map((a) => ({
      description: a.description,
      hsn: a.hsn,
      taxRate: a.taxRate != null ? Number(a.taxRate) : null,
      useCount: a.useCount,
    })),
    recentHeaders,
  };
}

/**
 * Render the context object as a human-readable block to prepend to the
 * AI extraction prompt. Plain text — the LLM treats it as additional
 * grounding.
 */
export function renderVendorContextForPrompt(ctx: VendorExtractionContext): string {
  const lines: string[] = [];
  lines.push('## Known facts about this vendor (use to verify extracted values)');
  lines.push(`- Vendor name: ${ctx.vendor.name}`);
  if (ctx.vendor.gstin) lines.push(`- GSTIN: ${ctx.vendor.gstin}`);
  if (ctx.vendor.pan) lines.push(`- PAN: ${ctx.vendor.pan}`);
  lines.push(`- Typical payment terms: ${ctx.vendor.paymentTermsDays} days`);

  if (ctx.recentHeaders.length > 0) {
    const tdsValues = ctx.recentHeaders.map((h) => h.tdsSection).filter(Boolean);
    if (tdsValues.length > 0) {
      lines.push(`- Recent TDS sections used: ${Array.from(new Set(tdsValues)).join(', ')}`);
    }
    const rates = ctx.recentHeaders
      .map((h) => h.taxRateMode)
      .filter((r): r is number | 'mixed' => r != null);
    if (rates.length > 0) {
      const numericRates = rates.filter((r): r is number => typeof r === 'number');
      if (numericRates.length > 0) {
        lines.push(`- Typical line-item GST rate: ${Array.from(new Set(numericRates)).join('% or ')}%`);
      }
    }
  }

  if (ctx.topItems.length > 0) {
    lines.push('');
    lines.push('## Past line items from this vendor (apply same HSN/tax when description matches)');
    for (const item of ctx.topItems) {
      const parts = [`"${item.description}"`];
      if (item.hsn) parts.push(`HSN ${item.hsn}`);
      if (item.taxRate != null) parts.push(`${item.taxRate}% GST`);
      parts.push(`(seen ${item.useCount}×)`);
      lines.push(`- ${parts.join(' — ')}`);
    }
  }

  lines.push('');
  lines.push('Trust the document over these facts when they conflict — the document is ground truth — but use these as a sanity check and to fill gaps.');
  return lines.join('\n');
}

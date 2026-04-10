import * as XLSX from 'xlsx';
import type { ParsedInvoice } from '@runq/types';
import {
  analyze,
  extractFromPDF,
  isAIEnabled,
} from '../../../../utils/ai/claude.service';
import {
  SALES_INVOICE_EXTRACTION_SYSTEM_PROMPT,
  SALES_INVOICE_EXTRACTION_USER_PROMPT,
} from '../../../../utils/ai/prompts/sales-invoice-extraction';
import {
  defaultDueDate,
  emptyMatch,
  isPdf,
  isSpreadsheet,
  makeLineItem,
  type InvoiceParser,
  type ParserInput,
} from './shared';

/**
 * Last-resort AI parser. Only invoked when every deterministic parser
 * in the cascade has returned null. Two paths:
 *
 *   - PDF input → Claude Vision (extractFromPDF) reads the document and
 *     returns structured JSON matching the ParsedInvoice schema.
 *   - Spreadsheet input → convert to CSV text via SheetJS, then call
 *     analyze() with the same JSON schema prompt.
 *
 * Returns null when:
 *   - AI is not enabled (no ANTHROPIC_API_KEY) — the cascade falls
 *     through and the route surfaces a clear "needs AI" error.
 *   - The input is too large to fit in the prompt budget.
 *   - Claude returned no parseable JSON.
 *
 * Cost guardrails baked in:
 *   - Skips files larger than MAX_AI_BYTES (~1 MB raw) — those are too
 *     large to send efficiently and probably need a smarter approach.
 *   - Spreadsheet path strips formulas + style metadata (sheet_to_csv)
 *     so the prompt only contains values.
 *   - Sequential per file (the cascade orchestrator handles parallelism
 *     by file, not within file) — keeps token spend predictable.
 */

const MAX_AI_BYTES = 1_000_000; // 1 MB raw file size

interface RawAIResponse {
  invoices?: Array<{
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    dueDate?: string | null;
    poNumber?: string | null;
    customerSourceName?: string | null;
    customerSourceGstin?: string | null;
    lineItems?: Array<{
      sourceName?: string | null;
      quantity?: number | string | null;
      unitPrice?: number | string | null;
      hsnSacCode?: string | null;
      taxRate?: number | string | null;
      lineTotal?: number | string | null;
    }>;
    sourceGrandTotal?: number | string | null;
  }>;
}

/**
 * Defensive JSON parser. Claude is prompted to return raw JSON but
 * occasionally wraps it in code fences. Strip them and try again.
 */
function parseAIJson(raw: string): RawAIResponse | null {
  const trimmed = raw.trim();
  // Strip ```json … ``` fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1]! : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Convert the AI response into ParsedInvoice[]. Returns the array even
 * if some invoices have missing fields — the cascade caller filters
 * unparseable entries downstream via the `parseable` flag.
 */
function hydrateInvoices(
  raw: RawAIResponse,
  fileName: string,
): ParsedInvoice[] {
  if (!raw.invoices || !Array.isArray(raw.invoices)) return [];
  const out: ParsedInvoice[] = [];

  for (const r of raw.invoices) {
    const invoiceNumber = String(r.invoiceNumber ?? '').trim();
    const invoiceDate = String(r.invoiceDate ?? '').trim();
    if (!invoiceNumber || !invoiceDate) continue;

    const lineItems = (r.lineItems ?? [])
      .map((li) => {
        const sourceName = String(li.sourceName ?? '').trim();
        const quantity = Number(li.quantity ?? 0);
        const unitPrice = Number(li.unitPrice ?? 0);
        if (!sourceName || quantity <= 0) return null;
        return makeLineItem({
          sourceName,
          quantity,
          unitPrice,
          hsnSacCode: li.hsnSacCode ?? null,
          taxRate: li.taxRate != null && li.taxRate !== '' ? Number(li.taxRate) : null,
        });
      })
      .filter((li): li is NonNullable<typeof li> => li !== null);

    if (lineItems.length === 0) continue;

    const customerSourceName = String(r.customerSourceName ?? '').trim();
    const computedSubtotal =
      Math.round(lineItems.reduce((acc, li) => acc + li.lineTotal, 0) * 100) / 100;
    const sourceGrandTotal = r.sourceGrandTotal != null ? Number(r.sourceGrandTotal) : 0;

    out.push({
      sourceFile: fileName,
      parserUsed: 'ai',
      invoiceNumber,
      invoiceDate,
      dueDate: r.dueDate ? String(r.dueDate) : defaultDueDate(invoiceDate),
      poNumber: r.poNumber ? String(r.poNumber).trim() || null : null,
      notes: null,
      customerSourceName,
      customerSourceGstin: r.customerSourceGstin
        ? String(r.customerSourceGstin).trim() || null
        : null,
      customerMatch: emptyMatch(),
      lineItems,
      sourceGrandTotal,
      computedSubtotal,
      parseable: customerSourceName.length > 0,
      warnings: ['Extracted via AI fallback — please double-check the line items before importing.'],
    });
  }

  return out;
}

class AIParser implements InvoiceParser {
  readonly name = 'ai' as const;

  async parse(input: ParserInput): Promise<ParsedInvoice[] | null> {
    if (!isAIEnabled()) return null;
    if (input.buffer.length > MAX_AI_BYTES) return null;

    let rawResponse: string | null = null;

    if (isPdf(input)) {
      // Claude Vision reads the PDF natively.
      const base64 = input.buffer.toString('base64');
      rawResponse = await extractFromPDF(
        base64,
        SALES_INVOICE_EXTRACTION_SYSTEM_PROMPT,
        SALES_INVOICE_EXTRACTION_USER_PROMPT,
      );
    } else if (isSpreadsheet(input)) {
      // Convert the workbook to CSV text — drops formulas and style
      // metadata so the prompt only contains values.
      let wb: XLSX.WorkBook;
      try {
        wb = XLSX.read(input.buffer, { type: 'buffer', cellDates: false });
      } catch {
        return null;
      }
      const sheets: string[] = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        if (!sheet) continue;
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv.trim()) sheets.push(`### Sheet: ${name}\n${csv}`);
      }
      if (sheets.length === 0) return null;
      const userPrompt = `${SALES_INVOICE_EXTRACTION_USER_PROMPT}\n\nDocument content (CSV):\n\n${sheets.join('\n\n')}`;
      rawResponse = await analyze(SALES_INVOICE_EXTRACTION_SYSTEM_PROMPT, userPrompt, 4096);
    } else {
      return null;
    }

    if (!rawResponse) return null;
    const parsed = parseAIJson(rawResponse);
    if (!parsed) {
      // eslint-disable-next-line no-console
      console.warn(`AI parser returned non-JSON for ${input.fileName}:`, rawResponse.slice(0, 200));
      return null;
    }

    const invoices = hydrateInvoices(parsed, input.fileName);
    return invoices.length > 0 ? invoices : null;
  }
}

export const aiParser = new AIParser();

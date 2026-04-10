import * as XLSX from 'xlsx';
import type { ParsedInvoice } from '@runq/types';
import {
  analyze,
  extractFromImage,
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
  isImage,
  isPdf,
  isSpreadsheet,
  makeLineItem,
  type InvoiceParser,
  type ParserInput,
} from './shared';

/**
 * Last-resort AI parser. Only invoked when every deterministic parser
 * in the cascade has returned null. Three paths:
 *
 *   - extractedText present (cascade pre-extracted via pdf-parse or
 *     tesseract OCR) → call analyze() with the text. Cheapest of the AI
 *     paths since we send plain text rather than the binary buffer.
 *   - PDF without usable extracted text → Claude Vision (extractFromPDF)
 *     reads the original PDF buffer. Used for scanned PDFs where local
 *     extraction yielded nothing.
 *   - Image without usable OCR → Claude Vision (extractFromImage) reads
 *     the original image buffer. Used for low-quality scans where
 *     tesseract couldn't recover usable text.
 *   - Spreadsheet → convert to CSV text via SheetJS, then call analyze()
 *     with the same JSON schema prompt. Used when the deterministic
 *     spreadsheet parsers returned null on an unrecognised format.
 *
 * Returns null when:
 *   - AI is not enabled (no ANTHROPIC_API_KEY) — the cascade falls
 *     through and the route surfaces a clear "needs AI" error.
 *   - The input is too large to fit in the prompt budget.
 *   - Claude returned no parseable JSON after one retry.
 *
 * Cost guardrails baked in:
 *   - Skips files larger than MAX_AI_BYTES (~8 MB raw) — accommodates
 *     real phone-scanned invoices without burning tokens on huge files.
 *   - Spreadsheet path strips formulas + style metadata (sheet_to_csv)
 *     so the prompt only contains values.
 *   - Prefers extracted text over original buffer when both are
 *     available — text is dramatically cheaper.
 *   - max_tokens raised to 8192 so multi-line invoices don't truncate
 *     mid-JSON.
 *   - One retry with a stricter "JSON only, no prose" reminder when
 *     the first response can't be parsed.
 *   - Sequential per file — keeps token spend predictable.
 */

const MAX_AI_BYTES = 8_000_000; // 8 MB raw file size — fits real phone scans
const AI_MAX_TOKENS = 8192;

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

/**
 * Stricter retry prompt suffix used after a first JSON-parse failure.
 * Sometimes Claude wraps the response in prose ("Here's the JSON:") or
 * code fences despite the system prompt — explicitly hammering on
 * "JSON only" usually fixes it on the second attempt.
 */
const STRICTER_USER_SUFFIX = `

CRITICAL: Your previous response could not be parsed as JSON. Return ONLY the raw JSON object — no prose, no code fences, no commentary, no markdown. The response must start with { and end with }.`;

function imageMediaType(input: ParserInput): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (input.mimeType === 'image/png') return 'image/png';
  if (input.mimeType === 'image/webp') return 'image/webp';
  if (/\.png$/i.test(input.fileName)) return 'image/png';
  if (/\.webp$/i.test(input.fileName)) return 'image/webp';
  return 'image/jpeg';
}

class AIParser implements InvoiceParser {
  readonly name = 'ai' as const;

  async parse(input: ParserInput): Promise<ParsedInvoice[] | null> {
    if (!isAIEnabled()) return null;
    if (input.buffer.length > MAX_AI_BYTES) return null;

    // First-call attempt. If JSON fails to parse, retry once with the
    // stricter prompt before giving up.
    let rawResponse = await this.callAI(input, false);
    if (!rawResponse) return null;

    let parsed = parseAIJson(rawResponse);
    if (!parsed) {
      // eslint-disable-next-line no-console
      console.warn(
        `AI parser returned non-JSON for ${input.fileName}, retrying with stricter prompt:`,
        rawResponse.slice(0, 200),
      );
      rawResponse = await this.callAI(input, true);
      if (!rawResponse) return null;
      parsed = parseAIJson(rawResponse);
      if (!parsed) {
        // eslint-disable-next-line no-console
        console.warn(
          `AI parser retry also returned non-JSON for ${input.fileName}:`,
          rawResponse.slice(0, 200),
        );
        return null;
      }
    }

    const invoices = hydrateInvoices(parsed, input.fileName);
    return invoices.length > 0 ? invoices : null;
  }

  /**
   * Picks the cheapest viable AI path for the input:
   *   1. Pre-extracted text → analyze() with text only
   *   2. Spreadsheet → SheetJS to CSV → analyze()
   *   3. PDF → Claude Vision (extractFromPDF)
   *   4. Image → Claude Vision (extractFromImage)
   *
   * The text path is used whenever the cascade orchestrator was able
   * to pre-extract text via pdf-parse / tesseract — that's strictly
   * cheaper than re-sending the binary buffer to Claude Vision.
   */
  private async callAI(input: ParserInput, stricter: boolean): Promise<string | null> {
    const userPromptBase = stricter
      ? SALES_INVOICE_EXTRACTION_USER_PROMPT + STRICTER_USER_SUFFIX
      : SALES_INVOICE_EXTRACTION_USER_PROMPT;

    if (input.extractedText && input.extractedText.length > 0) {
      const userPrompt = `${userPromptBase}\n\nDocument content (extracted text):\n\n${input.extractedText}`;
      return analyze(SALES_INVOICE_EXTRACTION_SYSTEM_PROMPT, userPrompt, AI_MAX_TOKENS);
    }

    if (isSpreadsheet(input)) {
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
      const userPrompt = `${userPromptBase}\n\nDocument content (CSV):\n\n${sheets.join('\n\n')}`;
      return analyze(SALES_INVOICE_EXTRACTION_SYSTEM_PROMPT, userPrompt, AI_MAX_TOKENS);
    }

    if (isPdf(input)) {
      const base64 = input.buffer.toString('base64');
      return extractFromPDF(
        base64,
        SALES_INVOICE_EXTRACTION_SYSTEM_PROMPT,
        userPromptBase,
        AI_MAX_TOKENS,
      );
    }

    if (isImage(input)) {
      const base64 = input.buffer.toString('base64');
      return extractFromImage(
        base64,
        imageMediaType(input),
        SALES_INVOICE_EXTRACTION_SYSTEM_PROMPT,
        userPromptBase,
        AI_MAX_TOKENS,
      );
    }

    return null;
  }
}

export const aiParser = new AIParser();

import Anthropic from '@anthropic-ai/sdk';
import { isAIEnabled, getStreamClient } from '../../utils/ai/claude.service';

export type CanonicalField =
  | 'external_id' | 'version'
  | 'vendor_external_ref' | 'vendor_gstin' | 'vendor_phone' | 'vendor_name'
  | 'invoice_number' | 'invoice_date' | 'due_date'
  | 'line_description' | 'quantity' | 'unit_price' | 'line_amount'
  | 'hsn_sac' | 'tax_rate'
  | 'subtotal' | 'tax_amount' | 'total_amount'
  | 'notes';

const CANONICAL_FIELDS: CanonicalField[] = [
  'external_id', 'version',
  'vendor_external_ref', 'vendor_gstin', 'vendor_phone', 'vendor_name',
  'invoice_number', 'invoice_date', 'due_date',
  'line_description', 'quantity', 'unit_price', 'line_amount',
  'hsn_sac', 'tax_rate',
  'subtotal', 'tax_amount', 'total_amount',
  'notes',
];

const SYNONYMS: Record<CanonicalField, string[]> = {
  external_id: ['external id', 'bill ref', 'source bill id', 'bill ref id'],
  version: ['version', 'rev', 'revision'],
  vendor_external_ref: ['vendor ref', 'farmer id', 'cpp id', 'employee id', 'party code'],
  vendor_gstin: ['gstin', 'gst number', 'gst no', 'vendor gstin'],
  vendor_phone: ['phone', 'mobile', 'vendor phone', 'contact'],
  vendor_name: ['vendor name', 'party name', 'party', 'supplier', 'farmer name', 'cpp name', 'name'],
  invoice_number: ['invoice number', 'bill number', 'bill no', 'inv no', 'invoice no', 'bill #'],
  invoice_date: ['invoice date', 'bill date', 'date', 'inv date'],
  due_date: ['due date', 'payment due', 'pay by'],
  line_description: ['description', 'item', 'particulars', 'narration', 'line item'],
  quantity: ['qty', 'quantity', 'units'],
  unit_price: ['rate', 'price', 'unit price', 'unit rate'],
  line_amount: ['line amount', 'item amount', 'line total'],
  hsn_sac: ['hsn', 'sac', 'hsn code', 'hsn/sac'],
  tax_rate: ['tax rate', 'gst rate', 'gst%', 'tax %'],
  subtotal: ['subtotal', 'sub total', 'taxable value', 'taxable amount'],
  tax_amount: ['tax', 'gst', 'tax amount', 'gst amount'],
  total_amount: ['total', 'grand total', 'invoice total', 'bill total', 'amount payable'],
  notes: ['notes', 'remarks', 'comments'],
};

export interface MappingProposal {
  columnMapping: Record<string, CanonicalField>;
  unmapped: string[];
  dateFormat?: 'DMY' | 'MDY' | 'YMD';
  amountFormat?: 'indian_lakh' | 'standard';
  source: 'heuristic' | 'llm' | 'mixed';
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function heuristicMatch(header: string): CanonicalField | null {
  const h = norm(header);
  for (const field of CANONICAL_FIELDS) {
    for (const syn of SYNONYMS[field]) {
      if (h === norm(syn)) return field;
    }
  }
  for (const field of CANONICAL_FIELDS) {
    for (const syn of SYNONYMS[field]) {
      const ns = norm(syn);
      if (h.includes(ns) || ns.includes(h)) return field;
    }
  }
  return null;
}

function detectDateFormat(samples: string[]): MappingProposal['dateFormat'] {
  const dmy = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
  const ymd = /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
  let dmyHits = 0; let ymdHits = 0;
  for (const s of samples) {
    if (!s) continue;
    if (ymd.test(s)) ymdHits++;
    else if (dmy.test(s)) {
      const [a, b] = s.split(/[\/\-]/).map((n) => parseInt(n, 10));
      if ((a ?? 0) > 12) dmyHits++;
      else if ((b ?? 0) > 12) return 'MDY';
      else dmyHits++;
    }
  }
  if (ymdHits > dmyHits) return 'YMD';
  return dmyHits ? 'DMY' : undefined;
}

function detectAmountFormat(samples: string[]): MappingProposal['amountFormat'] {
  for (const s of samples) {
    if (!s) continue;
    if (/\d{1,2},\d{2},\d{3}/.test(s)) return 'indian_lakh';
  }
  return 'standard';
}

export class BillSyncAIMapper {
  /**
   * Propose a column mapping for the given headers/sample rows. Tries deterministic
   * synonym matching first; falls back to Claude only for residue. Sample rows
   * help with date/amount format detection regardless of which path runs.
   */
  async propose(headers: string[], sampleRows: string[][]): Promise<MappingProposal> {
    const heuristic: Record<string, CanonicalField> = {};
    const remaining: string[] = [];
    for (const h of headers) {
      const m = heuristicMatch(h);
      if (m) heuristic[h] = m;
      else remaining.push(h);
    }

    const dateColIdx = headers.findIndex((h) => heuristic[h] === 'invoice_date' || heuristic[h] === 'due_date');
    const amountColIdx = headers.findIndex((h) => heuristic[h] === 'total_amount' || heuristic[h] === 'line_amount');
    const dateSamples = dateColIdx >= 0 ? sampleRows.map((r) => r[dateColIdx] ?? '') : [];
    const amountSamples = amountColIdx >= 0 ? sampleRows.map((r) => r[amountColIdx] ?? '') : [];

    const result: MappingProposal = {
      columnMapping: heuristic,
      unmapped: remaining,
      dateFormat: detectDateFormat(dateSamples),
      amountFormat: detectAmountFormat(amountSamples),
      source: 'heuristic',
    };

    if (!remaining.length || !isAIEnabled()) return result;

    const llmMap = await this.callLLM(remaining, sampleRows, headers);
    if (!llmMap) return result;

    const merged = { ...heuristic };
    const stillUnmapped: string[] = [];
    for (const h of remaining) {
      const proposed = llmMap[h];
      if (proposed && CANONICAL_FIELDS.includes(proposed)) merged[h] = proposed;
      else stillUnmapped.push(h);
    }
    return {
      columnMapping: merged,
      unmapped: stillUnmapped,
      dateFormat: result.dateFormat,
      amountFormat: result.amountFormat,
      source: Object.keys(heuristic).length ? 'mixed' : 'llm',
    };
  }

  private async callLLM(
    unknownHeaders: string[],
    sampleRows: string[][],
    allHeaders: string[],
  ): Promise<Record<string, CanonicalField> | null> {
    const ai = getStreamClient();
    if (!ai) return null;

    const samplePreview = sampleRows.slice(0, 5).map((row) =>
      Object.fromEntries(allHeaders.map((h, i) => [h, row[i] ?? ''])),
    );

    const sys = `You map CSV column headers from accounting/billing exports to a fixed set of canonical fields used by an AP bills system. Respond with JSON only — no commentary. Unknown columns return null. Field names: ${CANONICAL_FIELDS.join(', ')}.`;

    const user = `Map these column headers to canonical fields. Use the sample rows for context.\n\nUnknown headers: ${JSON.stringify(unknownHeaders)}\n\nSample rows:\n${JSON.stringify(samplePreview, null, 2)}\n\nReturn JSON: { "<header>": "<canonical_field_or_null>" }`;

    try {
      const response = await ai.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: sys,
        messages: [{ role: 'user', content: user }],
      });
      const text = response.content.find((b: Anthropic.ContentBlock) => b.type === 'text');
      if (!text || text.type !== 'text') return null;
      const jsonMatch = text.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string | null>;
      const out: Record<string, CanonicalField> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v && CANONICAL_FIELDS.includes(v as CanonicalField)) out[k] = v as CanonicalField;
      }
      return out;
    } catch (err) {
      console.error('AI mapper LLM call failed:', err);
      return null;
    }
  }
}

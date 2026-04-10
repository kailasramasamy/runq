import type { ImportFormat, ParsedInvoice } from '@runq/types';
import { aiParser } from './parsers/ai';
import { genericRowsParser } from './parsers/generic-rows';
import { heuristicParser } from './parsers/heuristic';
import { singleInvoiceTemplateParser } from './parsers/single-invoice-template';
import { isPdf, isSpreadsheet, type InvoiceParser, type ParserInput } from './parsers/shared';

/**
 * Cascade orchestrator. Each parser receives a ParserInput (buffer +
 * mimeType + fileName) and returns null when it can't recognise the
 * format. The cascade tries the next parser. The first parser that
 * returns at least one parseable invoice wins.
 *
 * Phase 1 ships two parsers (generic-rows + single-invoice-template) for
 * spreadsheets. PDFs and unrecognised spreadsheets fall through to the
 * heuristic and AI parsers added in later passes.
 *
 * Order matters: cheap deterministic parsers run before expensive ones,
 * so we never burn AI tokens on a file an explicit parser would have
 * handled cleanly.
 */
const PARSER_ORDER: InvoiceParser[] = [
  genericRowsParser,
  singleInvoiceTemplateParser,
  heuristicParser,
  aiParser,
];

const PARSERS_BY_NAME: Record<string, InvoiceParser> = {
  'generic-rows': genericRowsParser,
  'single-invoice-template': singleInvoiceTemplateParser,
  heuristic: heuristicParser,
  ai: aiParser,
};

export class InvoiceImportParserService {
  private readonly parsers: InvoiceParser[];

  constructor(extraParsers: InvoiceParser[] = []) {
    // Caller can append parsers (heuristic, AI) without touching the
    // cascade module — keeps the wiring testable in isolation.
    this.parsers = [...PARSER_ORDER, ...extraParsers];
  }

  /**
   * Parses a buffer using the requested format. When format='auto', tries
   * each parser in order until one succeeds. Returns the parsed invoices
   * or throws when nothing in the cascade can parse the file.
   */
  async parseBuffer(
    buffer: Buffer,
    fileName: string,
    format: ImportFormat = 'auto',
    mimeType = '',
  ): Promise<ParsedInvoice[]> {
    const input: ParserInput = { buffer, fileName, mimeType: mimeType.toLowerCase() };

    if (format !== 'auto') {
      const parser = PARSERS_BY_NAME[format] ?? this.parsers.find((p) => p.name === format);
      if (!parser) throw new Error(`Unknown parser format: ${format}`);
      const result = await parser.parse(input);
      if (!result || result.length === 0) {
        throw new Error(
          `Parser '${format}' could not extract any invoices from ${fileName}.`,
        );
      }
      return result;
    }

    for (const parser of this.parsers) {
      try {
        const result = await parser.parse(input);
        if (result && result.length > 0) return result;
      } catch (err) {
        // A parser threw — log and continue. We don't fail the whole
        // cascade for one bad parser.
        // eslint-disable-next-line no-console
        console.warn(`Parser ${parser.name} threw on ${fileName}:`, (err as Error).message);
      }
    }

    if (isPdf(input)) {
      throw new Error(
        `${fileName} is a PDF and no parser could handle it. PDF support requires the AI parser — set ANTHROPIC_API_KEY on the API server.`,
      );
    }
    if (!isSpreadsheet(input)) {
      throw new Error(
        `${fileName} has unsupported type '${mimeType || 'unknown'}'. Supported: xlsx, csv, pdf.`,
      );
    }
    throw new Error(
      `No parser could recognise ${fileName}. Supported spreadsheet formats: generic CSV/xlsx with documented headers, single-invoice xlsx templates. For arbitrary layouts the AI fallback is coming in a follow-up.`,
    );
  }
}

export const invoiceImportParserService = new InvoiceImportParserService();

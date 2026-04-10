import type { ImportFormat, ParsedInvoice } from '@runq/types';
import { extractPdfText } from './extractors/pdf-text';
import { extractImageText } from './extractors/image-ocr';
import { aiParser } from './parsers/ai';
import { genericRowsParser } from './parsers/generic-rows';
import { heuristicParser } from './parsers/heuristic';
import { singleInvoiceTemplateParser } from './parsers/single-invoice-template';
import { textHeuristicParser } from './parsers/text-heuristic';
import {
  isImage,
  isPdf,
  isSpreadsheet,
  type InvoiceParser,
  type ParserInput,
} from './parsers/shared';

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
  // text-heuristic operates on pre-extracted text and is the cheapest
  // path for PDFs and images. It runs *before* the AI fallback so we
  // only burn tokens when local intelligence can't parse the document.
  textHeuristicParser,
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
   *
   * For PDF and image inputs the cascade pre-extracts text via pdf-parse
   * or tesseract.js OCR before invoking the parsers. The text-heuristic
   * parser then has a chance to handle the document locally before the
   * AI parser is invoked. The original buffer is preserved on the input
   * so the AI parser can still fall back to Claude Vision when local
   * extraction yields nothing usable.
   */
  async parseBuffer(
    buffer: Buffer,
    fileName: string,
    format: ImportFormat = 'auto',
    mimeType = '',
  ): Promise<ParsedInvoice[]> {
    const input: ParserInput = { buffer, fileName, mimeType: mimeType.toLowerCase() };

    // Pre-extract text for PDFs and images. This is the key step that
    // lets the cheap text-heuristic parser run before AI Vision.
    if (isPdf(input)) {
      const pdf = await extractPdfText(buffer);
      if (pdf.hasUsableText) {
        input.extractedText = pdf.text;
      }
    } else if (isImage(input)) {
      const ocr = await extractImageText(buffer);
      if (ocr.hasUsableText) {
        input.extractedText = ocr.text;
      }
    }

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
        `${fileName} is a PDF and no parser could handle it. Local text extraction came up empty (likely a scanned PDF) and the AI fallback also failed. Check that ANTHROPIC_API_KEY is set on the API server.`,
      );
    }
    if (isImage(input)) {
      throw new Error(
        `${fileName} is an image and no parser could handle it. Local OCR came up empty and the AI fallback also failed. Check that ANTHROPIC_API_KEY is set on the API server.`,
      );
    }
    if (!isSpreadsheet(input)) {
      throw new Error(
        `${fileName} has unsupported type '${mimeType || 'unknown'}'. Supported: xlsx, csv, pdf, jpg, png.`,
      );
    }
    throw new Error(
      `No parser could recognise ${fileName}. Try uploading the source as PDF or jpg/png — the AI fallback handles arbitrary layouts.`,
    );
  }
}

export const invoiceImportParserService = new InvoiceImportParserService();

/**
 * PDF text extraction via pdf-parse v2.
 *
 * Reads a PDF buffer and returns the extracted plain text plus a quality
 * signal so the parser cascade can tell whether the PDF was text-based
 * (selectable text in the original document, e.g. exports from Tally /
 * Zoho / runq's own templates) or scanned (image-only, no text layer).
 *
 * Quality detection is conservative: a PDF whose extracted text is too
 * short or contains too few alphanumeric characters is treated as
 * "low quality" so the cascade falls through to the AI / OCR fallback
 * instead of feeding gibberish to the text-heuristic parser.
 *
 * pdf-parse v2 uses a class-based API (PDFParse) with a getText() method.
 * Lazy-imported via dynamic import so the ESM-only package plays nicely
 * with the API's CommonJS build.
 */

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  /** True when the extracted text looks substantive enough to parse. */
  hasUsableText: boolean;
}

/**
 * Heuristic for "did pdf-parse get something usable?". A scanned PDF
 * with no text layer typically returns either an empty string, a few
 * stray glyphs, or unicode noise. We require:
 *   - at least 80 characters total
 *   - at least 30 alphanumeric characters (filters whitespace-only)
 *   - the alphanumeric ratio is >= 0.2 (filters PDFs that are mostly
 *     control characters or non-text glyphs)
 *
 * Tuned generously: a tiny one-line invoice could legitimately have
 * little text, but real invoices always have addresses, GSTINs, item
 * names, etc. — well above these thresholds.
 */
function isUsableText(text: string): boolean {
  if (text.length < 80) return false;
  const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '').length;
  if (alphanumeric < 30) return false;
  if (alphanumeric / text.length < 0.2) return false;
  return true;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  try {
    // Dynamic ESM import — pdf-parse v2 is type:module while the API is
    // CommonJS, so a static import would force build-system gymnastics.
    // The dynamic import works in both contexts.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = (result.text ?? '').trim();
      return {
        text,
        pageCount: result.total ?? 0,
        hasUsableText: isUsableText(text),
      };
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    // pdf-parse can throw on encrypted PDFs, malformed files, or unsupported
    // formats. Don't propagate — let the cascade fall through to AI Vision.
    // eslint-disable-next-line no-console
    console.warn('pdf-parse failed:', (err as Error).message);
    return { text: '', pageCount: 0, hasUsableText: false };
  }
}

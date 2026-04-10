/**
 * Image OCR via tesseract.js.
 *
 * Used by the parser cascade for jpg/png/webp uploads (phone-scanned
 * invoices, screenshots) so we can run the text-heuristic parser on
 * the OCR output before falling back to AI Vision. The goal is to
 * cover the common case (clean printed invoices) without burning
 * Claude tokens.
 *
 * Tesseract.js is heavy (~50MB including the trained eng data file)
 * but it's the only realistic local OCR option for Node that works
 * cross-platform without system tesseract installed. We mitigate the
 * cost by:
 *
 *   - Lazy-importing tesseract.js so it only loads when an image is
 *     actually uploaded (zero impact on startup / non-image flows)
 *   - Reusing a single Worker across calls — workers are expensive to
 *     spin up (~3-5s for the WASM + model load) so we init once on
 *     first use and keep it alive for the process lifetime
 *   - Logging quietly — tesseract.js spams stdout otherwise
 *
 * Returns null on any failure so the cascade can fall through to AI.
 */

interface TesseractWorker {
  recognize(image: Buffer): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<void>;
}

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tesseract: any = await import('tesseract.js');
    const worker = await tesseract.createWorker('eng', undefined, {
      // Suppress tesseract.js's chatty progress logs.
      logger: () => undefined,
    });
    return worker as TesseractWorker;
  })();
  return workerPromise;
}

export interface OcrResult {
  text: string;
  /** 0..100 average word confidence reported by tesseract. */
  confidence: number;
  /** True when OCR found enough text to be worth feeding to the heuristic. */
  hasUsableText: boolean;
}

function isUsableText(text: string, confidence: number): boolean {
  if (text.length < 80) return false;
  if (confidence < 40) return false;
  const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '').length;
  if (alphanumeric < 30) return false;
  if (alphanumeric / text.length < 0.2) return false;
  return true;
}

export async function extractImageText(buffer: Buffer): Promise<OcrResult> {
  try {
    const worker = await getWorker();
    const result = await worker.recognize(buffer);
    const text = (result.data.text ?? '').trim();
    const confidence = result.data.confidence ?? 0;
    return {
      text,
      confidence,
      hasUsableText: isUsableText(text, confidence),
    };
  } catch (err) {
    // Worker init or recognition failure. Reset the cached promise so the
    // next call gets a fresh worker (transient init failures shouldn't
    // poison the rest of the process).
    workerPromise = null;
    // eslint-disable-next-line no-console
    console.warn('tesseract OCR failed:', (err as Error).message);
    return { text: '', confidence: 0, hasUsableText: false };
  }
}

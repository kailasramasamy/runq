import { extractFromPDF, extractFromImage, isAIEnabled } from '../../utils/ai/claude.service';
import {
  UPI_CONFIRMATION_SYSTEM_PROMPT,
  UPI_CONFIRMATION_USER_PROMPT,
} from '../../utils/ai/prompts/upi-confirmation';
import { AppError } from '../../utils/errors';

export interface ExtractedConfirmation {
  amount: number | null;
  upiRef: string | null;
  payeeName: string | null;
  paymentDate: string | null;
}

const PDF_MIME = 'application/pdf';
const IMAGE_MIMES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

/**
 * Reads a UPI / bank payment-confirmation screenshot and returns the fields
 * needed to pre-fill a quick payment. Reuses the shared Claude-vision helpers;
 * returns all-null when AI is disabled rather than throwing, so capture still
 * works manually.
 */
export class ConfirmationExtractService {
  async extract(buffer: Buffer, mimeType: string): Promise<ExtractedConfirmation> {
    const empty: ExtractedConfirmation = { amount: null, upiRef: null, payeeName: null, paymentDate: null };
    if (!isAIEnabled()) return empty;

    const base64 = buffer.toString('base64');
    let raw: string | null;
    if (mimeType === PDF_MIME) {
      raw = await extractFromPDF(base64, UPI_CONFIRMATION_SYSTEM_PROMPT, UPI_CONFIRMATION_USER_PROMPT, 512);
    } else {
      const media = IMAGE_MIMES[mimeType];
      if (!media) throw new AppError(400, 'Unsupported file type. Upload a PNG, JPG or PDF.');
      raw = await extractFromImage(base64, media, UPI_CONFIRMATION_SYSTEM_PROMPT, UPI_CONFIRMATION_USER_PROMPT, 512);
    }
    if (!raw) return empty;
    return this.parse(raw);
  }

  private parse(rawText: string): ExtractedConfirmation {
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return { amount: null, upiRef: null, payeeName: null, paymentDate: null };
    }
    const amount = typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : null;
    const date = typeof parsed.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.paymentDate)
      ? parsed.paymentDate
      : null;
    return {
      amount,
      upiRef: this.str(parsed.upiRef, 64),
      payeeName: this.str(parsed.payeeName, 255),
      paymentDate: date,
    };
  }

  private str(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length > 0 ? t.slice(0, max) : null;
  }
}

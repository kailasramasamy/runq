import { extractFromImage } from '../../utils/ai/claude.service';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** Fields read off an Aadhaar card. All optional — null when not legible. */
export interface AadhaarFields {
  name: string | null;        // English/Latin name
  nameNative: string | null;  // name in the regional-language script on the card
  aadhaarNumber: string | null;
  gender: 'male' | 'female' | 'other' | null;
  village: string | null;
  address: string | null;
}

const EMPTY: AadhaarFields = {
  name: null, nameNative: null, aadhaarNumber: null,
  gender: null, village: null, address: null,
};

/**
 * Read an Aadhaar card image and extract the farmer's details in one go.
 * The card carries the name in BOTH English and the regional script, so the
 * native name is authentic (no transliteration). Returns EMPTY when AI is off
 * or the response can't be parsed.
 */
export async function extractAadhaar(imageBase64: string, mediaType: ImageMime): Promise<AadhaarFields> {
  const system = 'You read Indian Aadhaar cards and extract the printed fields exactly as shown. '
    + 'Return ONLY a JSON object, no commentary.';
  const user = 'Extract these fields from this Aadhaar card image as JSON: '
    + '{"name": English/Latin name, "nameNative": the name in the regional-language script printed on the card, '
    + '"aadhaarNumber": the 12-digit number with no spaces, '
    + '"gender": "male"|"female"|"other", "village": village or locality from the address, '
    + '"address": the full address as printed}. '
    + 'Use null for any field not clearly visible. Return ONLY the JSON object.';
  const out = await extractFromImage(imageBase64, mediaType, system, user, 1024);
  const obj = out ? parseJsonObject(out) : null;
  return obj ? sanitize(obj) : { ...EMPTY };
}

function sanitize(o: Record<string, unknown>): AadhaarFields {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const digits = str(o.aadhaarNumber)?.replace(/\D/g, '') ?? null;
  const gender = str(o.gender)?.toLowerCase();
  return {
    name: str(o.name),
    nameNative: str(o.nameNative),
    aadhaarNumber: digits && digits.length === 12 ? digits : null,
    gender: gender === 'male' || gender === 'female' || gender === 'other' ? gender : null,
    village: str(o.village),
    address: str(o.address),
  };
}

/** Pull a JSON object out of a model response that may have stray prose. */
function parseJsonObject(s: string): Record<string, unknown> | null {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(s.slice(start, end + 1));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

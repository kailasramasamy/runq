import { analyze } from '../../utils/ai/claude.service';

/**
 * Target language code → script name for the prompt. `en` = Latin/Roman, so the
 * same service romanizes a native-script name back to Latin (e.g. a dictated
 * Tamil name → the Latin `name` banks/records need).
 */
const SCRIPTS: Record<string, string> = {
  ta: 'Tamil', kn: 'Kannada', hi: 'Hindi', te: 'Telugu',
  ml: 'Malayalam', gu: 'Gujarati', bn: 'Bengali',
  en: 'Latin (Roman / English spelling)',
};

/**
 * Phonetically transliterate personal names into a target script in either
 * direction (Latin→Indic or Indic→Latin) — NOT a translation. Returns one entry
 * per input in the same order; an entry is null when transliteration is
 * unavailable (AI off, unknown target, or malformed output) so callers fall back.
 */
export async function transliterateNames(names: string[], lang: string): Promise<(string | null)[]> {
  if (names.length === 0) return [];
  const target = SCRIPTS[lang];
  if (!target) return names.map(() => null);
  const system = `Transliterate these Indian names and place names into ${target} script, `
    + 'PHONETICALLY by pronunciation — never translate the meaning. '
    + 'Return ONLY a JSON array of strings, one per input, in the same order. No commentary.';
  const out = await analyze(system, JSON.stringify(names), 2048);
  if (!out) return names.map(() => null);
  const parsed = parseJsonArray(out);
  if (!parsed || parsed.length !== names.length) return names.map(() => null);
  return parsed.map((v) => (typeof v === 'string' && v.trim() ? v.trim() : null));
}

/** Single-name convenience for the live add-farmer suggestion. */
export async function transliterateName(name: string, lang: string): Promise<string | null> {
  const [r] = await transliterateNames([name], lang);
  return r ?? null;
}

/** Pull the JSON array out of a model response that may have stray prose. */
function parseJsonArray(s: string): unknown[] | null {
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

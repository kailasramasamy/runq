/**
 * HSN → canonical UQC family.
 *
 * When an item is created without an explicit pack_size_uqc, we default
 * to the natural physical family of its HSN chapter so the GSTR-1 HSN
 * summary reports in LTR/KGS rather than the imprecise NOS fallback.
 *
 * The mapping is intentionally coarse — chapter-level. Sub-headings
 * with mixed physical forms (e.g. 3004 medicaments are sold both as
 * solids and liquids; 3401 soap as bars and liquids) return null so
 * the caller falls back to NOS rather than risk a mixed-UQC error in
 * accumulateHSN.
 */

type HsnFamily = 'LTR' | 'KGS' | null;

/** Returns the canonical UQC for an HSN code, or null if mixed-form. */
export function canonicalUqcForHsn(hsn: string | null | undefined): HsnFamily {
  const code = (hsn ?? '').replace(/\D/g, '');
  if (code.length < 2) return null;
  const chapter = code.substring(0, 2);
  const heading = code.substring(0, 4);

  // Mixed-form headings — return null to force NOS.
  if (heading === '3004' || heading === '3401') return null;

  // Volume (litres): milk + edible oils.
  if (heading === '0401' || heading === '0402') return 'LTR';
  if (chapter === '15') return 'LTR';
  if (heading === '0403' && code.startsWith('04039')) return 'LTR'; // buttermilk

  // Mass (kilograms): everything else that's a measurable physical good.
  if (chapter === '04') return 'KGS'; // dairy solids
  if (chapter === '07' || chapter === '08' || chapter === '09') return 'KGS';
  if (chapter === '10' || chapter === '11' || chapter === '12') return 'KGS';
  if (chapter === '17' || chapter === '19' || chapter === '20') return 'KGS';
  if (chapter === '25') return 'KGS';

  return null;
}

/** Default pack size to apply when the user hasn't set one. */
export function defaultPackSize(
  hsn: string | null | undefined,
  unitHint: string | null | undefined,
): { packSizeValue: number; packSizeUqc: string } {
  const canonical = canonicalUqcForHsn(hsn);
  if (canonical) return { packSizeValue: 1, packSizeUqc: canonical };

  const cleaned = (unitHint ?? '').trim().toUpperCase();
  if (cleaned) return { packSizeValue: 1, packSizeUqc: cleaned };
  return { packSizeValue: 1, packSizeUqc: 'NOS' };
}

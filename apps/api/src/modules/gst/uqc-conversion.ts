/**
 * GSTN UQC normalization for the GSTR-1 HSN summary.
 *
 * Items in the master may be stored with pack sizes in any UoM (100 ML,
 * 250 GM, 1 LTR, 12 PCS …). For the HSN summary we convert every line to
 * a canonical UQC per family so variants of the same product roll up
 * correctly:
 *
 *   ML  → LTR  (÷ 1000)
 *   GMS → KGS  (÷ 1000)
 *   MLT → LTR  (÷ 1000)   — legacy data label, kept for backwards-compat
 *   LTR, KGS, NOS, PCS, MTR, SQM, KME, BOX, BAG, … → identity
 *
 * Each canonical UQC has a "family" — buckets that can sum together. We
 * never cross families (you can't sum LTR + KGS into one HSN row), so if
 * a single HSN bucket sees mixed families we throw with offending
 * invoice IDs rather than silently producing wrong numbers.
 */

export type CanonicalUqc = 'LTR' | 'KGS' | 'NOS' | 'MTR' | 'SQM' | 'KME' | 'BOX' | 'BAG' | 'PAC' | 'OTH';

interface UqcRule {
  /** Canonical UQC the source unit converts into. */
  canonical: CanonicalUqc;
  /** Multiplier applied to the source value to get canonical units. */
  factor: number;
}

const UQC_RULES: Record<string, UqcRule> = {
  // Volume → LTR
  ML: { canonical: 'LTR', factor: 0.001 },
  MLT: { canonical: 'LTR', factor: 0.001 },
  LTR: { canonical: 'LTR', factor: 1 },
  KLR: { canonical: 'LTR', factor: 1000 },

  // Mass → KGS
  GM: { canonical: 'KGS', factor: 0.001 },
  GMS: { canonical: 'KGS', factor: 0.001 },
  KGS: { canonical: 'KGS', factor: 1 },
  TON: { canonical: 'KGS', factor: 1000 },
  MTS: { canonical: 'KGS', factor: 1000 },
  QTL: { canonical: 'KGS', factor: 100 },

  // Length → MTR
  CMS: { canonical: 'MTR', factor: 0.01 },
  MTR: { canonical: 'MTR', factor: 1 },
  KME: { canonical: 'KME', factor: 1 },
  YDS: { canonical: 'MTR', factor: 0.9144 },

  // Area → SQM
  SQM: { canonical: 'SQM', factor: 1 },
  SQF: { canonical: 'SQM', factor: 0.092903 },
  SQY: { canonical: 'SQM', factor: 0.836127 },

  // Count → NOS
  NOS: { canonical: 'NOS', factor: 1 },
  PCS: { canonical: 'NOS', factor: 1 },
  PRS: { canonical: 'NOS', factor: 1 },
  UNT: { canonical: 'NOS', factor: 1 },
  DOZ: { canonical: 'NOS', factor: 12 },
  GGR: { canonical: 'NOS', factor: 144 },

  // Pack/container — kept as their own family
  BOX: { canonical: 'BOX', factor: 1 },
  BAG: { canonical: 'BAG', factor: 1 },
  PAC: { canonical: 'PAC', factor: 1 },
  BDL: { canonical: 'PAC', factor: 1 },
  BUN: { canonical: 'PAC', factor: 1 },
  CAN: { canonical: 'PAC', factor: 1 },
  DRM: { canonical: 'PAC', factor: 1 },
  ROL: { canonical: 'PAC', factor: 1 },
  TBS: { canonical: 'PAC', factor: 1 },
  TUB: { canonical: 'PAC', factor: 1 },

  // Volume — alternate
  CBM: { canonical: 'OTH', factor: 1 },
  CCM: { canonical: 'OTH', factor: 1 },

  OTH: { canonical: 'OTH', factor: 1 },
};

/** Normalize a free-form unit string to an upper-case key we can look up. */
export function normalizeUomKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Convert a (qty, uom) pair into canonical (qty, uqc).
 * Returns null if the uom is unrecognised — caller decides how to surface.
 */
export function toCanonical(
  qty: number,
  uom: string | null | undefined,
): { qty: number; uqc: CanonicalUqc } | null {
  const key = normalizeUomKey(uom);
  const rule = UQC_RULES[key];
  if (!rule) return null;
  return { qty: qty * rule.factor, uqc: rule.canonical };
}

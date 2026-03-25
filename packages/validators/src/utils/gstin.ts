const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const CHECKSUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validates GSTIN format: 2-digit state code + 10-char PAN + entity number + Z + check digit.
 * Format validation ensures structural correctness.
 * For full verification (legal name, active status), use the GSTIN API lookup.
 */
export function validateGSTIN(gstin: string): { valid: boolean; error?: string } {
  if (!gstin || typeof gstin !== 'string') {
    return { valid: false, error: 'GSTIN is required' };
  }

  const upper = gstin.toUpperCase().trim();

  if (upper.length !== 15) {
    return { valid: false, error: 'GSTIN must be 15 characters' };
  }

  if (!GSTIN_REGEX.test(upper)) {
    return { valid: false, error: 'Invalid GSTIN format' };
  }

  const stateCode = parseInt(upper.slice(0, 2), 10);
  if (stateCode < 1 || stateCode > 38) {
    return { valid: false, error: 'Invalid state code in GSTIN' };
  }

  return { valid: true };
}

/**
 * Extracts the PAN from a GSTIN (characters 3-12).
 */
export function extractPANFromGSTIN(gstin: string): string {
  return gstin.slice(2, 12);
}

/**
 * Extracts the 2-digit state code from a GSTIN.
 */
export function extractStateCodeFromGSTIN(gstin: string): string {
  return gstin.slice(0, 2);
}

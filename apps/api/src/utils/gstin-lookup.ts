/**
 * GSTIN verification via public GST search API.
 * Returns basic taxpayer info: legal name, trade name, registration status, state.
 *
 * Uses the public GST API endpoint that doesn't require authentication.
 * Rate limit: be conservative, cache results.
 */

export interface GstinLookupResult {
  gstin: string;
  legalName: string;
  tradeName: string;
  status: 'Active' | 'Cancelled' | 'Suspended' | 'Inactive' | string;
  stateCode: string;
  registrationDate: string | null;
  businessType: string | null;
}

interface GstApiResponse {
  flag: string;
  data?: {
    lgnm?: string;
    tradeNam?: string;
    sts?: string;
    stj?: string;
    dty?: string;
    rgdt?: string;
  };
  message?: string;
}

const GST_API_URL = 'https://sheet.gstincheck.co.in/check';

/**
 * Looks up GSTIN details from the public GST API.
 * Requires GSTIN_API_KEY env var for the free-tier gstincheck API.
 * Returns null if lookup fails or API is unavailable.
 */
export async function lookupGSTIN(gstin: string): Promise<GstinLookupResult | null> {
  const apiKey = process.env.GSTIN_API_KEY;
  if (!apiKey) {
    return null;
  }

  const url = `${GST_API_URL}/${apiKey}/${gstin}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as GstApiResponse;

  if (json.flag !== 'true' || !json.data) {
    return null;
  }

  const d = json.data;
  return {
    gstin,
    legalName: d.lgnm ?? '',
    tradeName: d.tradeNam ?? '',
    status: d.sts ?? 'Unknown',
    stateCode: gstin.slice(0, 2),
    registrationDate: d.rgdt ?? null,
    businessType: d.dty ?? null,
  };
}

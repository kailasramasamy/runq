import { createHmac, timingSafeEqual } from 'node:crypto';

// Signed, self-contained token for the public statement PDF endpoint. Interakt
// (WhatsApp) fetches the bill/statement from an unauthenticated URL, so the token
// IS the authorization: an HMAC over the payload, scoped to one document, expiring
// after a week (long enough for the recipient to re-open it from their chat).

export interface VmccBillTokenData { k: 'vb'; t: string; n: string; y: number; m: number; h: 'first' | 'second' }
export interface FarmerStmtTokenData { k: 'fs'; t: string; f: string; from: string; to: string }
export type StatementTokenData = (VmccBillTokenData | FarmerStmtTokenData) & { exp: number };

const TTL_SECONDS = 60 * 60 * 24 * 7;

function secret(): string {
  return process.env.JWT_SECRET ?? '';
}

export function signStatementToken(payload: VmccBillTokenData | FarmerStmtTokenData): string | null {
  const s = secret();
  if (!s) return null;
  const body = JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS });
  const data = Buffer.from(body).toString('base64url');
  const sig = createHmac('sha256', s).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyStatementToken(token: string): StatementTokenData | null {
  const s = secret();
  if (!s) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expect = createHmac('sha256', s).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString()) as StatementTokenData;
    if (typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

/** Absolute public URL Interakt fetches the PDF from. Null when the signing
 *  secret or the public base URL isn't configured (so the caller no-ops). */
export function statementPdfUrl(payload: VmccBillTokenData | FarmerStmtTokenData): string | null {
  const token = signStatementToken(payload);
  const base = process.env.APP_BASE_URL;
  if (!token || !base) return null;
  return `${base.replace(/\/+$/, '')}/api/v1/mp/statement/${token}`;
}

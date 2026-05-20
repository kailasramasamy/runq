/**
 * Pure helpers for rendering letters from tenant templates. Extracted from
 * lifecycle.routes.ts so the HR agent and other callers can issue letters
 * without depending on the route module.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { tenants, users } from '@runq/db';

function lookupToken(ctx: Record<string, unknown>, key: string): string {
  const parts = key.split('.');
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return '';
    }
  }
  return cur == null ? '' : String(cur);
}

/**
 * Handlebars-style render: {{token}} substitution + {{#if path}}…{{/if}}
 * conditional blocks. Missing tokens render as empty strings; left-over
 * blank lines from removed `#if` blocks are collapsed.
 */
export function renderTemplate(body: string, ctx: Record<string, unknown>): string {
  let out = body.replace(/\{\{\s*#if\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g, (_m, key, inner) => {
    const val = lookupToken(ctx, String(key)).trim();
    return val ? String(inner) : '';
  });
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => lookupToken(ctx, String(key)));
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

/**
 * Build the {{company.*}} + {{hr.*}} token block used in every letter.
 * Reads tenant.settings JSON (company profile + HR signatory). If no HR
 * signatory is configured, falls back to the issuing user's name.
 */
export async function buildLetterheadTokens(
  db: Db,
  tenantId: string,
  issuedByUserId?: string | null,
) {
  const [t] = await db
    .select({ name: tenants.name, settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const s = (t?.settings ?? {}) as Record<string, unknown>;
  const hr = (s.hrSignatory ?? {}) as Record<string, unknown>;

  let signatoryName = (hr.name as string | undefined) ?? '';
  const signatoryDesignation = (hr.designation as string | undefined) ?? 'Human Resources';
  if (!signatoryName && issuedByUserId) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, issuedByUserId)).limit(1);
    signatoryName = u?.name ?? '';
  }

  const company = {
    name: (s.legalName as string | undefined) ?? t?.name ?? '',
    legalName: (s.legalName as string | undefined) ?? t?.name ?? '',
    addressLine1: (s.addressLine1 as string | undefined) ?? '',
    addressLine2: (s.addressLine2 as string | undefined) ?? '',
    city: (s.city as string | undefined) ?? '',
    state: (s.state as string | undefined) ?? '',
    pincode: (s.pincode as string | undefined) ?? '',
    gstin: (s.gstin as string | undefined) ?? '',
    cin: (s.cin as string | undefined) ?? '',
    email: (s.companyEmail as string | undefined) ?? '',
    phone: (s.companyPhone as string | undefined) ?? '',
    website: (s.website as string | undefined) ?? '',
    addressBlock: [
      s.addressLine1, s.addressLine2,
      [s.city, s.state, s.pincode].filter(Boolean).join(', '),
    ].filter((line) => line && String(line).trim()).join('\n'),
  };

  return {
    company,
    hr: {
      signatoryName,
      signatoryDesignation,
      signatoryEmail: (hr.email as string | undefined) ?? '',
      signatureImageUrl: (hr.signatureImageUrl as string | undefined) ?? '',
    },
  };
}

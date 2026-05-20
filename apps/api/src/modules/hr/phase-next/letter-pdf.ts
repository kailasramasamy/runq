// Render an issued letter to a PDF buffer with company letterhead + HR
// signature image. The letter body is plain text (preserves newlines via
// CSS) — we keep formatting simple so HR can edit templates in the web
// editor without worrying about HTML.

import { renderHtmlToPdf } from '../../ar/invoice-pdf';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dataUri(buf: Buffer | null, mime = 'image/png'): string | null {
  if (!buf || buf.length === 0) return null;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export interface LetterPdfInput {
  companyName: string;
  companyAddressBlock: string;
  companyGstin?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  logo: Buffer | null;
  /** Already-rendered letter body (plain text with \n). */
  body: string;
  subject?: string | null;
  /** HR signatory shown below the signature image. */
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  signatureImage: Buffer | null;
}

// Seeded letter templates embed a plain-text letterhead block:
//   {{company.legalName}}
//   {{company.addressBlock}}
//   GSTIN: ...
//
//   Date: ...
//
// The PDF renders that letterhead visually via the HTML header, so we
// strip the textual one to avoid duplication. Detect via the "Date: " line
// — present in every seeded template. Custom templates that don't follow
// the pattern are rendered verbatim.
function splitLetterhead(body: string): { date: string | null; body: string } {
  let working = body;
  // Strip trailing typed signature block — the PDF footer renders it
  // visually with the signature image, so leaving the textual version in
  // the body would duplicate the signatory name + designation.
  const sigStart = working.search(/\n+Sincerely,\s*\n/);
  if (sigStart !== -1) working = working.slice(0, sigStart);
  let date: string | null = null;
  const m = working.match(/(^|\n)Date:\s*([^\n]+)\n+/);
  if (m && m.index != null) {
    date = m[2].trim();
    working = working.slice(m.index + m[0].length);
  }
  return { date, body: working.trim() };
}

export async function renderLetterPdf(input: LetterPdfInput): Promise<Buffer> {
  const logoUri = dataUri(input.logo);
  const sigUri = dataUri(input.signatureImage);
  const { date, body } = splitLetterhead(input.body);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.subject ?? 'Letter')}</title>
<style>
  @page { size: A4; margin: 18mm 18mm 22mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Georgia', 'Times New Roman', serif; color: #1a1a1a; }
  body { font-size: 11.5pt; line-height: 1.55; }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px;
    gap: 16px;
  }
  .header .company {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    flex: 1 1 auto;
  }
  .header .company .name { font-size: 18pt; font-weight: 700; color: #0f172a; line-height: 1.2; }
  .header .company .meta { font-size: 9.5pt; color: #475569; white-space: pre-line; margin-top: 4px; }
  /* Logo sits in a fixed slot vertically centered against the company
     block. Capped so even square logos don't dwarf the address. */
  .header .logo-slot {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
    height: 96px; width: 96px;
  }
  .header .logo {
    max-height: 100%; max-width: 100%; object-fit: contain;
  }
  .body { white-space: pre-wrap; }
  .body p:first-child { margin-top: 0; }
  .footer { margin-top: 36px; }
  .signature-img { max-height: 70px; max-width: 220px; object-fit: contain; display: block; margin-bottom: -8px; }
  .signature-line { border-top: 1px solid #1a1a1a; width: 220px; margin-top: 2px; padding-top: 4px; }
  .signatory { font-weight: 600; }
  .designation { color: #475569; font-size: 10.5pt; }
  .doc-footer {
    position: fixed; bottom: 8mm; left: 0; right: 0;
    text-align: center; font-size: 8.5pt; color: #94a3b8;
    font-family: 'Helvetica Neue', Arial, sans-serif;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">
      <div class="name">${escapeHtml(input.companyName || '')}</div>
      <div class="meta">${escapeHtml(
        [
          input.companyAddressBlock || '',
          input.companyPhone ? `Phone: ${input.companyPhone}` : '',
          input.companyEmail ? `Email: ${input.companyEmail}` : '',
          input.companyWebsite ? input.companyWebsite : '',
          input.companyGstin ? `GSTIN: ${input.companyGstin}` : '',
        ].filter(Boolean).join('\n'),
      )}</div>
    </div>
    ${logoUri ? `<div class="logo-slot"><img class="logo" src="${logoUri}" alt="" /></div>` : ''}
  </div>

  ${date ? `<div style="text-align:right;font-size:10.5pt;color:#475569;margin-bottom:18px;">${escapeHtml(date)}</div>` : ''}

  <div class="body">${escapeHtml(body)}</div>

  <div class="footer">
    ${sigUri ? `<img class="signature-img" src="${sigUri}" alt="" />` : ''}
    <div class="signature-line"></div>
    <div class="signatory">${escapeHtml(input.signatoryName || '')}</div>
    <div class="designation">${escapeHtml(input.signatoryDesignation || '')}</div>
  </div>

  <div class="doc-footer">
    This is a system-generated document from ${escapeHtml(input.companyName || 'runq')} HR.
  </div>
</body>
</html>`;

  return renderHtmlToPdf(html);
}

import puppeteer, { type Browser } from 'puppeteer';

/**
 * Render invoice HTML → PDF via headless Chromium.
 *
 * Reuses a single Browser instance across calls to avoid the ~500ms cold-start
 * cost of launching Chromium per request. The instance is lazily created on
 * first PDF request and disposed on process exit by the OS — Fastify doesn't
 * have a global "before close" hook here, but a leaked Chromium process is
 * the OS's problem at shutdown, not ours.
 *
 * The HTML template's existing `@page { size: A4; margin: 15mm }` print rules
 * apply automatically — no separate CSS needed for the PDF path.
 */

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Inject the HTML directly. `networkidle0` waits for fonts/external CSS
    // (the Google Font preconnect in the template) to settle so the PDF
    // matches what the browser would render.
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Hide the print button — it's only useful in the HTML view.
    await page.addStyleTag({ content: '.print-btn { display: none !important; }' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

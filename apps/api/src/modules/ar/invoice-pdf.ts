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

function launch(): Promise<Browser> {
  const launching = puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    // In production we use the Alpine-installed system Chromium (set via
    // PUPPETEER_EXECUTABLE_PATH in the Dockerfile). In dev we let puppeteer
    // find its own bundled binary.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  browserPromise = launching;
  // A failed launch must not be cached: a rejected promise would be replayed to
  // every later request, so one bad start would kill PDFs for the process's
  // whole life.
  launching.catch(() => { if (browserPromise === launching) browserPromise = null; });
  return launching;
}

/**
 * The shared Chromium, relaunched if it has gone away.
 *
 * Chromium dies for reasons outside this process — a crash, an OOM kill, the
 * machine sleeping. The cached promise then keeps handing out a dead Browser
 * and every PDF fails instantly with "Connection closed." until the API is
 * restarted, which is exactly what happened to statement downloads. Checking
 * `connected` before reuse makes that self-healing.
 */
async function getBrowser(): Promise<Browser> {
  const existing = browserPromise;
  if (existing) {
    try {
      const browser = await existing;
      if (browser.connected) return browser;
    } catch {
      // Launch failed; the catch above already cleared the cache — relaunch.
    }
    if (browserPromise === existing) browserPromise = null;
  }
  return launch();
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // `load`, not `networkidle0`. Both wait for stylesheets, images and fonts;
    // `networkidle0` then sits for a further half-second of quiet on top,
    // which for this template is pure dead time — it embeds its CSS and
    // fetches nothing. Measured on a real invoice: setContent went from 934ms
    // to 13ms with a byte-identical PDF.
    await page.setContent(html, { waitUntil: 'load' });
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

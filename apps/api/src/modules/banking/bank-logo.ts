/**
 * Resolve a public logo URL for a given bank/payment-processor name.
 *
 * The list maps common substrings (case-insensitive) to a primary domain;
 * the URL is built using Google's faviconV2 service which returns a 256px
 * PNG and works without an API key. If you later want crisper logos, just
 * swap the URL builder — call sites stay the same.
 */

const BANK_DOMAINS: Array<readonly [match: string, domain: string]> = [
  // Longer keywords first — first match wins.
  ['state bank', 'sbi.co.in'],
  ['bank of baroda', 'bankofbaroda.in'],
  ['punjab national', 'pnbindia.in'],
  ['hdfc', 'hdfcbank.com'],
  ['icici', 'icicibank.com'],
  ['axis', 'axisbank.com'],
  ['kotak', 'kotak.com'],
  ['yes bank', 'yesbank.in'],
  ['idfc', 'idfcfirstbank.com'],
  ['indusind', 'indusind.com'],
  ['federal', 'federalbank.co.in'],
  ['bandhan', 'bandhanbank.com'],
  ['canara', 'canarabank.com'],
  ['union', 'unionbankofindia.co.in'],
  ['idbi', 'idbibank.in'],
  ['karur', 'kvbmail.com'],
  ['city union', 'cityunionbank.com'],
  ['south indian', 'southindianbank.com'],
  ['rbl', 'rblbank.com'],
  ['au small', 'aubank.in'],
  ['pnb', 'pnbindia.in'],
  ['bob', 'bankofbaroda.in'],
  ['sbi', 'sbi.co.in'],
  ['razorpay', 'razorpay.com'],
  ['cashfree', 'cashfree.com'],
  ['phonepe', 'phonepe.com'],
  ['paytm', 'paytm.com'],
  ['stripe', 'stripe.com'],
];

export function resolveBankLogoUrl(bankName: string | null | undefined): string | null {
  if (!bankName) return null;
  const s = bankName.toLowerCase();
  // Skip cash / on-hand entries — no real brand to fetch.
  if (/(^|\s)(cash|petty|on[\s-]?hand)/.test(s)) return null;
  for (const [match, domain] of BANK_DOMAINS) {
    if (s.includes(match)) {
      return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`;
    }
  }
  return null;
}

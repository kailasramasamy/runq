/**
 * Whether a stand-in may go out against a line that billed something else.
 *
 * Substituting is a warehouse decision with an accounting tail. The invoice is
 * already issued: it carries the original item's HSN, its GST rate and its
 * price, and dispatching a different SKU against it does not change one of
 * them. So the question this module answers is not "is there stock" — it is
 * "does sending this leave the document still true".
 *
 * Two different answers, because the two mismatches are not the same kind of
 * problem:
 *
 *   • **Tax** — a different HSN or GST rate makes the invoice misdescribe the
 *     goods, and that flows into GSTR-1. Nothing the operator can type fixes
 *     it, so it is refused outright and the invoice has to be credited and
 *     re-raised.
 *
 *   • **Price** — the substitute lists dearer or cheaper than what was billed.
 *     The document stays true (the customer is charged what they were quoted);
 *     someone has simply given away or gained margin. That is a commercial
 *     call, not an error, so it needs a hand on it rather than a refusal — the
 *     operator says why, and the van leaves.
 */

/** The billed line, as the invoice records it. */
export interface BilledLine {
  itemName: string;
  hsnSacCode: string | null;
  taxRate: number | null;
  unitPrice: number;
}

/** The stand-in, as the item master records it. */
export interface SubstituteItem {
  itemId: string;
  itemName: string;
  hsnSacCode: string | null;
  gstRate: number | null;
  defaultSellingPrice: number | null;
}

export type SubstitutionCheck =
  /** Tax matches and so does the money — nothing to ask. */
  | { verdict: 'clear' }
  /** Allowed, but only against an explicit reason. */
  | { verdict: 'needs_note'; message: string }
  /** Not dispatchable against this invoice at all. */
  | { verdict: 'blocked'; message: string };

/** Rates are numeric(5,2); compare at the precision they're stored, not by ===. */
function sameRate(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * A missing HSN on either side is not a match. Treating null as a wildcard
 * would wave through exactly the un-classified items most likely to be filed
 * wrong, and an item with no HSN is a master-data gap to fix before it ships
 * against someone else's tax line.
 */
function sameHsn(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.trim() === b.trim();
}

export function checkSubstitution(
  billed: BilledLine,
  sub: SubstituteItem,
): SubstitutionCheck {
  if (!sameHsn(billed.hsnSacCode, sub.hsnSacCode)) {
    return {
      verdict: 'blocked',
      message: `${sub.itemName} is HSN ${sub.hsnSacCode ?? 'unset'} but the line billed `
        + `${billed.hsnSacCode ?? 'unset'}. Shipping it would misdescribe the invoice for GST — `
        + `credit this invoice and re-bill against ${sub.itemName}.`,
    };
  }
  if (!sameRate(billed.taxRate, sub.gstRate)) {
    return {
      verdict: 'blocked',
      message: `${sub.itemName} is taxed at ${sub.gstRate ?? 0}% but the line billed `
        + `${billed.taxRate ?? 0}%. Credit this invoice and re-bill against ${sub.itemName}.`,
    };
  }
  // No list price on the substitute is not a mismatch to confirm — there is
  // nothing to compare it against, and the customer pays the billed rate
  // either way.
  if (sub.defaultSellingPrice !== null && !sameMoney(billed.unitPrice, sub.defaultSellingPrice)) {
    const dearer = sub.defaultSellingPrice > billed.unitPrice;
    return {
      verdict: 'needs_note',
      message: `${sub.itemName} lists at ₹${sub.defaultSellingPrice} against ₹${billed.unitPrice} `
        + `billed for ${billed.itemName} — ${dearer ? 'you absorb' : 'the customer pays'} the `
        + `₹${Math.abs(round2(sub.defaultSellingPrice - billed.unitPrice))} difference. `
        + `Say why to send it at the billed price.`,
    };
  }
  return { verdict: 'clear' };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

import { describe, it, expect } from 'vitest';
import {
  reconcileQuantities,
  cleanDescription,
  type ExtractedItem,
  type LineMatch,
} from './po-parser.service';

function item(partial: Partial<ExtractedItem>): ExtractedItem {
  return {
    description: 'Item',
    customerSku: null,
    quantity: 0,
    uom: null,
    rate: null,
    amount: null,
    taxRatePct: null,
    taxableAmount: null,
    taxAmount: null,
    ...partial,
  };
}

function match(resolvedRate: number | null, itemGstRate: number | null = 0): LineMatch {
  return {
    itemId: resolvedRate == null ? null : 'item-uuid',
    source: 'alias',
    confidence: 1,
    resolvedRate,
    resolvedUom: null,
    itemGstRate,
  };
}

// Pre-tax rates as PriceResolverService returns them: price-list landing
// (MRP × (1 − margin)) backed out of GST, or items.basic_price.
const COCONUT_BASE = (55.0 * 0.68) / 1.05;
const OIL_BASE = (50.0 * 0.68) / 1.05;

describe('reconcileQuantities', () => {
  // Verbatim from po_drafts.raw_extraction for PO_20260719_160640 — a Type A
  // PO whose table runs "Item Name | Vendor | Rate (Incl GST) | Qty | ...".
  // The extractor transposed rate and qty on five lines and lifted the pack
  // size out of the product name on the other two. Every `amount` is right.
  it('recovers quantities from the 4amFresh PO the extractor mangled', () => {
    const items = [
      item({ description: 'Cow Milk Paneer 200grams', quantity: 90, rate: 28, amount: 2520 }),
      item({ description: 'A2 Milk', quantity: 500, uom: 'ml', rate: 35.25, amount: 282 }),
      item({ description: 'Cow Milk 500ml', quantity: 27, rate: 4, amount: 108 }),
      item({ description: 'Buffalo Milk500ml', quantity: 39.75, rate: 3, amount: 119.25 }),
      item({ description: 'Coconut oil', quantity: 100, uom: 'ml', rate: 37.4, amount: 74.8 }),
      item({ description: 'Mustard oil 100ml', quantity: 34, rate: 2, amount: 68 }),
      item({ description: 'Sunflower oil100ml', quantity: 34, rate: 1, amount: 34 }),
    ];
    const matches = [
      match(90.0), match(35.25), match(27.0), match(39.75),
      match(COCONUT_BASE, 5), match(OIL_BASE, 5), match(OIL_BASE, 5),
    ];

    const out = reconcileQuantities(items, matches, true);

    expect(out.items.map((i) => i.quantity)).toEqual([28, 8, 4, 3, 2, 2, 1]);
    expect(out.corrected).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(out.unreconciled).toEqual([]);
  });

  // The failure the PO's own numbers cannot catch: with rate and qty swapped,
  // qty × rate = amount still holds, so only our own price breaks the tie.
  it('corrects a transposed rate/qty pair', () => {
    const out = reconcileQuantities(
      [item({ quantity: 90, rate: 28, amount: 2520 })],
      [match(90.0)],
      true,
    );
    expect(out.items[0].quantity).toBe(28);
  });

  it('leaves a correct extraction alone', () => {
    const items = [item({ quantity: 28, rate: 90, amount: 2520 })];
    const out = reconcileQuantities(items, [match(90.0)], true);
    expect(out.items[0].quantity).toBe(28);
    expect(out.corrected).toEqual([]);
    expect(out.unreconciled).toEqual([]);
  });

  // The flag is null far more often than not: this PO heads its rate column
  // "Rate (Incl GST)" and also prints per-line Base/GST columns, so the
  // extractor can't call the style. Rates here are the 2dp values
  // resolved_rate actually stored, not full-precision.
  it('recovers 5% lines when the PO tax basis is undeterminable', () => {
    const items = [
      item({ description: 'Coconut oil', quantity: 100, uom: 'ml', rate: 37.4, amount: 74.8 }),
      item({ description: 'Mustard oil 100ml', quantity: 34, rate: 2, amount: 68 }),
      item({ description: 'Sunflower oil100ml', quantity: 34, rate: 1, amount: 34 }),
    ];
    const matches = [match(35.62, 5), match(32.38, 5), match(32.38, 5)];

    const out = reconcileQuantities(items, matches, null);

    expect(out.items.map((i) => i.quantity)).toEqual([2, 2, 1]);
    expect(out.unreconciled).toEqual([]);
  });

  it('refuses to guess when both tax bases divide cleanly but disagree', () => {
    // 21 units pre-tax reads as 20 inclusive — both whole, genuinely ambiguous.
    const out = reconcileQuantities(
      [item({ quantity: 999, rate: 100, amount: 2100 })],
      [match(100, 5)],
      null,
    );
    expect(out.items[0].quantity).toBe(999);
    expect(out.unreconciled).toEqual([0]);
  });

  it('uses the document flag to break that tie when it is known', () => {
    const out = reconcileQuantities(
      [item({ quantity: 999, rate: 100, amount: 2100 })],
      [match(100, 5)],
      false,
    );
    expect(out.items[0].quantity).toBe(21);
    expect(out.unreconciled).toEqual([]);
  });

  it('grosses up our pre-tax rate before dividing a GST-inclusive total', () => {
    // 74.80 inclusive ÷ (35.619 × 1.05) = 2. Dividing by the base rate alone
    // would give 2.1 and reconcile to nothing.
    const out = reconcileQuantities(
      [item({ quantity: 100, rate: 37.4, amount: 74.8 })],
      [match(COCONUT_BASE, 5)],
      true,
    );
    expect(out.items[0].quantity).toBe(2);
  });

  it('compares against the pre-tax rate on a Type B PO', () => {
    const out = reconcileQuantities(
      [item({ quantity: 999, rate: 100, amount: 300 })],
      [match(100, 5)],
      false,
    );
    expect(out.items[0].quantity).toBe(3);
  });

  it('keeps a fractional quantity that already reconciles', () => {
    const out = reconcileQuantities(
      [item({ quantity: 2.5, rate: 40, amount: 100 })],
      [match(40)],
      true,
    );
    expect(out.items[0].quantity).toBe(2.5);
    expect(out.corrected).toEqual([]);
    expect(out.unreconciled).toEqual([]);
  });

  it('flags a line that will not divide into a whole quantity', () => {
    const out = reconcileQuantities(
      [item({ quantity: 7, rate: 13, amount: 91 })],
      [match(40)],
      true,
    );
    expect(out.items[0].quantity).toBe(7);
    expect(out.corrected).toEqual([]);
    expect(out.unreconciled).toEqual([0]);
  });

  it('ignores unmatched lines and lines with no printed total', () => {
    const out = reconcileQuantities(
      [item({ quantity: 500, rate: 35.25, amount: 282 }), item({ quantity: 5, rate: 10, amount: null })],
      [match(null), match(10)],
      true,
    );
    expect(out.items.map((i) => i.quantity)).toEqual([500, 5]);
    expect(out.corrected).toEqual([]);
    expect(out.unreconciled).toEqual([]);
  });
});

describe('cleanDescription', () => {
  it('drops a neighbouring column folded in after a tab', () => {
    expect(cleanDescription('Cow Milk 500ml \tVRINDAVAN')).toBe('Cow Milk 500ml');
  });

  it('collapses the runs of whitespace that alias lookups choke on', () => {
    expect(cleanDescription('Buffalo  Milk500ml   ')).toBe('Buffalo Milk500ml');
  });

  it('falls back when the extractor gives us nothing', () => {
    expect(cleanDescription(null)).toBe('Unknown item');
    expect(cleanDescription('   ')).toBe('Unknown item');
  });
});

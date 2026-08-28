import { describe, expect, it } from 'vitest';
import type { BilledLine, SubstituteItem } from './substitution.logic';
import { checkSubstitution } from './substitution.logic';

function billed(over: Partial<BilledLine> = {}): BilledLine {
  return {
    itemName: 'Farm Fresh Natural Milk 500ml',
    hsnSacCode: '04011000',
    taxRate: 0,
    unitPrice: 28,
    ...over,
  };
}

function sub(over: Partial<SubstituteItem> = {}): SubstituteItem {
  return {
    itemId: 'sub-1',
    itemName: 'A2 Desi Cow Milk 500ml',
    hsnSacCode: '04011000',
    gstRate: 0,
    defaultSellingPrice: 28,
    ...over,
  };
}

describe('checkSubstitution', () => {
  it('waves through a like-for-like stand-in', () => {
    expect(checkSubstitution(billed(), sub())).toEqual({ verdict: 'clear' });
  });

  it('blocks a different HSN — the invoice would misdescribe the goods', () => {
    const out = checkSubstitution(billed(), sub({ hsnSacCode: '04039010' }));
    expect(out.verdict).toBe('blocked');
    expect(out).toHaveProperty('message', expect.stringContaining('re-bill'));
  });

  it('blocks a different GST rate', () => {
    const out = checkSubstitution(billed(), sub({ gstRate: 5 }));
    expect(out.verdict).toBe('blocked');
  });

  it('treats a missing HSN as a mismatch rather than a wildcard', () => {
    expect(checkSubstitution(billed(), sub({ hsnSacCode: null })).verdict).toBe('blocked');
    expect(checkSubstitution(billed({ hsnSacCode: null }), sub()).verdict).toBe('blocked');
  });

  it('asks for a reason when the stand-in lists dearer', () => {
    const out = checkSubstitution(billed({ unitPrice: 28 }), sub({ defaultSellingPrice: 34 }));
    expect(out.verdict).toBe('needs_note');
    expect(out).toHaveProperty('message', expect.stringContaining('you absorb'));
    expect(out).toHaveProperty('message', expect.stringContaining('₹6'));
  });

  it('asks for a reason when the stand-in lists cheaper, naming who gains', () => {
    const out = checkSubstitution(billed({ unitPrice: 34 }), sub({ defaultSellingPrice: 28 }));
    expect(out.verdict).toBe('needs_note');
    expect(out).toHaveProperty('message', expect.stringContaining('the customer pays'));
  });

  it('has nothing to compare when the stand-in carries no list price', () => {
    expect(checkSubstitution(billed(), sub({ defaultSellingPrice: null })))
      .toEqual({ verdict: 'clear' });
  });

  it('does not trip on numeric(5,2) representation noise', () => {
    expect(checkSubstitution(billed({ taxRate: 5 }), sub({ gstRate: 5.001 })).verdict).toBe('clear');
  });
});

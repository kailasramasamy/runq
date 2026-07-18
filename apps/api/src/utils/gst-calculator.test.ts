import { describe, it, expect } from 'vitest';
import { calculateLineItemTax, calculateInvoiceTax } from './gst-calculator';

// Regression cover for the CGST/SGST split. Rounding each half independently
// let both halves round up on a .xx5 boundary, so cgst+sgst overshot the true
// line tax by a paisa on some lines (curd, sunflower oil on PO-20260717-031)
// while leaving others (paneer, ghee) exact. The split must round the full
// line tax once, then take sgst as the remainder.
describe('calculateLineItemTax — intra-state CGST/SGST split', () => {
  const intra = (amount: number, taxRate: number) =>
    calculateLineItemTax({ amount, taxRate, isInterState: false, taxCategory: 'taxable' });

  it('does not overshoot on a .xx5 half-paisa boundary (curd: 321.43 @ 5%)', () => {
    const t = intra(321.43, 5);
    // round(321.43 × 5%) = 16.07; each half 8.035 must NOT independently round to 8.04+8.04=16.08
    expect(t.cgstAmount).toBe(8.04);
    expect(t.sgstAmount).toBe(8.03);
    expect(t.cgstAmount + t.sgstAmount).toBeCloseTo(16.07, 2);
  });

  it('does not overshoot on sunflower oil (1085.41 @ 5%)', () => {
    const t = intra(1085.41, 5);
    expect(t.cgstAmount).toBe(27.14);
    expect(t.sgstAmount).toBe(27.13);
    expect(t.cgstAmount + t.sgstAmount).toBeCloseTo(54.27, 2);
  });

  it('stays exact where halves already divide cleanly (paneer 1200 @ 5%, ghee 712.86 @ 12%)', () => {
    const paneer = intra(1200, 5);
    expect(paneer.cgstAmount).toBe(30);
    expect(paneer.sgstAmount).toBe(30);
    const ghee = intra(712.86, 12);
    expect(ghee.cgstAmount).toBe(42.77);
    expect(ghee.sgstAmount).toBe(42.77);
    expect(ghee.totalTax).toBe(85.54);
  });

  it('always keeps cgst+sgst equal to the once-rounded line tax', () => {
    for (const amount of [321.43, 1200, 712.86, 1085.41, 99.99, 7.5, 250.05]) {
      for (const rate of [5, 12, 18, 28]) {
        const t = intra(amount, rate);
        expect(t.cgstAmount + t.sgstAmount).toBeCloseTo(Math.round(amount * rate) / 100, 10);
      }
    }
  });
});

describe('calculateInvoiceTax — header reconciles with lines (PO-20260717-031)', () => {
  it('sums per-line tax to a header that ties to the PO grand total', () => {
    // taxable value × master GST rate; milk lines are exempt (0%).
    const lines = [
      { amount: 321.43, taxRate: 5, cat: 'taxable' },   // curd
      { amount: 1200.0, taxRate: 5, cat: 'taxable' },   // paneer
      { amount: 740.25, taxRate: 0, cat: 'exempt' },    // A2 milk
      { amount: 712.86, taxRate: 12, cat: 'taxable' },  // ghee
      { amount: 675.75, taxRate: 0, cat: 'exempt' },    // buffalo milk
      { amount: 1085.41, taxRate: 5, cat: 'taxable' },  // sunflower oil
      { amount: 945.0, taxRate: 0, cat: 'exempt' },     // cow milk
    ] as const;

    const withTax = lines.map((l) => ({
      amount: l.amount,
      tax: calculateLineItemTax({
        amount: l.amount,
        taxRate: l.taxRate,
        isInterState: false,
        taxCategory: l.cat,
      }),
    }));
    const summary = calculateInvoiceTax(withTax);

    expect(summary.subtotal).toBe(5680.7);
    expect(summary.taxAmount).toBe(215.88);
    expect(summary.totalAmount).toBe(5896.58); // ties to the PO total exactly
    // Header tax === sum of persisted per-line tax (no drift).
    const lineSum = withTax.reduce((s, l) => s + l.tax.totalTax, 0);
    expect(Math.round(lineSum * 100) / 100).toBe(summary.taxAmount);
  });
});

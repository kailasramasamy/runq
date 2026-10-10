import { describe, it, expect } from 'vitest';
import { calculateLineItemTax, calculateInvoiceTax } from './gst-calculator';

// CGST and SGST must always be equal — GSTN rejects GSTR-1 (RET00047) when an
// intra-state line splits an odd-paisa tax unevenly (8.04 / 8.03). Each half
// is rounded once and reused, so an odd-paisa line tax lands a paisa high.
describe('calculateLineItemTax — intra-state CGST/SGST split', () => {
  const intra = (amount: number, taxRate: number) =>
    calculateLineItemTax({ amount, taxRate, isInterState: false, taxCategory: 'taxable' });

  it('keeps halves equal on a .xx5 boundary (curd: 321.43 @ 5%)', () => {
    const t = intra(321.43, 5);
    expect(t.cgstAmount).toBe(8.04);
    expect(t.sgstAmount).toBe(8.04);
    expect(t.totalTax).toBeCloseTo(16.08, 2);
  });

  it('keeps halves equal on sunflower oil (1085.41 @ 5%)', () => {
    const t = intra(1085.41, 5);
    expect(t.cgstAmount).toBe(27.14);
    expect(t.sgstAmount).toBe(27.14);
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

  it('always emits cgst === sgst', () => {
    for (const amount of [321.43, 1200, 712.86, 1085.41, 99.99, 7.5, 250.05, 128.56, 32.14]) {
      for (const rate of [5, 12, 18, 28]) {
        const t = intra(amount, rate);
        expect(t.cgstAmount).toBe(t.sgstAmount);
      }
    }
  });
});

describe('calculateInvoiceTax — header reconciles with lines', () => {
  it('sums per-line tax into the header with no drift', () => {
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
    // Curd and sunflower oil each land a paisa above the PO (equal halves).
    expect(summary.taxAmount).toBe(215.9);
    expect(summary.totalAmount).toBe(5896.6);
    // Header tax === sum of persisted per-line tax (no drift).
    const lineSum = withTax.reduce((s, l) => s + l.tax.totalTax, 0);
    expect(Math.round(lineSum * 100) / 100).toBe(summary.taxAmount);
  });
});

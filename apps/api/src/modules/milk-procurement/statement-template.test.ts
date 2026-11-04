import { describe, expect, it } from 'vitest';
import { rejectionsSection, renderPourStatementHTML, type PourStatementData } from './statement-template';

const sale = (date: string, amount: number) => ({
  date, qty: amount / 44, unit: 'L', ratePerUnit: 44, amount, itemName: null, milkType: 'cow_a2',
});

function html(amount: number, openingBalance: number, sales: number[]): string {
  const data: PourStatementData = {
    tenantName: 'T', farmer: { name: 'F', code: 'C' }, period: { from: '2026-10-16', to: '2026-10-31' },
    pours: [], byType: [], rejections: [],
    totals: { litres: 0, amount: 0, count: 0, amLitres: 0, pmLitres: 0, avgFat: null, avgSnf: null, avgWater: null },
    settlement: {
      gross: amount, totalDeductions: amount, net: 0, provisional: false,
      deductions: [{ type: 'farmer_sale', amount, openingBalance, lines: sales.map((a) => sale('2026-10-20', a)) }],
    },
    generatedAt: '2026-11-04T00:00:00Z',
  };
  return renderPourStatementHTML(data);
}

describe('statement purchases', () => {
  it('shows what was bought, bridged to the capped recovery', () => {
    const out = html(79395, 0, [88000]);
    expect(out).toContain('− ₹ 88,000.00');
    expect(out).toContain('Carried to your next payment');
    expect(out).toContain('+ ₹ 8,605.00');
    expect(out).not.toContain('− ₹ 79,395.00');
    expect(out).toContain('Carry forward: <strong>₹ 8,605.00</strong> will be adjusted against your next payment');
  });

  it('adds no bridge rows when purchases are recovered in full', () => {
    const out = html(500, 0, [500]);
    expect(out).toContain('− ₹ 500.00');
    expect(out).not.toContain('Carried to your next payment');
    expect(out).not.toContain('Carry forward');
  });

  it('names an earlier balance being recovered now', () => {
    const out = html(800, 300, [500]);
    expect(out).toContain('Less: balance from earlier cycles');
    expect(out).toContain('− ₹ 300.00');
  });
});

describe('statement rejections', () => {
  const row = { collectionDate: '2026-10-30', shift: 'am' as const, milkType: 'buffalo', qtyLitres: 73.9 };

  it('prefers the typed note over the reason code', () => {
    const out = rejectionsSection([{ ...row, reason: 'other', notes: 'Low quality' }]);
    expect(out).toContain('Low quality');
    expect(out).not.toContain('>Other<');
  });

  it('falls back to the reason label', () => {
    expect(rejectionsSection([{ ...row, reason: 'sour' }])).toContain('Sour');
  });
});

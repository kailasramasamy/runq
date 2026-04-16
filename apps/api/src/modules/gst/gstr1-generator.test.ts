import { describe, it, expect } from 'vitest';
import { classifyInvoice } from './gstr1-generator';

// Minimal stubs matching the shape the classifier needs
function makeInvoice(overrides: Partial<{
  totalAmount: string;
  isInterState: boolean | null;
}>): any {
  return {
    id: 'inv-1',
    totalAmount: '100000',
    isInterState: false,
    ...overrides,
  };
}

function makeCustomer(gstin: string | null): any {
  return { gstin };
}

function makeItems(taxCategory: string | null = 'taxable'): any[] {
  return [{
    taxCategory,
    amount: '50000',
    taxRate: '18',
    hsnSacCode: '9983',
  }];
}

describe('classifyInvoice', () => {
  it('classifies invoice with buyer GSTIN as B2B', () => {
    const result = classifyInvoice(
      makeInvoice({}),
      makeCustomer('27AADCB2230M1ZT'),
      makeItems(),
    );
    expect(result).toBe('b2b');
  });

  it('classifies intra-state no-GSTIN invoice as B2CS', () => {
    const result = classifyInvoice(
      makeInvoice({ isInterState: false }),
      makeCustomer(null),
      makeItems(),
    );
    expect(result).toBe('b2cs');
  });

  it('classifies inter-state no-GSTIN invoice <= 2.5L as B2CS', () => {
    const result = classifyInvoice(
      makeInvoice({ isInterState: true, totalAmount: '200000' }),
      makeCustomer(null),
      makeItems(),
    );
    expect(result).toBe('b2cs');
  });

  it('classifies inter-state no-GSTIN invoice > 2.5L as B2CL', () => {
    const result = classifyInvoice(
      makeInvoice({ isInterState: true, totalAmount: '300000' }),
      makeCustomer(null),
      makeItems(),
    );
    expect(result).toBe('b2cl');
  });

  it('classifies all-exempt items as NIL', () => {
    const result = classifyInvoice(
      makeInvoice({}),
      makeCustomer('27AADCB2230M1ZT'),
      makeItems('exempt'),
    );
    expect(result).toBe('nil');
  });

  it('classifies all-nil_rated items as NIL', () => {
    const result = classifyInvoice(
      makeInvoice({}),
      makeCustomer(null),
      makeItems('nil_rated'),
    );
    expect(result).toBe('nil');
  });

  it('classifies all-zero_rated items as NIL', () => {
    const result = classifyInvoice(
      makeInvoice({}),
      makeCustomer('27AADCB2230M1ZT'),
      makeItems('zero_rated'),
    );
    expect(result).toBe('nil');
  });

  it('classifies mixed taxable+exempt items as B2B (not NIL)', () => {
    const items = [
      ...makeItems('taxable'),
      ...makeItems('exempt'),
    ];
    const result = classifyInvoice(
      makeInvoice({}),
      makeCustomer('27AADCB2230M1ZT'),
      items,
    );
    expect(result).toBe('b2b');
  });

  it('handles empty items as B2B if GSTIN present', () => {
    const result = classifyInvoice(
      makeInvoice({}),
      makeCustomer('27AADCB2230M1ZT'),
      [],
    );
    expect(result).toBe('b2b');
  });

  it('handles edge case: exactly 2.5L inter-state as B2CS (not B2CL)', () => {
    const result = classifyInvoice(
      makeInvoice({ isInterState: true, totalAmount: '250000' }),
      makeCustomer(null),
      makeItems(),
    );
    expect(result).toBe('b2cs');
  });
});

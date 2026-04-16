import { describe, it, expect } from 'vitest';
import { validateGstr1 } from './gstr1-validator';
import type { Gstr1Data } from '@runq/db';

function emptyGstr1(): Gstr1Data {
  return { b2b: [], b2cs: [], b2cl: [], cdn: [], exp: [], nil: [], hsn: [], docs: [] };
}

describe('validateGstr1', () => {
  it('returns no errors for empty data', () => {
    const errors = validateGstr1(emptyGstr1(), '032026');
    expect(errors).toEqual([]);
  });

  it('flags invalid buyer GSTIN in B2B', () => {
    const data = emptyGstr1();
    data.b2b = [{
      buyerGstin: 'INVALID',
      invoiceNumber: 'INV-001',
      invoiceDate: '15-03-2026',
      invoiceValue: 10000,
      placeOfSupply: '27',
      reverseCharge: 'N',
      invoiceType: 'R',
      items: [{ taxableValue: 10000, igstAmount: 0, cgstAmount: 900, sgstAmount: 900, cessAmount: 0, gstRate: 18 }],
    }];
    const errors = validateGstr1(data, '032026');
    expect(errors.some((e) => e.section === 'B2B' && e.field === 'buyerGstin')).toBe(true);
  });

  it('flags invalid invoice number format (too long)', () => {
    const data = emptyGstr1();
    data.b2b = [{
      buyerGstin: '27AADCB2230M1ZT',
      invoiceNumber: 'THIS-IS-WAY-TOO-LONG-NUMBER',
      invoiceDate: '15-03-2026',
      invoiceValue: 10000,
      placeOfSupply: '27',
      reverseCharge: 'N',
      invoiceType: 'R',
      items: [{ taxableValue: 10000, igstAmount: 0, cgstAmount: 900, sgstAmount: 900, cessAmount: 0, gstRate: 18 }],
    }];
    const errors = validateGstr1(data, '032026');
    expect(errors.some((e) => e.field === 'invoiceNumber')).toBe(true);
  });

  it('flags invalid GST rate', () => {
    const data = emptyGstr1();
    data.b2b = [{
      buyerGstin: '27AADCB2230M1ZT',
      invoiceNumber: 'INV-001',
      invoiceDate: '15-03-2026',
      invoiceValue: 10000,
      placeOfSupply: '27',
      reverseCharge: 'N',
      invoiceType: 'R',
      items: [{ taxableValue: 10000, igstAmount: 0, cgstAmount: 900, sgstAmount: 900, cessAmount: 0, gstRate: 15 }],
    }];
    const errors = validateGstr1(data, '032026');
    expect(errors.some((e) => e.field === 'gstRate')).toBe(true);
  });

  it('flags missing place of supply in B2CS', () => {
    const data = emptyGstr1();
    data.b2cs = [{
      placeOfSupply: '',
      supplyType: 'INTRA',
      gstRate: 18,
      taxableValue: 5000,
      igstAmount: 0,
      cgstAmount: 450,
      sgstAmount: 450,
      cessAmount: 0,
    }];
    const errors = validateGstr1(data, '032026');
    expect(errors.some((e) => e.section === 'B2CS' && e.field === 'placeOfSupply')).toBe(true);
  });

  it('flags B2CL invoice <= 2.5L', () => {
    const data = emptyGstr1();
    data.b2cl = [{
      invoiceNumber: 'INV-100',
      invoiceDate: '15-03-2026',
      invoiceValue: 200000,
      placeOfSupply: '29',
      gstRate: 18,
      taxableValue: 169492,
      igstAmount: 30508,
    }];
    const errors = validateGstr1(data, '032026');
    expect(errors.some((e) => e.section === 'B2CL' && e.field === 'invoiceValue')).toBe(true);
  });

  it('flags HSN code shorter than 4 digits', () => {
    const data = emptyGstr1();
    data.hsn = [{
      hsnCode: '99',
      description: 'Some service',
      uqc: 'NOS',
      totalQuantity: 10,
      taxableValue: 50000,
      igstAmount: 0,
      cgstAmount: 4500,
      sgstAmount: 4500,
      cessAmount: 0,
      gstRate: 18,
    }];
    const errors = validateGstr1(data, '032026');
    expect(errors.some((e) => e.section === 'HSN' && e.field === 'hsnCode')).toBe(true);
  });

  it('passes valid B2B data with no errors', () => {
    const data = emptyGstr1();
    data.b2b = [{
      buyerGstin: '27AADCB2230M1ZT',
      invoiceNumber: 'INV-001',
      invoiceDate: '15-03-2026',
      invoiceValue: 11800,
      placeOfSupply: '27',
      reverseCharge: 'N',
      invoiceType: 'R',
      items: [{ taxableValue: 10000, igstAmount: 0, cgstAmount: 900, sgstAmount: 900, cessAmount: 0, gstRate: 18 }],
    }];
    data.hsn = [{
      hsnCode: '9983',
      description: 'IT Services',
      uqc: 'NOS',
      totalQuantity: 1,
      taxableValue: 10000,
      igstAmount: 0,
      cgstAmount: 900,
      sgstAmount: 900,
      cessAmount: 0,
      gstRate: 18,
    }];
    const errors = validateGstr1(data, '032026');
    expect(errors).toEqual([]);
  });
});

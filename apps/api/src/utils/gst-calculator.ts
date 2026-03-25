import type { TaxCategory, TaxBreakdown, PlaceOfSupplyResult, InvoiceTaxSummary } from '@runq/types';
import { INDIAN_STATES, getStateCode } from './indian-states';

/**
 * Determines place of supply and whether the transaction is inter-state.
 * Uses state codes for comparison. Falls back to state name lookup.
 */
export function determinePlaceOfSupply(
  sellerStateCode: string,
  buyerStateCode: string,
): PlaceOfSupplyResult {
  const isInterState = sellerStateCode !== buyerStateCode;
  const stateName = INDIAN_STATES[buyerStateCode] ?? buyerStateCode;

  return {
    isInterState,
    placeOfSupply: stateName,
    placeOfSupplyCode: buyerStateCode,
  };
}

/**
 * Resolves a state code from either a code ("27") or name ("Maharashtra").
 */
export function resolveStateCode(stateOrCode: string): string {
  if (/^\d{2}$/.test(stateOrCode) && INDIAN_STATES[stateOrCode]) {
    return stateOrCode;
  }
  return getStateCode(stateOrCode) ?? stateOrCode;
}

interface LineItemTaxInput {
  amount: number;
  taxRate: number;
  isInterState: boolean;
  taxCategory: TaxCategory;
  cessRate?: number;
}

/**
 * Calculates tax breakdown for a single line item.
 * - Intra-state: CGST = rate/2, SGST = rate/2
 * - Inter-state: IGST = full rate
 * - Exempt/nil/zero: all tax = 0
 * - Reverse charge: amounts computed but flagged
 */
export function calculateLineItemTax(input: LineItemTaxInput): TaxBreakdown {
  const { amount, taxRate, isInterState, taxCategory, cessRate = 0 } = input;

  if (taxCategory === 'exempt' || taxCategory === 'nil_rated' || taxCategory === 'zero_rated') {
    return zeroTaxBreakdown(amount, taxRate);
  }

  const cessAmount = roundPaise(amount * cessRate / 100);

  if (isInterState) {
    const igstAmount = roundPaise(amount * taxRate / 100);
    return {
      taxableAmount: amount,
      taxRate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: taxRate,
      igstAmount,
      cessRate,
      cessAmount,
      totalTax: igstAmount + cessAmount,
    };
  }

  const halfRate = taxRate / 2;
  const cgstAmount = roundPaise(amount * halfRate / 100);
  const sgstAmount = roundPaise(amount * halfRate / 100);

  return {
    taxableAmount: amount,
    taxRate,
    cgstRate: halfRate,
    cgstAmount,
    sgstRate: halfRate,
    sgstAmount,
    igstRate: 0,
    igstAmount: 0,
    cessRate,
    cessAmount,
    totalTax: cgstAmount + sgstAmount + cessAmount,
  };
}

interface LineItemWithTax {
  amount: number;
  tax: TaxBreakdown;
}

/**
 * Aggregates tax across all line items into an invoice-level summary.
 */
export function calculateInvoiceTax(items: LineItemWithTax[]): InvoiceTaxSummary {
  let subtotal = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  let cessAmount = 0;

  for (const item of items) {
    subtotal += item.amount;
    cgstAmount += item.tax.cgstAmount;
    sgstAmount += item.tax.sgstAmount;
    igstAmount += item.tax.igstAmount;
    cessAmount += item.tax.cessAmount;
  }

  const taxAmount = roundPaise(cgstAmount + sgstAmount + igstAmount + cessAmount);

  return {
    subtotal: roundPaise(subtotal),
    cgstAmount: roundPaise(cgstAmount),
    sgstAmount: roundPaise(sgstAmount),
    igstAmount: roundPaise(igstAmount),
    cessAmount: roundPaise(cessAmount),
    taxAmount,
    totalAmount: roundPaise(subtotal + taxAmount),
  };
}

function zeroTaxBreakdown(amount: number, taxRate: number): TaxBreakdown {
  return {
    taxableAmount: amount,
    taxRate,
    cgstRate: 0, cgstAmount: 0,
    sgstRate: 0, sgstAmount: 0,
    igstRate: 0, igstAmount: 0,
    cessRate: 0, cessAmount: 0,
    totalTax: 0,
  };
}

/** Round to 2 decimal places (paise precision). */
function roundPaise(value: number): number {
  return Math.round(value * 100) / 100;
}

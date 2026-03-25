export type TaxCategory = 'taxable' | 'exempt' | 'nil_rated' | 'zero_rated' | 'reverse_charge';

export interface TaxBreakdown {
  taxableAmount: number;
  taxRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  cessRate: number;
  cessAmount: number;
  totalTax: number;
}

export interface PlaceOfSupplyResult {
  isInterState: boolean;
  placeOfSupply: string;
  placeOfSupplyCode: string;
}

export interface InvoiceTaxSummary {
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  taxAmount: number;
  totalAmount: number;
}

import type { Gstr1Data } from '@runq/db';

export interface ValidationError {
  section: string;
  field: string;
  message: string;
  invoiceNumber?: string;
}

const VALID_GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const INVOICE_NUM_REGEX = /^[a-zA-Z0-9\-/]{1,16}$/;

export function validateGstr1(data: Gstr1Data, period: string): ValidationError[] {
  const errors: ValidationError[] = [];

  validateB2B(data.b2b, errors);
  validateB2CS(data.b2cs, errors);
  validateB2CL(data.b2cl, errors);
  validateCDN(data.cdn, errors);
  validateHSN(data.hsn, errors);
  validateDocs(data.docs, errors);

  return errors;
}

function validateB2B(invoices: Gstr1Data['b2b'], errors: ValidationError[]): void {
  for (const inv of invoices) {
    if (!inv.buyerGstin || !GSTIN_REGEX.test(inv.buyerGstin)) {
      errors.push({
        section: 'B2B',
        field: 'buyerGstin',
        message: `Invalid buyer GSTIN: ${inv.buyerGstin}`,
        invoiceNumber: inv.invoiceNumber,
      });
    }

    if (!INVOICE_NUM_REGEX.test(inv.invoiceNumber)) {
      errors.push({
        section: 'B2B',
        field: 'invoiceNumber',
        message: `Invoice number must be 1-16 chars, alphanumeric/-/: ${inv.invoiceNumber}`,
        invoiceNumber: inv.invoiceNumber,
      });
    }

    if (!inv.placeOfSupply || !/^\d{2}$/.test(inv.placeOfSupply)) {
      errors.push({
        section: 'B2B',
        field: 'placeOfSupply',
        message: `Missing or invalid place of supply`,
        invoiceNumber: inv.invoiceNumber,
      });
    }

    if (inv.invoiceValue <= 0) {
      errors.push({
        section: 'B2B',
        field: 'invoiceValue',
        message: `Invoice value must be positive`,
        invoiceNumber: inv.invoiceNumber,
      });
    }

    for (const item of inv.items) {
      if (!VALID_GST_RATES.includes(item.gstRate)) {
        errors.push({
          section: 'B2B',
          field: 'gstRate',
          message: `Invalid GST rate ${item.gstRate}%. Valid: ${VALID_GST_RATES.join(', ')}`,
          invoiceNumber: inv.invoiceNumber,
        });
      }

      if (item.taxableValue <= 0) {
        errors.push({
          section: 'B2B',
          field: 'taxableValue',
          message: `Taxable value must be positive`,
          invoiceNumber: inv.invoiceNumber,
        });
      }
    }
  }
}

function validateB2CS(entries: Gstr1Data['b2cs'], errors: ValidationError[]): void {
  for (const e of entries) {
    if (!e.placeOfSupply || !/^\d{2}$/.test(e.placeOfSupply)) {
      errors.push({
        section: 'B2CS',
        field: 'placeOfSupply',
        message: `Missing or invalid place of supply: ${e.placeOfSupply}`,
      });
    }
    if (!VALID_GST_RATES.includes(e.gstRate)) {
      errors.push({
        section: 'B2CS',
        field: 'gstRate',
        message: `Invalid GST rate ${e.gstRate}%`,
      });
    }
  }
}

function validateB2CL(invoices: Gstr1Data['b2cl'], errors: ValidationError[]): void {
  for (const inv of invoices) {
    if (inv.invoiceValue <= 250000) {
      errors.push({
        section: 'B2CL',
        field: 'invoiceValue',
        message: `B2CL invoice must be > Rs 2.5 lakh: ${inv.invoiceNumber}`,
        invoiceNumber: inv.invoiceNumber,
      });
    }
    if (!inv.placeOfSupply || !/^\d{2}$/.test(inv.placeOfSupply)) {
      errors.push({
        section: 'B2CL',
        field: 'placeOfSupply',
        message: `Missing or invalid place of supply`,
        invoiceNumber: inv.invoiceNumber,
      });
    }
  }
}

function validateCDN(notes: Gstr1Data['cdn'], errors: ValidationError[]): void {
  for (const n of notes) {
    if (!n.buyerGstin || !GSTIN_REGEX.test(n.buyerGstin)) {
      errors.push({
        section: 'CDN',
        field: 'buyerGstin',
        message: `Invalid buyer GSTIN on note: ${n.noteNumber}`,
      });
    }
    if (!n.originalInvoiceNumber) {
      errors.push({
        section: 'CDN',
        field: 'originalInvoiceNumber',
        message: `Missing original invoice reference on note: ${n.noteNumber}`,
      });
    }
  }
}

function validateHSN(entries: Gstr1Data['hsn'], errors: ValidationError[]): void {
  for (const h of entries) {
    if (!h.hsnCode || h.hsnCode.length < 4) {
      errors.push({
        section: 'HSN',
        field: 'hsnCode',
        message: `HSN code must be at least 4 digits: "${h.hsnCode}" for ${h.description}`,
      });
    }
  }
}

function validateDocs(docs: Gstr1Data['docs'], errors: ValidationError[]): void {
  for (const d of docs) {
    if (d.netIssued < 0) {
      errors.push({
        section: 'Documents',
        field: 'netIssued',
        message: `Net issued cannot be negative for ${d.docType}`,
      });
    }
  }
}

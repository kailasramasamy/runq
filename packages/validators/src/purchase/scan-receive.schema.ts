import { z } from 'zod';

/**
 * PP Phase 5 — Scan-vendor-invoice-on-receive validators.
 *
 * Companion to receive.schema.ts. When the vendor delivers goods together
 * with the tax invoice, we scan the invoice (AI extraction), prefill the
 * receive form with the vendor's actual qty/rate, and post a single
 * combined GRN + Bill + JE. Vendor numbers are authoritative — no
 * variance gate, but PO snapshot is recorded for reporting.
 *
 * Lines carry an optional `poLineId`: NULL = off-PO line (substitution or
 * extra). At least one PO-matched line is required so the GRN keeps its
 * link to the PO.
 */

const scanReceiveLineSchema = z.object({
  /** PO line being fulfilled. NULL → off-PO line (is_off_po flag set). */
  poLineId: z.string().uuid().nullable(),
  /**
   * Vendor catalog row backing this line. NULL is allowed for off-PO lines
   * the AI extracted from the invoice but that don't exist in the vendor's
   * catalog yet — the server auto-creates a catalog row from `description`
   * inside the commit transaction so substitutions never get silently
   * dropped at receive time.
   */
  catalogItemId: z.string().uuid().nullable(),
  /** Vendor's qty, not PO's. Authoritative for inventory + JE. */
  qty: z.number().positive('Qty must be positive'),
  /** Vendor's unit rate, not PO's. Authoritative for JE valuation. */
  unitRate: z.number().nonnegative(),
  /** Per-line tax rate from the invoice (informational; bill totals drive JE). */
  taxRate: z.number().min(0).max(100).nullish(),
  hsnSacCode: z.string().max(20).nullish(),
  /**
   * Free-text description. Required when `catalogItemId` is NULL — used to
   * mint the auto-created catalog row on commit. Optional otherwise.
   */
  description: z.string().max(500).nullish(),
  batchNo: z.string().max(60).nullish(),
  mfgDate: z.string().date().nullish(),
  expiryDate: z.string().date().nullish(),
  serialNos: z.array(z.string().min(1)).nullish(),
  notes: z.string().nullish(),
});

const vendorInvoiceHeaderSchema = z.object({
  invoiceNumber: z.string().min(1, 'Vendor invoice number is required'),
  invoiceDate: z.string().date(),
  dueDate: z.string().date().nullish(),
  /** Bill subtotal (sum of line amounts before tax). */
  subtotal: z.number().nonnegative(),
  /** Total tax on the bill. CGST+SGST or IGST, depending on placeOfSupply. */
  taxAmount: z.number().nonnegative(),
  /** Grand total — drives the AP-Vendor credit. */
  totalAmount: z.number().positive(),
  placeOfSupply: z.string().max(60).nullish(),
  /** Drives CGST+SGST split (false) vs IGST (true). */
  isInterState: z.boolean().nullish(),
  reverseCharge: z.boolean().nullish(),
  tdsSection: z.string().max(20).nullish(),
  tdsAmount: z.number().nonnegative().nullish(),
});

export const scanReceiveAgainstPoSchema = z.object({
  warehouseId: z.string().uuid(),
  receivedDate: z.string().date(),
  vehicleNo: z.string().max(30).nullish(),
  lrNo: z.string().max(40).nullish(),
  notes: z.string().nullish(),
  vendorInvoice: vendorInvoiceHeaderSchema,
  lines: z.array(scanReceiveLineSchema)
    .min(1, 'At least one line required')
    .refine(
      (lines) => lines.some((l) => l.poLineId !== null),
      'At least one line must match a PO line — pure off-PO bills go through scan-import without a PO',
    )
    .refine(
      (lines) => lines.every((l) => l.catalogItemId !== null || (l.description?.trim().length ?? 0) > 0),
      'Off-PO lines need a description so a catalog row can be auto-created',
    ),
  /** When present, binds the previously-uploaded scan file as a bill attachment. */
  extractionId: z.string().uuid().nullish(),
  /** Raw AI output for the diff log — never persisted as bill data. */
  aiOutput: z.record(z.unknown()).nullish(),
});

export type ScanReceiveLineInput = z.infer<typeof scanReceiveLineSchema>;
export type ScanReceiveAgainstPoInput = z.infer<typeof scanReceiveAgainstPoSchema>;
export type VendorInvoiceHeaderInput = z.infer<typeof vendorInvoiceHeaderSchema>;

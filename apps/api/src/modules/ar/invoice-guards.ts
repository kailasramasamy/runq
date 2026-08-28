/**
 * When an issued invoice may still be edited, and when it has hardened.
 *
 * Two different kinds of immutability, and conflating them loses one:
 *
 *   • **Filed** — the invoice is inside a GSTR-1 already submitted to GSTN.
 *     Editing would silently desync the books from the filed return, so the
 *     only honest routes out are a credit note, a customer debit note, or a
 *     void.
 *
 *   • **IRN'd** — an e-invoice has been registered and carries an IRN. That
 *     document is immutable at the portal the moment it is generated, well
 *     before any return is filed, so a document that passes the filed check
 *     can still be untouchable.
 *
 * Shared rather than private to InvoiceService because the substitution lane
 * needs exactly the same answers, and a second copy of this logic would drift
 * the first time one of them learned a new rule.
 */

import { and, eq } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { gstReturnInvoices, gstReturns, salesInvoices } from '@runq/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Queryable = Db | any;

/** True once this invoice sits in a GSTR-1 that has been filed with GSTN. */
export async function isInFiledReturn(
  db: Queryable,
  tenantId: string,
  invoiceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: gstReturnInvoices.id })
    .from(gstReturnInvoices)
    .innerJoin(gstReturns, eq(gstReturns.id, gstReturnInvoices.returnId))
    .where(and(
      eq(gstReturnInvoices.tenantId, tenantId),
      eq(gstReturnInvoices.invoiceId, invoiceId),
      eq(gstReturns.status, 'filed'),
    ))
    .limit(1);
  return !!row;
}

/** True once an IRN exists — the e-invoice is registered and cannot change. */
export async function hasIrn(
  db: Queryable,
  tenantId: string,
  invoiceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ irnNumber: salesInvoices.irnNumber })
    .from(salesInvoices)
    .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, tenantId)))
    .limit(1);
  return !!row?.irnNumber;
}

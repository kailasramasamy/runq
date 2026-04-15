import { eq, and, inArray } from 'drizzle-orm';
import {
  salesInvoices,
  items,
  customers,
  invoiceImportItemAliases,
  invoiceImportCustomerAliases,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  CommitImportResult,
  ImportFormat,
  ParseFilesResult,
  ParsedInvoice,
} from '@runq/types';
import type { CommitInvoiceImportInput } from '@runq/validators';
import type { CreateSalesInvoiceInput } from '@runq/validators';
import { InvoiceService } from '../invoice.service';
import { InvoiceImportMatcherService } from './matcher.service';
import { invoiceImportParserService } from './parser.service';

/**
 * Extract a UOM / size suffix from an item name. Catches trailing
 * patterns like "500ml", "1000ml", "200g", "1kg", "1L", "500 ml".
 * Returns null when no recognisable suffix is found.
 */
function extractUomFromName(name: string): string | null {
  const m = name.match(/(\d+(?:\.\d+)?\s*(?:ml|g|kg|l|pcs|nos|ltr|litre|liter))\s*$/i);
  return m ? m[1]!.replace(/\s+/g, '').toLowerCase() : null;
}

/**
 * Top-level service for the invoice import feature. Wires the parser
 * cascade, the matcher, and the existing InvoiceService.create() into a
 * two-phase flow:
 *
 *   parseFiles()  → parses uploaded buffers, runs the matcher to enrich
 *                   each row with customer/item match results, returns
 *                   a stateless staging payload to the client
 *   commit()      → takes the (possibly mutated) payload back from the
 *                   client, validates each invoice, skips duplicates by
 *                   (tenant_id, invoice_number), and writes the survivors
 *                   via InvoiceService.create() with the source invoice
 *                   number preserved. Persists newly-confirmed name → ID
 *                   mappings into the alias tables for next time.
 *
 * Status policy: every imported invoice lands as 'draft'. The user can
 * bulk-mark as 'sent' from the AR list once they've eyeballed them.
 */
export class InvoiceImportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async parseFiles(
    files: { fileName: string; buffer: Buffer; mimeType?: string }[],
    format: ImportFormat = 'auto',
  ): Promise<ParseFilesResult> {
    const invoices: ParsedInvoice[] = [];
    const failedFiles: { fileName: string; error: string }[] = [];

    for (const f of files) {
      try {
        const parsed = await invoiceImportParserService.parseBuffer(
          f.buffer,
          f.fileName,
          format,
          f.mimeType ?? '',
        );
        invoices.push(...parsed);
      } catch (err) {
        failedFiles.push({ fileName: f.fileName, error: (err as Error).message });
      }
    }

    if (invoices.length > 0) {
      // Single matcher pass over all invoices: cheaper than per-invoice
      // queries because the matcher loads master + alias rows once.
      const matcher = new InvoiceImportMatcherService(this.db, this.tenantId);

      // Customer matches — dedupe by (sourceName, gstin) so we don't
      // pay for redundant scoring on multi-invoice imports for the same
      // buyer.
      const customerKey = (i: ParsedInvoice) =>
        `${i.customerSourceName}\u0000${i.customerSourceGstin ?? ''}`;
      const uniqueCustomers = Array.from(
        new Map(
          invoices.map((i) => [
            customerKey(i),
            { sourceName: i.customerSourceName, gstin: i.customerSourceGstin },
          ]),
        ),
      );
      const customerMatches = await matcher.matchCustomers(uniqueCustomers.map(([, v]) => v));
      const customerMatchByKey = new Map(
        uniqueCustomers.map(([k], idx) => [k, customerMatches[idx]!]),
      );

      // Item matches — same dedupe trick by source name.
      const uniqueItemNames = Array.from(
        new Set(invoices.flatMap((i) => i.lineItems.map((li) => li.sourceName))),
      );
      const itemMatches = await matcher.matchItems(uniqueItemNames);
      const itemMatchByName = new Map(uniqueItemNames.map((name, idx) => [name, itemMatches[idx]!]));

      for (const inv of invoices) {
        inv.customerMatch = customerMatchByKey.get(customerKey(inv))!;
        for (const li of inv.lineItems) {
          li.match = itemMatchByName.get(li.sourceName)!;
        }
      }
    }

    return { invoices, fileCount: files.length, failedFiles };
  }

  async commit(payload: CommitInvoiceImportInput, userId?: string): Promise<CommitImportResult> {
    const result: CommitImportResult = {
      created: [],
      skipped: [],
      errors: [],
      aliasesPersisted: 0,
    };

    // Pre-fetch the existing invoice numbers in the requested set so we
    // can skip duplicates without a DB roundtrip per invoice.
    const requestedNumbers = payload.invoices.map((i) => i.invoiceNumber);
    const existingRows = await this.db
      .select({ invoiceNumber: salesInvoices.invoiceNumber })
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.tenantId, this.tenantId),
          inArray(salesInvoices.invoiceNumber, requestedNumbers),
        ),
      );
    const existingSet = new Set(existingRows.map((r) => r.invoiceNumber));

    // Pre-fetch HSN codes for all matched item IDs in one shot. Lets
    // each line fall back to the master item's HSN when the source file
    // didn't carry one — common when importing from minimal templates.
    const matchedItemIds = new Set<string>();
    for (const inv of payload.invoices) {
      for (const li of inv.lineItems) {
        if (li.match.resolvedId) matchedItemIds.add(li.match.resolvedId);
      }
    }
    const itemRows =
      matchedItemIds.size > 0
        ? await this.db
            .select({ id: items.id, hsnSacCode: items.hsnSacCode, unit: items.unit })
            .from(items)
            .where(
              and(eq(items.tenantId, this.tenantId), inArray(items.id, [...matchedItemIds])),
            )
        : [];
    const masterHsnById = new Map(itemRows.map((r) => [r.id, r.hsnSacCode ?? null]));
    const masterUnitById = new Map(itemRows.map((r) => [r.id, r.unit ?? null]));

    // Pre-fetch customer payment terms so we can compute due dates from the
    // customer's contractual terms instead of the parser's 30-day default.
    const customerIds = new Set(
      payload.invoices.map((i) => i.customerMatch.resolvedId).filter(Boolean) as string[],
    );
    const customerRows =
      customerIds.size > 0
        ? await this.db
            .select({ id: customers.id, paymentTermsDays: customers.paymentTermsDays })
            .from(customers)
            .where(
              and(eq(customers.tenantId, this.tenantId), inArray(customers.id, [...customerIds])),
            )
        : [];
    const customerTermsById = new Map(customerRows.map((r) => [r.id, r.paymentTermsDays ?? 30]));

    const invoiceService = new InvoiceService(this.db, this.tenantId);
    const persistAliases = payload.persistAliases ?? true;

    for (const inv of payload.invoices) {
      // Skip duplicates first.
      if (existingSet.has(inv.invoiceNumber)) {
        result.skipped.push({
          invoiceNumber: inv.invoiceNumber,
          reason: 'Already exists in this tenant',
          sourceFile: inv.sourceFile,
        });
        continue;
      }

      // Refuse anything still missing matches — the staging UI should
      // have made the user resolve these before commit, but we belt-and-
      // braces here in case the client posted a stale payload.
      if (!inv.customerMatch.resolvedId) {
        result.errors.push({
          invoiceNumber: inv.invoiceNumber,
          error: `Customer "${inv.customerSourceName}" was not resolved`,
          sourceFile: inv.sourceFile,
        });
        continue;
      }
      const unmatchedItems = inv.lineItems.filter((li) => !li.match.resolvedId);
      if (unmatchedItems.length > 0) {
        result.errors.push({
          invoiceNumber: inv.invoiceNumber,
          error: `Unresolved items: ${unmatchedItems.map((li) => li.sourceName).join(', ')}`,
          sourceFile: inv.sourceFile,
        });
        continue;
      }

      // Build the InvoiceService.create() input. Note: subtotal/tax/total
      // here are pre-validation values; the service recomputes from the
      // items + GST logic and overrides them. We just need to pass values
      // that satisfy the zod schema (positive numbers).
      //
      // HSN fallback: if the source line didn't carry an HSN code but the
      // matched master item has one, use the master's. Items master is
      // the system of record for HSN/tax classification anyway.
      const lineItemsInput: CreateSalesInvoiceInput['items'] = inv.lineItems.map((li) => ({
        itemId: li.match.resolvedId!,
        description: li.match.resolvedName ?? li.sourceName,
        uom:
          (li.match.resolvedId ? masterUnitById.get(li.match.resolvedId) : null)
          ?? extractUomFromName(li.sourceName)
          ?? undefined,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.lineTotal,
        hsnSacCode:
          li.hsnSacCode ??
          (li.match.resolvedId ? masterHsnById.get(li.match.resolvedId) ?? undefined : undefined),
        taxRate: li.taxRate ?? undefined,
      }));
      const subtotal = inv.computedSubtotal;
      const taxAmount = Math.max(0, inv.sourceGrandTotal - subtotal);
      const totalAmount = inv.sourceGrandTotal > 0 ? inv.sourceGrandTotal : subtotal;

      // Recompute due date from the customer's contractual payment terms
      // instead of the parser's generic 30-day default.
      const custTerms = inv.customerMatch.resolvedId
        ? customerTermsById.get(inv.customerMatch.resolvedId) ?? 30
        : 30;
      const computedDueDate = (() => {
        const d = new Date(inv.invoiceDate + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + custTerms);
        return d.toISOString().slice(0, 10);
      })();

      const createInput: CreateSalesInvoiceInput = {
        customerId: inv.customerMatch.resolvedId,
        invoiceDate: inv.invoiceDate,
        dueDate: computedDueDate,
        items: lineItemsInput,
        subtotal,
        taxAmount,
        totalAmount,
        notes: inv.notes ?? undefined,
        poNumber: inv.poNumber ?? undefined,
        reverseCharge: false,
      };

      try {
        const created = await invoiceService.create(createInput, userId, {
          explicitInvoiceNumber: inv.invoiceNumber,
          skipCreditCheck: true,
        });
        result.created.push({
          invoiceNumber: created.invoiceNumber,
          invoiceId: created.id,
          sourceFile: inv.sourceFile,
        });

        if (persistAliases) {
          result.aliasesPersisted += await this.persistAliasesForInvoice(inv);
        }
      } catch (err) {
        result.errors.push({
          invoiceNumber: inv.invoiceNumber,
          error: (err as Error).message,
          sourceFile: inv.sourceFile,
        });
      }
    }

    // Sync the invoice sequence so the next manual invoice continues
    // after the highest imported number. We extract the sequence portion
    // by building a regex from the tenant's format template — this avoids
    // confusing the FY prefix (e.g. "26") with the actual sequence number.
    if (result.created.length > 0) {
      const maxSeq = await invoiceService.extractMaxSequence(
        result.created.map((c) => c.invoiceNumber),
      );
      if (maxSeq > 0) {
        await invoiceService.syncSequenceToAtLeast(maxSeq);
      }
    }

    return result;
  }

  /**
   * Persist any newly-confirmed name → master mappings into the alias
   * tables. Only persists rows whose match was *not* an exact-master hit
   * — those would already auto-resolve next time without an alias.
   *
   * Uses ON CONFLICT DO NOTHING (via the unique index) so re-running the
   * import is harmless.
   */
  private async persistAliasesForInvoice(inv: ParsedInvoice): Promise<number> {
    let count = 0;

    // Customer alias — store the source name (not the GSTIN, since GSTIN
    // is already a strong direct identifier).
    if (
      inv.customerMatch.resolvedId &&
      inv.customerMatch.source !== 'exact-master' &&
      inv.customerMatch.source !== 'gstin' &&
      inv.customerSourceName.trim()
    ) {
      const inserted = await this.db
        .insert(invoiceImportCustomerAliases)
        .values({
          tenantId: this.tenantId,
          sourceKey: inv.customerSourceName.trim(),
          customerId: inv.customerMatch.resolvedId,
        })
        .onConflictDoNothing()
        .returning({ id: invoiceImportCustomerAliases.id });
      count += inserted.length;
    }

    // Item aliases — one per line item where the source name didn't
    // already exact-match the master.
    for (const li of inv.lineItems) {
      if (
        li.match.resolvedId &&
        li.match.source !== 'exact-master' &&
        li.sourceName.trim()
      ) {
        const inserted = await this.db
          .insert(invoiceImportItemAliases)
          .values({
            tenantId: this.tenantId,
            sourceName: li.sourceName.trim(),
            itemId: li.match.resolvedId,
          })
          .onConflictDoNothing()
          .returning({ id: invoiceImportItemAliases.id });
        count += inserted.length;
      }
    }

    return count;
  }
}

import { eq, and, inArray } from 'drizzle-orm';
import {
  salesInvoices,
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
      const items: CreateSalesInvoiceInput['items'] = inv.lineItems.map((li) => ({
        itemId: li.match.resolvedId!,
        description: li.match.resolvedName ?? li.sourceName,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.lineTotal,
        hsnSacCode: li.hsnSacCode ?? undefined,
        taxRate: li.taxRate ?? undefined,
      }));
      const subtotal = inv.computedSubtotal;
      const taxAmount = Math.max(0, inv.sourceGrandTotal - subtotal);
      const totalAmount = inv.sourceGrandTotal > 0 ? inv.sourceGrandTotal : subtotal;

      const createInput: CreateSalesInvoiceInput = {
        customerId: inv.customerMatch.resolvedId,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        items,
        subtotal,
        taxAmount,
        totalAmount,
        notes: inv.notes ?? undefined,
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

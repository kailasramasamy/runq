/**
 * Shared types for the invoice import feature.
 *
 * The flow is two-phase:
 *   1. Client uploads files → server returns ParsedInvoice[] with match
 *      results (customer + items resolved or flagged as needing review).
 *   2. Client confirms (and inline-creates any missing masters) → server
 *      receives ImportPayload and writes the invoices via the existing
 *      InvoiceService.create(), persisting newly-confirmed mappings into
 *      the alias tables.
 *
 * Staging is stateless: the entire ParsedInvoice[] is round-tripped via
 * the client. The matcher returns confidence so the UI can flag low-
 * confidence guesses for review even when a candidate exists.
 */

export type ImportFormat =
  | 'auto'
  | 'generic-rows'
  | 'single-invoice-template'
  | 'heuristic'
  | 'ai';

export type MatchSource =
  | 'exact-master'
  | 'exact-alias'
  | 'gstin'
  | 'fuzzy-master'
  | 'fuzzy-alias'
  | 'unmatched';

export interface MatchResult {
  /** Resolved master ID, or null when no candidate was found / confirmed. */
  resolvedId: string | null;
  /** Where the match came from. 'unmatched' means the user must pick. */
  source: MatchSource;
  /** 0..1. 1.0 = exact, 0.0 = no candidate. UI flags <0.85 for review. */
  confidence: number;
  /** Human-readable name of the resolved master, when resolved. */
  resolvedName: string | null;
  /**
   * Suggested alternates the UI can offer in the dropdown when the user
   * wants to override the auto-pick. Best candidates first.
   */
  suggestions: { id: string; name: string; confidence: number }[];
}

export interface ParsedLineItem {
  /** Original item name as it appeared in the source file. */
  sourceName: string;
  quantity: number;
  unitPrice: number;
  /** Optional, if the source file had it. Item master HSN takes precedence on commit. */
  hsnSacCode: string | null;
  /** Optional, parsed from source. */
  taxRate: number | null;
  /** Computed from qty × unitPrice for sanity. */
  lineTotal: number;
  /** Resolved item match — null until commit time. */
  match: MatchResult;
}

export interface ParsedInvoice {
  /** Source file the invoice was parsed from (for traceability). */
  sourceFile: string;
  /** Which parser in the cascade produced this. */
  parserUsed: ImportFormat;
  invoiceNumber: string;
  invoiceDate: string;
  /** ISO date. Defaults to invoiceDate + 30d if the source omits it. */
  dueDate: string;
  poNumber: string | null;
  notes: string | null;
  /** Original buyer name/identifier as it appeared in the source. */
  customerSourceName: string;
  customerSourceGstin: string | null;
  /** Resolved customer match. */
  customerMatch: MatchResult;
  lineItems: ParsedLineItem[];
  /** Source file's grand total, used for cross-check vs computed total. */
  sourceGrandTotal: number;
  /** Computed from lineItems for cross-check. */
  computedSubtotal: number;
  /** True if the parser produced a complete row that can commit (assuming all matches resolve). */
  parseable: boolean;
  /** Human-readable error/warning lines for the staging UI. */
  warnings: string[];
}

export interface ParseFilesResult {
  invoices: ParsedInvoice[];
  /** Total file count, for the result banner. */
  fileCount: number;
  /** Files we couldn't parse at all (no parser succeeded). */
  failedFiles: { fileName: string; error: string }[];
}

/**
 * What the client sends back at commit time. The client may have
 * mutated each ParsedInvoice's match results (e.g. picked a different
 * item from a dropdown) and inline-created masters along the way.
 */
export interface CommitImportPayload {
  invoices: ParsedInvoice[];
  /**
   * Default status for newly-created invoices. Defaults to 'draft' on
   * the server if the client doesn't specify.
   */
  defaultStatus?: 'draft' | 'sent';
  /**
   * Persist any matches the user confirmed (resolvedId set, was previously
   * unmatched OR fuzzy/low-confidence) into the alias tables so future
   * imports auto-map. Defaults to true.
   */
  persistAliases?: boolean;
}

export interface CommitImportResult {
  created: { invoiceNumber: string; invoiceId: string; sourceFile: string }[];
  skipped: { invoiceNumber: string; reason: string; sourceFile: string }[];
  errors: { invoiceNumber: string | null; error: string; sourceFile: string }[];
  /** How many alias rows were inserted. */
  aliasesPersisted: number;
}

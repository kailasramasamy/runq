import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  decimal,
  jsonb,
  timestamp,
  date,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from '../tenant';
import { users } from '../user';
import { customers } from './customers';
import { salesInvoices } from './invoices';
import { items } from '../masters/items';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const poSourceChannelEnum = pgEnum('po_source_channel', [
  'share_sheet',   // Android PWA share target (mobile)
  'web_drop',      // desktop drag-and-drop into inbox
  'web_upload',    // desktop click-to-browse
  'paste_image',   // Cmd+V image (screenshot, copied chat image)
  'paste_text',    // Cmd+V text (chat snippet, free-text PO)
  'email_forward', // future: forwarded email ingestion (Phase 4)
]);

export const poUploadStatusEnum = pgEnum('po_upload_status', [
  'pending',      // file persisted, waiting to be parsed
  'parsing',      // LLM extraction in progress
  'parsed',       // extraction succeeded → po_drafts row exists
  'parse_error',  // extraction failed → see errorMessage
  'discarded',    // user dismissed without processing
]);

export const poDraftReviewStatusEnum = pgEnum('po_draft_review_status', [
  'parsing',      // mirrors po_uploads.parsing — kept for the join-free inbox query
  'ready',        // high confidence on customer + all line items, one-tap approve
  'needs_review', // something flagged: unmatched SKU, missing customer, etc.
  'error',        // parse-time error surfaced into the draft (rare)
  'approved',     // converted to a draft sales_invoices row
  'rejected',     // user rejected the draft
]);

export const poCustomerMatchSourceEnum = pgEnum('po_customer_match_source', [
  'gstin',
  'phone',
  'name_fuzzy',
  'manual',
]);

export const poItemMatchSourceEnum = pgEnum('po_item_match_source', [
  'alias',       // hit on customer_sku_aliases (the moat)
  'name_fuzzy',  // ilike match on items.name
  'manual',      // user-picked in review screen
]);

// ─── po_uploads ────────────────────────────────────────────────────────────
// Raw incoming PO. One row per file/text submission.
// Either (storageKey + file*) is set OR rawText is set, never both blank.

export const poUploads = pgTable(
  'po_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    uploadedBy: uuid('uploaded_by').references(() => users.id),

    source: poSourceChannelEnum('source').notNull(),
    // free-form context — e.g. { whatsappGroup: "VD Daily Orders", originalFilename: "order.pdf" }
    sourceMetadata: jsonb('source_metadata'),

    // File storage (nullable for paste_text)
    storageKey: varchar('storage_key', { length: 500 }),
    fileName: varchar('file_name', { length: 255 }),
    fileSize: integer('file_size'),
    fileMime: varchar('file_mime', { length: 100 }),
    fileHash: varchar('file_hash', { length: 64 }), // SHA-256 hex for dedup

    // Pasted text (nullable for file uploads)
    rawText: text('raw_text'),

    // Pipeline state
    status: poUploadStatusEnum('status').notNull().default('pending'),
    errorMessage: text('error_message'),
    parsedAt: timestamp('parsed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_po_uploads_tenant_status').on(t.tenantId, t.status),
    index('idx_po_uploads_tenant_created').on(t.tenantId, t.createdAt),
    index('idx_po_uploads_tenant_hash').on(t.tenantId, t.fileHash),
  ],
);

// ─── po_drafts ─────────────────────────────────────────────────────────────
// Extracted/normalized PO ready for human review and approval.

export const poDrafts = pgTable(
  'po_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    poUploadId: uuid('po_upload_id')
      .notNull()
      .references(() => poUploads.id, { onDelete: 'cascade' }),

    // Customer match
    customerId: uuid('customer_id').references(() => customers.id),
    customerMatchSource: poCustomerMatchSourceEnum('customer_match_source'),
    customerMatchConfidence: decimal('customer_match_confidence', { precision: 3, scale: 2 }),
    buyerGstinRaw: varchar('buyer_gstin_raw', { length: 15 }),
    buyerNameRaw: varchar('buyer_name_raw', { length: 255 }),

    // Header fields extracted from the PO
    poNumberExtracted: varchar('po_number_extracted', { length: 100 }),
    poDate: date('po_date'),
    deliveryDate: date('delivery_date'),

    // Totals (resolved against price-list rates, may differ from raw PO values)
    subtotal: decimal('subtotal', { precision: 15, scale: 2 }),
    taxTotal: decimal('tax_total', { precision: 15, scale: 2 }),
    grandTotal: decimal('grand_total', { precision: 15, scale: 2 }),

    // Audit / reprocessing
    rawExtraction: jsonb('raw_extraction'),
    llmModel: varchar('llm_model', { length: 100 }),

    // Review state
    reviewStatus: poDraftReviewStatusEnum('review_status').notNull().default('parsing'),
    // [{ type: 'unmatched_sku', lineIndex: 2 }, { type: 'no_customer' }]
    reviewFlags: jsonb('review_flags'),

    // Approval (Phase 3 wires this to InvoiceService.create with status='draft')
    approvedInvoiceId: uuid('approved_invoice_id').references(() => salesInvoices.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),

    // Rejection
    rejectedReason: text('rejected_reason'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by').references(() => users.id),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_po_drafts_tenant_status').on(t.tenantId, t.reviewStatus),
    index('idx_po_drafts_tenant_customer').on(t.tenantId, t.customerId),
    index('idx_po_drafts_upload').on(t.poUploadId),
  ],
);

// ─── po_draft_lines ────────────────────────────────────────────────────────
// Line items extracted from the PO. Kept separate from sales_invoice_items
// so the raw extraction is preserved even after the invoice is created
// (important for dispute resolution).

export const poDraftLines = pgTable(
  'po_draft_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    poDraftId: uuid('po_draft_id')
      .notNull()
      .references(() => poDrafts.id, { onDelete: 'cascade' }),

    lineIndex: integer('line_index').notNull(),

    // Raw — exactly what was extracted from the PO
    rawDescription: text('raw_description').notNull(),
    rawQty: decimal('raw_qty', { precision: 12, scale: 3 }),
    rawUom: varchar('raw_uom', { length: 20 }),
    rawRate: decimal('raw_rate', { precision: 15, scale: 2 }),

    // Item match
    matchedItemId: uuid('matched_item_id').references(() => items.id),
    matchSource: poItemMatchSourceEnum('match_source'),
    matchConfidence: decimal('match_confidence', { precision: 3, scale: 2 }),

    // Resolved — what we'd actually invoice (rate from PriceResolverService)
    resolvedRate: decimal('resolved_rate', { precision: 15, scale: 2 }),
    resolvedUom: varchar('resolved_uom', { length: 20 }),
    taxCategory: varchar('tax_category', { length: 50 }),
    amount: decimal('amount', { precision: 15, scale: 2 }),

    // 'unmatched' | 'rate_overridden' | 'qty_unusual' | null
    reviewFlag: varchar('review_flag', { length: 50 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_po_draft_lines_draft').on(t.poDraftId),
    index('idx_po_draft_lines_tenant_item').on(t.tenantId, t.matchedItemId),
  ],
);

// ─── customer_sku_aliases ──────────────────────────────────────────────────
// Per-customer SKU alias learning. Application code lowercases aliasText
// before both insert and lookup so the unique index is effectively
// case-insensitive without needing a functional index.

export const customerSkuAliases = pgTable(
  'customer_sku_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    aliasText: varchar('alias_text', { length: 255 }).notNull(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id),
    useCount: integer('use_count').notNull().default(1),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_csa_tenant_customer_alias').on(t.tenantId, t.customerId, t.aliasText),
    index('idx_csa_tenant_customer').on(t.tenantId, t.customerId),
  ],
);
